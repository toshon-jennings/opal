import { MODES, WINDOW_TITLES } from '../context/ModeContext';
import { readJsonStorage, readStringStorage, writeStringStorage } from './persistentStore';

export const BARS_IDEAS_KEY = 'perci_bars_ideas:v1';
export const BILLBOARD_SERVICES_KEY = 'perci_concerns:v1';
export const PERCI_DESK_TASKS_KEY = 'perci_desk_tasks:v1';

const BARS_ACTIVE_STATUSES = new Set(['Inbox', 'New', 'Exploring', 'Building']);
const BARS_ATTENTION_STATUSES = new Set(['Inbox', 'Building']);
const BILLBOARD_ACTIVE_STATUSES = new Set(['active', 'paused']);
const UPCOMING_DAYS = 14;

export function readPerciDeskTasks() {
    const saved = readJsonStorage(PERCI_DESK_TASKS_KEY, []);
    return Array.isArray(saved) ? saved.map(normalizeManualTask).filter(Boolean) : [];
}

export function savePerciDeskTasks(tasks) {
    const normalized = Array.isArray(tasks) ? tasks.map(normalizeManualTask).filter(Boolean) : [];
    writeStringStorage(PERCI_DESK_TASKS_KEY, JSON.stringify(normalized));
    return normalized;
}

export function createManualTask(text) {
    const title = String(text || '').trim();
    if (!title) return null;
    const now = new Date().toISOString();
    return normalizeManualTask({
        id: `desk-task-${Date.now()}`,
        title,
        status: 'now',
        sourceType: 'manual',
        sourceLabel: 'Perci Desk',
        createdAt: now,
        updatedAt: now,
    });
}

export function createPerciContextSnapshot({
    windows = [],
    missionRuns = [],
    agentJobs = [],
    openClawStatus = {},
    manualTasks = readPerciDeskTasks(),
    now = new Date(),
} = {}) {
    const bars = readBarsProvider();
    const billboard = readBillboardProvider(now);
    const live = readLiveProvider({ windows, missionRuns, agentJobs, openClawStatus });
    const manual = normalizeManualTaskProvider(manualTasks);
    const obligations = [
        ...manual.obligations,
        ...bars.obligations,
        ...billboard.obligations,
        ...live.obligations,
    ].sort(compareObligations);

    return {
        id: `perci-context-${Date.now()}`,
        createdAt: new Date().toISOString(),
        providers: [bars.summary, billboard.summary, live.summary, manual.summary],
        bars,
        billboard,
        live,
        manual,
        obligations,
        counts: {
            obligations: obligations.length,
            now: obligations.filter(item => item.status === 'now').length,
            overdue: obligations.filter(item => item.status === 'overdue').length,
            waiting: obligations.filter(item => item.status === 'waiting').length,
            done: manual.tasks.filter(item => item.status === 'done').length,
        },
    };
}

export function answerPerciQuestion(question, snapshot) {
    const normalized = String(question || '').trim().toLowerCase();
    if (!normalized) {
        return {
            title: 'Perci is watching the active desk',
            body: 'Ask about Bars, Bill Board, overdue work, or what needs action now.',
            items: snapshot.obligations.slice(0, 5),
        };
    }

    if (normalized.includes('last') && normalized.includes('bars')) {
        const idea = snapshot.bars.lastIdea;
        return {
            title: idea ? 'Last thing in BARS' : 'No BARS entries found',
            body: idea
                ? `${idea.title}${idea.notes && idea.notes !== idea.title ? ` - ${trimText(idea.notes, 180)}` : ''}`
                : 'Perci did not find saved BARS ideas in local storage.',
            items: idea ? [sourceItemFromIdea(idea)] : [],
        };
    }

    if (normalized.includes('bill') || normalized.includes('subscription') || normalized.includes('service')) {
        const items = snapshot.billboard.obligations.slice(0, 8);
        return {
            title: items.length ? 'Bill Board actions' : 'No Bill Board actions',
            body: items.length
                ? `${items.length} Bill Board item${items.length === 1 ? '' : 's'} need attention or are coming up.`
                : 'No overdue or upcoming Bill Board items were found.',
            items,
        };
    }

    if (normalized.includes('overdue') || normalized.includes('supposed')) {
        const items = snapshot.obligations.filter(item => item.status === 'overdue').slice(0, 8);
        return {
            title: items.length ? 'Overdue in Perci' : 'Nothing overdue',
            body: items.length ? `${items.length} item${items.length === 1 ? '' : 's'} are past due.` : 'No overdue obligations are visible to Perci Desk right now.',
            items,
        };
    }

    if (normalized.includes('waiting') || normalized.includes('blocked')) {
        const items = snapshot.obligations.filter(item => item.status === 'waiting' || item.status === 'blocked').slice(0, 8);
        return {
            title: items.length ? 'Waiting or blocked' : 'Nothing waiting',
            body: items.length ? 'These items need a validation, unblock, or external result.' : 'No waiting or blocked items are visible right now.',
            items,
        };
    }

    const items = snapshot.obligations.filter(item => item.status !== 'done').slice(0, 8);
    return {
        title: items.length ? 'What needs action now' : 'No action items',
        body: items.length
            ? `Perci sees ${items.length} active item${items.length === 1 ? '' : 's'} across its current context providers.`
            : 'No live obligations are visible yet.',
        items,
    };
}

function readBarsProvider() {
    const ideas = safeJson(readStringStorage(BARS_IDEAS_KEY, '[]'), []).map(normalizeIdea).filter(Boolean);
    const sorted = [...ideas].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const lastIdea = sorted[0] || null;
    const obligations = sorted
        .filter(idea => BARS_ACTIVE_STATUSES.has(idea.status))
        .slice(0, 12)
        .map(idea => ({
            id: `bars-${idea.id}`,
            title: idea.next || idea.title,
            status: BARS_ATTENTION_STATUSES.has(idea.status) ? 'now' : 'waiting',
            priority: scoreIdea(idea),
            sourceType: 'bars',
            sourceId: idea.id,
            sourceLabel: 'BARS',
            reason: idea.status === 'Inbox' ? 'Captured but not shaped yet' : `${idea.status} idea in BARS`,
            suggestedAction: idea.next || 'Open BARS and decide the next action.',
            updatedAt: idea.updatedAt,
        }));

    return {
        id: 'bars',
        label: 'BARS',
        lastIdea,
        ideas: sorted,
        obligations,
        summary: {
            id: 'bars',
            label: 'BARS',
            surfaceId: MODES.BARS,
            status: lastIdea ? 'connected' : 'empty',
            detail: lastIdea ? `Last entry: ${lastIdea.title}` : 'No saved ideas',
            count: ideas.length,
        },
    };
}

function readBillboardProvider(now) {
    const services = safeJson(readStringStorage(BILLBOARD_SERVICES_KEY, '[]'), []).map(normalizeService).filter(Boolean);
    const activeServices = services.filter(service => BILLBOARD_ACTIVE_STATUSES.has(service.status));
    const obligations = activeServices
        .map(service => {
            const days = daysUntil(service.nextBillingDate, now);
            if (days === null) return null;
            if (days > UPCOMING_DAYS) return null;
            return {
                id: `billboard-${service.id}`,
                title: `${service.name} ${days < 0 ? 'is overdue' : days === 0 ? 'is due today' : `is due in ${days}d`}`,
                status: days < 0 ? 'overdue' : 'now',
                priority: days < 0 ? 100 + Math.abs(days) : 80 - days,
                dueAt: service.nextBillingDate,
                sourceType: 'billboard',
                sourceId: service.id,
                sourceLabel: 'Bill Board',
                reason: `${service.billingCycle} ${formatCost(service.monthlyCost)} service`,
                suggestedAction: days < 0 ? 'Review the overdue billing date.' : 'Confirm it is expected or update the billing date.',
                updatedAt: service.updatedAt,
            };
        })
        .filter(Boolean);

    return {
        id: 'billboard',
        label: 'Bill Board',
        services,
        obligations,
        monthlyCost: activeServices.reduce((sum, service) => sum + monthlyEquivalent(service), 0),
        summary: {
            id: 'billboard',
            label: 'Bill Board',
            surfaceId: MODES.CONCERNS,
            status: services.length ? 'connected' : 'empty',
            detail: services.length ? `${activeServices.length} active services` : 'No services saved',
            count: services.length,
        },
    };
}

function readLiveProvider({ windows, missionRuns, agentJobs, openClawStatus }) {
    const activeMissionRuns = missionRuns.filter(run => ['running', 'waiting', 'needs_validation'].includes(run.status));
    const attentionMissionRuns = missionRuns.filter(run => ['blocked', 'failed', 'error'].includes(run.status));
    const activeAgentJobs = agentJobs.filter(job => ['pending', 'claimed', 'running', 'retry_queued'].includes(job.status));
    const attentionAgentJobs = agentJobs.filter(job => ['failed', 'cancelled', 'blocked', 'denied'].includes(job.status));
    const obligations = [
        ...attentionMissionRuns.map(run => compactLiveObligation(run, 'mission', 'blocked')),
        ...activeMissionRuns.map(run => compactLiveObligation(run, 'mission', run.status === 'needs_validation' ? 'now' : 'waiting')),
        ...attentionAgentJobs.map(job => compactLiveObligation(job, 'agent_job', 'blocked')),
        ...activeAgentJobs.map(job => compactLiveObligation(job, 'agent_job', 'waiting')),
    ];

    if (openClawStatus?.state === 'offline' || openClawStatus?.state === 'unsupported') {
        obligations.unshift({
            id: 'openclaw-status',
            title: 'OpenClaw gateway needs attention',
            status: 'blocked',
            priority: 90,
            sourceType: 'openclaw',
            sourceId: 'openclaw',
            sourceLabel: 'OpenClaw',
            reason: openClawStatus.result?.error || 'Gateway is not online',
            suggestedAction: 'Open OpenClaw or check the local gateway.',
            updatedAt: openClawStatus.checkedAt || null,
        });
    }

    return {
        id: 'live',
        label: 'Live Perci',
        openWindows: windows.map(windowState => ({
            id: windowState.id,
            modeId: windowState.modeId,
            title: WINDOW_TITLES[windowState.modeId] || windowState.title || windowState.modeId,
            state: windowState.state || 'normal',
        })),
        obligations,
        summary: {
            id: 'live',
            label: 'Live Perci',
            surfaceId: MODES.PERCI_NOW,
            status: obligations.length ? 'active' : 'quiet',
            detail: `${windows.length} open window${windows.length === 1 ? '' : 's'}`,
            count: windows.length,
        },
    };
}

function normalizeManualTaskProvider(tasks) {
    const normalized = tasks.map(normalizeManualTask).filter(Boolean);
    return {
        id: 'manual',
        label: 'Manual Tasks',
        tasks: normalized,
        obligations: normalized.filter(task => task.status !== 'done'),
        summary: {
            id: 'manual',
            label: 'Manual Tasks',
            surfaceId: null,
            status: normalized.length ? 'connected' : 'empty',
            detail: `${normalized.filter(task => task.status !== 'done').length} open manual task${normalized.filter(task => task.status !== 'done').length === 1 ? '' : 's'}`,
            count: normalized.length,
        },
    };
}

function normalizeManualTask(task) {
    if (!task || typeof task !== 'object') return null;
    const title = String(task.title || '').trim();
    if (!title) return null;
    return {
        id: task.id || `desk-task-${Date.now()}`,
        title,
        status: task.status === 'done' ? 'done' : 'now',
        priority: Number(task.priority) || 70,
        sourceType: 'manual',
        sourceId: task.id || '',
        sourceLabel: 'Perci Desk',
        reason: task.reason || 'Added manually',
        suggestedAction: task.suggestedAction || 'Do this directly.',
        createdAt: task.createdAt || new Date().toISOString(),
        updatedAt: task.updatedAt || task.createdAt || new Date().toISOString(),
    };
}

function compactLiveObligation(item, sourceType, status) {
    const title = item.title || item.prompt || item.request_type || 'Untitled work';
    return {
        id: `${sourceType}-${item.id}`,
        title,
        status,
        priority: status === 'blocked' ? 92 : 60,
        sourceType,
        sourceId: item.id,
        sourceLabel: sourceType === 'mission' ? 'Mission' : 'Agents',
        reason: item.status || 'active',
        suggestedAction: status === 'blocked' ? 'Review and unblock this run.' : 'Monitor or validate the active work.',
        updatedAt: item.updatedAt || item.updated_at || item.created_at || null,
    };
}

function normalizeIdea(idea = {}) {
    if (!idea || typeof idea !== 'object') return null;
    return {
        id: String(idea.id || crypto.randomUUID()),
        title: String(idea.title || 'Untitled').trim() || 'Untitled',
        notes: String(idea.notes || ''),
        status: String(idea.status || 'New'),
        category: String(idea.category || idea.kind || ''),
        impact: Number(idea.impact) || 3,
        effort: Number(idea.effort) || 3,
        next: String(idea.next || ''),
        tags: Array.isArray(idea.tags) ? idea.tags.map(String).filter(Boolean) : [],
        createdAt: idea.createdAt || new Date().toISOString(),
        updatedAt: idea.updatedAt || idea.createdAt || new Date().toISOString(),
    };
}

function normalizeService(service = {}) {
    if (!service || typeof service !== 'object') return null;
    return {
        id: String(service.id || crypto.randomUUID()),
        name: String(service.name || 'Untitled service').trim() || 'Untitled service',
        status: String(service.status || 'active'),
        billingCycle: String(service.billingCycle || 'monthly'),
        monthlyCost: Number(service.monthlyCost) || 0,
        nextBillingDate: String(service.nextBillingDate || ''),
        category: String(service.category || ''),
        purpose: String(service.purpose || ''),
        notes: String(service.notes || ''),
        tags: Array.isArray(service.tags) ? service.tags.map(String).filter(Boolean) : [],
        createdAt: service.createdAt || '',
        updatedAt: service.updatedAt || service.createdAt || '',
    };
}

function sourceItemFromIdea(idea) {
    return {
        id: `bars-last-${idea.id}`,
        title: idea.title,
        status: 'now',
        priority: scoreIdea(idea),
        sourceType: 'bars',
        sourceId: idea.id,
        sourceLabel: 'BARS',
        reason: idea.status,
        suggestedAction: idea.next || 'Open BARS to continue from this entry.',
        updatedAt: idea.updatedAt,
    };
}

function compareObligations(a, b) {
    const statusWeight = { overdue: 4, blocked: 3, now: 2, waiting: 1, done: 0 };
    return (statusWeight[b.status] || 0) - (statusWeight[a.status] || 0)
        || (Number(b.priority) || 0) - (Number(a.priority) || 0)
        || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
}

function scoreIdea(idea) {
    return idea.impact * 2 - idea.effort + (idea.status === 'Building' ? 2 : 0);
}

function daysUntil(dateStr, now = new Date()) {
    if (!dateStr) return null;
    const target = new Date(`${dateStr}T00:00:00`);
    if (Number.isNaN(target.getTime())) return null;
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    return Math.ceil((target - today) / 86400000);
}

function monthlyEquivalent(service) {
    if (service.billingCycle === 'annual') return service.monthlyCost / 12;
    if (service.billingCycle === 'monthly') return service.monthlyCost;
    return 0;
}

function formatCost(value) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    }).format(Number(value) || 0);
}

function trimText(value, max) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max - 1)}...` : text;
}

function safeJson(value, fallback) {
    try {
        const parsed = JSON.parse(value || '');
        return parsed ?? fallback;
    } catch {
        return fallback;
    }
}
