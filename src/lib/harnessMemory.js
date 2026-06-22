import { readJsonStorage, writeStringStorage } from './persistentStore';

export const HARNESS_MEMORY_KEY = 'perci_harness_memory';
const MAX_MEMORY_ITEMS = 120;
const MAX_RETRIEVED_ITEMS = 6;

export function readHarnessMemory() {
    const saved = readJsonStorage(HARNESS_MEMORY_KEY, []);
    return Array.isArray(saved) ? saved.map(normalizeMemoryItem).filter(Boolean) : [];
}

export function saveHarnessMemory(items) {
    const normalized = Array.isArray(items)
        ? items.map(normalizeMemoryItem).filter(Boolean).slice(0, MAX_MEMORY_ITEMS)
        : [];
    writeStringStorage(HARNESS_MEMORY_KEY, JSON.stringify(normalized));
    return normalized;
}

export function addHarnessMemory(item) {
    const now = new Date().toISOString();
    const existing = readHarnessMemory();
    const quality = evaluateMemoryQuality(item?.text || '', {
        scope: item?.scope,
        sourceType: item?.sourceType,
        existing
    });
    if (!item?.force && quality.score < 4) return existing;

    const normalized = normalizeMemoryItem({
        id: `memory-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: now,
        updatedAt: now,
        ...item,
        quality
    });
    if (!normalized) return existing;

    const withoutDuplicate = existing.filter(memory => (
        memory.sourceRunId !== normalized.sourceRunId
            && (
                memory.text.toLowerCase() !== normalized.text.toLowerCase()
                || memory.scope !== normalized.scope
            )
    ));
    return saveHarnessMemory([normalized, ...withoutDuplicate]);
}

export function ingestRunMemory(run, options = {}) {
    if (!run || !['completed', 'blocked', 'cancelled'].includes(run.status)) return null;
    const sourceType = getRunSourceType(run);
    const shouldIngest = options.force || ['terminal', 'cowork', 'code', 'build', 'gateway'].includes(sourceType);
    if (!shouldIngest) return null;

    const commands = Array.isArray(run.commands) ? run.commands.slice(0, 4) : [];
    const files = Array.isArray(run.files) ? run.files.slice(0, 8) : [];
    const latestEvent = Array.isArray(run.events) ? run.events[0] : null;
    const validation = run.validation?.summary || run.validation?.status || '';
    const usefulSignals = [
        run.status === 'blocked',
        run.status === 'cancelled' && latestEvent?.detail,
        commands.length > 0,
        files.length > 0,
        validation,
        latestEvent?.detail && !isGenericOutcome(latestEvent.detail)
    ].some(Boolean);
    if (!usefulSignals) return null;

    const text = [
        `${run.title} ended as ${run.status}.`,
        run.objective ? `Objective: ${run.objective}` : '',
        latestEvent?.detail ? `Outcome: ${latestEvent.detail}` : '',
        commands.length ? `Commands: ${commands.join('; ')}` : '',
        files.length ? `Context: ${files.join(', ')}` : '',
        validation ? `Validation: ${validation}` : '',
        run.next ? `Next: ${run.next}` : ''
    ].filter(Boolean).join(' ');

    if (text.length < 32) return null;
    const quality = evaluateMemoryQuality(text, {
        scope: run.workingDirectory || 'global',
        sourceType,
        existing: readHarnessMemory()
    });
    if (quality.score < 4) return null;

    const memory = {
        scope: run.workingDirectory || 'global',
        sourceRunId: run.id,
        sourceType,
        title: run.title,
        status: run.status,
        tags: Array.from(new Set([sourceType, run.status, ...(files.map(file => file.split('/').pop()).filter(Boolean))])).slice(0, 12),
        quality,
        text
    };
    addHarnessMemory(memory);
    return memory;
}

export function retrieveHarnessMemory(query = '', options = {}) {
    const scope = options.scope || '';
    const sourceTypes = new Set(options.sourceTypes || []);
    const terms = tokenize([query, scope, ...(options.files || [])].join(' '));
    const memories = readHarnessMemory()
        .filter(memory => !sourceTypes.size || sourceTypes.has(memory.sourceType))
        .map(memory => ({ memory, score: scoreMemory(memory, terms, scope) }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || new Date(b.memory.updatedAt || b.memory.createdAt).getTime() - new Date(a.memory.updatedAt || a.memory.createdAt).getTime())
        .slice(0, options.limit || MAX_RETRIEVED_ITEMS)
        .map(item => item.memory);
    return memories;
}

export function buildMemoryPrompt(query, options = {}) {
    const memories = retrieveHarnessMemory(query, options);
    if (memories.length === 0) {
        return {
            memories,
            prompt: 'Relevant durable Perci memory: none found for this request.'
        };
    }
    const lines = memories.map((memory, index) => `${index + 1}. [${memory.sourceType}/${memory.status}] ${memory.text}`);
    return {
        memories,
        prompt: `Relevant durable Perci memory:\n${lines.join('\n')}`
    };
}

export function evaluateMemoryQuality(text, options = {}) {
    const value = String(text || '').trim();
    const reasons = [];
    let score = 0;

    if (value.length >= 80 && value.length <= 700) {
        score += 2;
        reasons.push('concise');
    } else if (value.length >= 32) {
        score += 1;
        reasons.push(value.length > 700 ? 'too long' : 'short');
    } else {
        reasons.push('too short');
    }

    if (/\b(next|fix|retry|run|verify|validate|restart|choose|avoid|use|keep|check)\b/i.test(value)) {
        score += 2;
        reasons.push('actionable');
    }

    if (/(\/|src\/|localStorage:|https?:|[A-Z0-9_]{4,}|\.jsx?|\.tsx?|\.cjs|\.json)/.test(value)) {
        score += 2;
        reasons.push('specific context');
    }

    if (/\b(blocked|failed|cancelled|completed|generated|wrote|saved|exit code|provider|gateway|validation)\b/i.test(value)) {
        score += 1;
        reasons.push('outcome');
    }

    if (isGenericOutcome(value)) {
        score -= 3;
        reasons.push('generic outcome');
    }

    const existing = Array.isArray(options.existing) ? options.existing : [];
    const normalizedValue = normalizeForComparison(value);
    const duplicate = existing.some(memory => (
        normalizeForComparison(memory.text) === normalizedValue
        || (memory.scope === options.scope && memory.sourceType === options.sourceType && textOverlap(memory.text, value) > 0.82)
    ));
    if (duplicate) {
        score -= 3;
        reasons.push('duplicate');
    }

    return {
        score: Math.max(0, Math.min(8, score)),
        verdict: score >= 6 ? 'strong' : score >= 4 ? 'review' : 'weak',
        reasons: Array.from(new Set(reasons)).slice(0, 6)
    };
}

function normalizeMemoryItem(item) {
    if (!item || typeof item !== 'object') return null;
    const text = String(item.text || '').trim();
    if (!text) return null;
    return {
        id: item.id || `memory-${Date.now()}`,
        scope: item.scope || 'global',
        sourceRunId: item.sourceRunId || null,
        sourceType: item.sourceType || 'general',
        title: item.title || 'Memory note',
        status: item.status || 'saved',
        tags: Array.isArray(item.tags) ? item.tags.slice(0, 20) : [],
        quality: item.quality && typeof item.quality === 'object' ? item.quality : null,
        text,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: item.updatedAt || item.createdAt || new Date().toISOString()
    };
}

function scoreMemory(memory, terms, scope) {
    const haystack = tokenize([
        memory.title,
        memory.text,
        memory.scope,
        memory.sourceType,
        ...(memory.tags || [])
    ].join(' '));
    let score = 0;
    for (const term of terms) {
        if (haystack.has(term)) score += term.length > 4 ? 3 : 1;
    }
    if (scope && memory.scope === scope) score += 8;
    if (scope && memory.scope && scope.startsWith(memory.scope)) score += 3;
    if (memory.status === 'blocked') score += 1;
    return score;
}

function tokenize(value) {
    return new Set(String(value || '')
        .toLowerCase()
        .split(/[^a-z0-9_./-]+/)
        .map(term => term.trim())
        .filter(term => term.length > 2));
}

function isGenericOutcome(value) {
    const text = String(value || '').trim().toLowerCase();
    return [
        'assistant response was recorded.',
        'final assistant response was recorded.',
        'command exited with code 0.'
    ].includes(text);
}

function normalizeForComparison(value) {
    return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function textOverlap(a, b) {
    const left = tokenize(a);
    const right = tokenize(b);
    if (!left.size || !right.size) return 0;
    let shared = 0;
    for (const term of left) {
        if (right.has(term)) shared += 1;
    }
    return shared / Math.min(left.size, right.size);
}

function getRunSourceType(run) {
    if (run.id === 'mission-openclaw-health' || run.gateway) return 'gateway';
    if (run.id?.startsWith('terminal-') || run.agent === 'Perci Terminal') return 'terminal';
    if (run.id?.startsWith('cowork-') || run.agent === 'Perci Cowork Agent') return 'cowork';
    if (run.id?.startsWith('code-') || run.agent === 'Perci Code Assistant' || run.agent === 'Perci Code Editor') return 'code';
    if (run.id?.startsWith('build-') || run.agent === 'Perci Build Assistant') return 'build';
    return 'general';
}
