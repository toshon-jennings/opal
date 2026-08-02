// Shipyard — Perci's AI project-management surface.
//
// Data layer for the Shipyard kanban board: projects, cards, flow columns,
// the GitHub rail (Stage → Commit → Push), Jules dispatch, the activity log,
// and the PM agent contract (tools + system prompt + assertiveness gating).
//
// The PM playbook baked into the system prompt is distilled from
// phuryn/pm-skills: small vertical slices, explicit acceptance criteria,
// RICE/WSJF-style prioritization, WIP limits, and standup-style summaries.
//
// All git/Jules work rides existing IPC (`run-local-command`, `jules:queue`),
// so no Electron main-process changes are required.

import { readJsonStorage, writeJsonStorage } from './persistentStore';

export const SHIPYARD_STORE_KEY = 'perci_shipyard:v1';
export const SHIPYARD_EVENT = 'perci-shipyard-change';

// ── Columns ─────────────────────────────────────────────────────────────────
// Flow columns are user/agent-definable. Rail columns are fixed: dropping a
// card on one performs the git/Jules action it names.
export const RAIL_COLUMNS = [
    { id: 'rail-stage', title: 'Stage', kind: 'stage', hint: 'git add' },
    { id: 'rail-commit', title: 'Commit', kind: 'commit', hint: 'add + commit' },
    { id: 'rail-push', title: 'Push', kind: 'push', hint: 'add + commit + push' },
    { id: 'rail-jules', title: 'Jules', kind: 'jules', hint: 'dispatch to Jules' },
];

const DEFAULT_FLOW_TITLES = ['Backlog', 'In Progress', 'Review', 'Done'];

export const ASSERTIVENESS_LEVELS = [
    { value: 0, label: 'Observer', desc: 'Answers questions only. Never touches the board.' },
    { value: 1, label: 'Advisor', desc: 'Organizes cards and notes. Proposes git/Jules moves, never runs them.' },
    { value: 2, label: 'Manager', desc: 'Runs the board plus stage/commit. Asks before push or Jules.' },
    { value: 3, label: 'Autopilot', desc: 'Full initiative: board, git rail, and Jules dispatch.' },
];

const genId = (prefix) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

// ── State ───────────────────────────────────────────────────────────────────

function defaultState() {
    return { version: 1, activeProjectId: null, petEnabled: true, projects: [] };
}

function normalizeState(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.projects)) return defaultState();
    return {
        version: 1,
        activeProjectId: raw.activeProjectId || raw.projects[0]?.id || null,
        petEnabled: raw.petEnabled !== false,
        projects: raw.projects.map(p => ({
            id: p.id || genId('syp'),
            name: p.name || 'Untitled project',
            repoPath: p.repoPath || '',
            repoFullName: p.repoFullName || '',
            branch: p.branch || 'main',
            assertiveness: Number.isInteger(p.assertiveness) ? Math.min(3, Math.max(0, p.assertiveness)) : 1,
            notes: typeof p.notes === 'string' ? p.notes : '',
            flowColumns: Array.isArray(p.flowColumns) && p.flowColumns.length
                ? p.flowColumns.map(c => ({ id: c.id || genId('syc'), title: c.title || 'Column' }))
                : DEFAULT_FLOW_TITLES.map(title => ({ id: genId('syc'), title })),
            cards: Array.isArray(p.cards) ? p.cards.filter(c => c && c.id) : [],
            activity: Array.isArray(p.activity) ? p.activity.slice(0, 100) : [],
            chat: Array.isArray(p.chat) ? p.chat.slice(-60) : [],
        })),
    };
}

export function readShipyardState() {
    return normalizeState(readJsonStorage(SHIPYARD_STORE_KEY, null));
}

function emitShipyard(type, detail = {}) {
    try {
        window.dispatchEvent(new CustomEvent(SHIPYARD_EVENT, { detail: { type, ...detail } }));
    } catch (_) { /* non-browser context */ }
}

export function writeShipyardState(state, eventType = 'change', eventDetail = {}) {
    writeJsonStorage(SHIPYARD_STORE_KEY, state);
    emitShipyard(eventType, eventDetail);
    return state;
}

export function subscribeShipyard(handler) {
    const listener = (e) => handler(e.detail || { type: 'change' });
    window.addEventListener(SHIPYARD_EVENT, listener);
    return () => window.removeEventListener(SHIPYARD_EVENT, listener);
}

export function getActiveProject(state = readShipyardState()) {
    return state.projects.find(p => p.id === state.activeProjectId) || state.projects[0] || null;
}

export function getProjectColumns(project) {
    return [...project.flowColumns.map(c => ({ ...c, kind: 'flow' })), ...RAIL_COLUMNS];
}

// Central mutation helper: load → patch project → log → persist → emit.
function mutateProject(projectId, patcher, { activityText = null, activityKind = 'board', eventType = 'change', eventDetail = {} } = {}) {
    const state = readShipyardState();
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return { error: `Unknown project: ${projectId}` };
    const result = patcher(project) || {};
    if (result.error) return result;
    if (activityText) {
        project.activity = [
            { id: genId('sya'), at: new Date().toISOString(), kind: activityKind, text: activityText },
            ...project.activity,
        ].slice(0, 100);
    }
    writeShipyardState(state, eventType, { projectId, ...eventDetail });
    return { ok: true, ...result };
}

export function logActivity(projectId, text, kind = 'board', eventType = 'activity') {
    return mutateProject(projectId, () => ({}), { activityText: text, activityKind: kind, eventType });
}

// ── Project + card mutations ────────────────────────────────────────────────

export function createProject({ name, repoPath = '', repoFullName = '', branch = 'main' }) {
    const state = readShipyardState();
    const project = normalizeState({ projects: [{ name, repoPath, repoFullName, branch }] }).projects[0];
    project.activity = [{ id: genId('sya'), at: new Date().toISOString(), kind: 'board', text: `Project "${project.name}" created.` }];
    state.projects = [project, ...state.projects];
    state.activeProjectId = project.id;
    writeShipyardState(state, 'project-created', { projectId: project.id });
    return project;
}

export function setActiveProject(projectId) {
    const state = readShipyardState();
    if (!state.projects.some(p => p.id === projectId)) return;
    state.activeProjectId = projectId;
    writeShipyardState(state);
}

export function updateProjectMeta(projectId, patch) {
    return mutateProject(projectId, (project) => {
        for (const key of ['name', 'repoPath', 'repoFullName', 'branch']) {
            if (typeof patch[key] === 'string') project[key] = patch[key];
        }
        if (Number.isInteger(patch.assertiveness)) {
            project.assertiveness = Math.min(3, Math.max(0, patch.assertiveness));
        }
        return {};
    });
}

export function setPetEnabled(enabled) {
    const state = readShipyardState();
    state.petEnabled = !!enabled;
    writeShipyardState(state, 'pet-toggle');
}

export function setProjectNotes(projectId, notes) {
    return mutateProject(projectId, (project) => { project.notes = String(notes ?? ''); return {}; },
        { eventType: 'notes' });
}

export function setFlowColumns(projectId, titles, { actor = 'user' } = {}) {
    const clean = (Array.isArray(titles) ? titles : []).map(t => String(t).trim()).filter(Boolean).slice(0, 8);
    if (!clean.length) return { error: 'At least one column title is required.' };
    return mutateProject(projectId, (project) => {
        const fallbackId = null;
        // Keep cards whose column title survives; others fall back to the first column.
        const oldById = new Map(project.flowColumns.map(c => [c.id, c.title]));
        const next = clean.map(title => {
            const existing = project.flowColumns.find(c => c.title.toLowerCase() === title.toLowerCase());
            return { id: existing?.id || genId('syc'), title };
        });
        const nextIds = new Set(next.map(c => c.id));
        for (const card of project.cards) {
            if (oldById.has(card.columnId) && !nextIds.has(card.columnId)) {
                card.columnId = next[0]?.id || fallbackId;
            }
        }
        project.flowColumns = next;
        return {};
    }, { activityText: `${actor === 'agent' ? 'Perci' : 'You'} set columns: ${clean.join(' · ')}.` });
}

export function addCard(projectId, { title, description = '', files = [], priority = 'medium', columnId = null }, { actor = 'user' } = {}) {
    const cleanTitle = String(title || '').trim();
    if (!cleanTitle) return { error: 'Card title is required.' };
    let created = null;
    const result = mutateProject(projectId, (project) => {
        const column = project.flowColumns.find(c => c.id === columnId || c.title.toLowerCase() === String(columnId || '').toLowerCase())
            || project.flowColumns[0];
        created = {
            id: genId('syk'),
            title: cleanTitle,
            description: String(description || ''),
            files: (Array.isArray(files) ? files : []).map(f => String(f).trim()).filter(Boolean),
            priority: ['low', 'medium', 'high'].includes(priority) ? priority : 'medium',
            columnId: column.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            git: null,
            jules: null,
        };
        project.cards = [...project.cards, created];
        return { card: created };
    }, { activityText: `${actor === 'agent' ? 'Perci' : 'You'} added "${cleanTitle}".`, eventType: 'card-added', eventDetail: { actor } });
    return result.error ? result : { ok: true, card: created };
}

export function updateCard(projectId, cardId, patch, { actor = 'user' } = {}) {
    return mutateProject(projectId, (project) => {
        const card = project.cards.find(c => c.id === cardId);
        if (!card) return { error: `Unknown card: ${cardId}` };
        if (typeof patch.title === 'string' && patch.title.trim()) card.title = patch.title.trim();
        if (typeof patch.description === 'string') card.description = patch.description;
        if (Array.isArray(patch.files)) card.files = patch.files.map(f => String(f).trim()).filter(Boolean);
        if (['low', 'medium', 'high'].includes(patch.priority)) card.priority = patch.priority;
        card.updatedAt = new Date().toISOString();
        return { card };
    }, { activityText: `${actor === 'agent' ? 'Perci' : 'You'} updated a card.`, eventType: 'card-updated' });
}

export function deleteCard(projectId, cardId, { actor = 'user' } = {}) {
    return mutateProject(projectId, (project) => {
        const card = project.cards.find(c => c.id === cardId);
        if (!card) return { error: `Unknown card: ${cardId}` };
        project.cards = project.cards.filter(c => c.id !== cardId);
        return { removed: card.title };
    }, { activityText: `${actor === 'agent' ? 'Perci' : 'You'} removed a card.`, eventType: 'card-removed' });
}

// Move within flow columns (rail drops are handled by executeRailAction).
export function moveCard(projectId, cardId, columnId, { actor = 'user' } = {}) {
    return mutateProject(projectId, (project) => {
        const card = project.cards.find(c => c.id === cardId);
        if (!card) return { error: `Unknown card: ${cardId}` };
        const columns = getProjectColumns(project);
        const column = columns.find(c => c.id === columnId || c.title.toLowerCase() === String(columnId || '').toLowerCase());
        if (!column) return { error: `Unknown column: ${columnId}` };
        card.columnId = column.id;
        card.updatedAt = new Date().toISOString();
        return { card, column };
    }, { activityText: null, eventType: 'card-moved', eventDetail: { actor, cardId, columnId } });
}

// ── Git rail ────────────────────────────────────────────────────────────────

async function runGit(repoPath, args) {
    if (!window.electron?.runLocalCommand) return { error: 'Git actions need the Perci desktop app.' };
    if (!repoPath) return { error: 'This project has no repo folder set. Open project settings and pick one.' };
    await window.electron.registerWorkspace?.(repoPath);
    const res = await window.electron.runLocalCommand('git', args, repoPath);
    if (res?.error) return { error: res.error };
    return { ok: res.exitCode === 0, exitCode: res.exitCode, output: `${res.output || ''}${res.stderr || ''}`.trim() };
}

function commitMessageFor(card, message) {
    const headline = (message || card.title || 'Shipyard update').trim();
    return card.description ? `${headline}\n\n${card.description.trim()}` : headline;
}

// Perform a rail action for a card. `kind`: 'stage' | 'commit' | 'push'.
// stage = add; commit = add + commit; push = add + commit + push.
export async function executeRailAction(projectId, cardId, kind, { message = '', actor = 'user' } = {}) {
    const state = readShipyardState();
    const project = state.projects.find(p => p.id === projectId);
    const card = project?.cards.find(c => c.id === cardId);
    if (!card) return { error: `Unknown card: ${cardId}` };

    const railColumn = RAIL_COLUMNS.find(c => c.kind === kind);
    mutateProject(projectId, (p) => {
        const target = p.cards.find(c => c.id === cardId);
        target.columnId = railColumn.id;
        target.git = { action: kind, status: 'working', at: new Date().toISOString(), detail: '' };
        return {};
    }, { eventType: 'rail-start', eventDetail: { cardId, kind, actor } });

    const steps = [];
    const fail = (detail) => {
        mutateProject(projectId, (p) => {
            const target = p.cards.find(c => c.id === cardId);
            if (target) target.git = { action: kind, status: 'error', at: new Date().toISOString(), detail };
            return {};
        }, { activityText: `${kind} failed for "${card.title}": ${detail.slice(0, 140)}`, activityKind: 'git', eventType: 'rail-error', eventDetail: { cardId, kind } });
        return { error: detail };
    };

    const addArgs = card.files.length ? ['add', '--', ...card.files] : ['add', '-A'];
    const added = await runGit(project.repoPath, addArgs);
    if (added.error || !added.ok) return fail(added.error || added.output || 'git add failed');
    steps.push(`staged ${card.files.length ? card.files.join(', ') : 'all changes'}`);

    if (kind === 'commit' || kind === 'push') {
        const committed = await runGit(project.repoPath, ['commit', '-m', commitMessageFor(card, message)]);
        if (committed.error) return fail(committed.error);
        if (!committed.ok && !/nothing to commit|nothing added to commit/i.test(committed.output)) {
            return fail(committed.output || 'git commit failed');
        }
        steps.push(committed.ok ? 'committed' : 'nothing new to commit');
    }
    if (kind === 'push') {
        const pushed = await runGit(project.repoPath, ['push']);
        if (pushed.error || !pushed.ok) return fail(pushed.error || pushed.output || 'git push failed');
        steps.push('pushed');
    }

    const detail = steps.join(' → ');
    mutateProject(projectId, (p) => {
        const target = p.cards.find(c => c.id === cardId);
        if (target) target.git = { action: kind, status: 'ok', at: new Date().toISOString(), detail };
        return {};
    }, { activityText: `"${card.title}" ${detail}.`, activityKind: 'git', eventType: 'rail-done', eventDetail: { cardId, kind, actor } });
    return { ok: true, detail };
}

export async function gitStatusSummary(project) {
    const res = await runGit(project.repoPath, ['status', '--short', '--branch']);
    return res.error ? res : { ok: true, output: res.output || '(clean)' };
}

// ── Jules ───────────────────────────────────────────────────────────────────

export async function dispatchCardToJules(projectId, cardId, { prompt = '', actor = 'user' } = {}) {
    if (!window.electron?.queueJulesJob) return { error: 'Jules dispatch needs the Perci desktop app.' };
    const state = readShipyardState();
    const project = state.projects.find(p => p.id === projectId);
    const card = project?.cards.find(c => c.id === cardId);
    if (!card) return { error: `Unknown card: ${cardId}` };

    const taskPrompt = (prompt || '').trim()
        || [card.title, card.description, card.files.length ? `Relevant files: ${card.files.join(', ')}` : '']
            .filter(Boolean).join('\n\n');

    const res = await window.electron.queueJulesJob({
        prompt: taskPrompt,
        source: 'shipyard',
        repo: project.repoFullName || undefined,
        branch: project.branch || undefined,
    });
    if (!res?.ok) return { error: res?.error || 'Jules dispatch failed.' };

    mutateProject(projectId, (p) => {
        const target = p.cards.find(c => c.id === cardId);
        target.columnId = 'rail-jules';
        target.jules = {
            jobId: res.job?.id || null,
            sessionId: res.job?.session_id || null,
            status: res.job?.status || 'pending',
            prUrl: res.job?.pr_url || null,
            at: new Date().toISOString(),
        };
        return {};
    }, { activityText: `"${card.title}" dispatched to Jules.`, activityKind: 'jules', eventType: 'jules-dispatched', eventDetail: { cardId, actor } });
    return { ok: true, job: res.job };
}

// Refresh Jules statuses for a project's cards from the agent job queue.
export async function refreshJulesStatuses(projectId) {
    if (!window.electron?.listAgentJobs) return;
    const state = readShipyardState();
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;
    const tracked = project.cards.filter(c => c.jules?.jobId);
    if (!tracked.length) return;

    const jobs = await window.electron.listAgentJobs({ source: 'shipyard', limit: 50 });
    if (!Array.isArray(jobs)) return;
    const byId = new Map(jobs.map(j => [j.id, j]));

    let changed = false;
    let prEvent = null;
    for (const card of tracked) {
        const job = byId.get(card.jules.jobId);
        if (!job) continue;
        const next = { ...card.jules, status: job.status, sessionId: job.session_id || card.jules.sessionId, prUrl: job.pr_url || card.jules.prUrl };
        if (JSON.stringify(next) !== JSON.stringify(card.jules)) {
            if (next.prUrl && !card.jules.prUrl) prEvent = { cardId: card.id, prUrl: next.prUrl, title: card.title };
            changed = true;
            mutateProject(projectId, (p) => {
                const target = p.cards.find(c => c.id === card.id);
                if (target) target.jules = next;
                return {};
            }, prEvent && prEvent.cardId === card.id
                ? { activityText: `Jules opened a PR for "${card.title}".`, activityKind: 'jules', eventType: 'jules-pr', eventDetail: prEvent }
                : { eventType: 'jules-status' });
        }
    }
    return changed;
}

// ── PM agent contract ───────────────────────────────────────────────────────

export const PM_AGENT_TOOLS = [
    { name: 'list_board', description: 'Read the full current board: columns, cards, notes, recent activity, and settings. Call this before making changes.', parameters: {} },
    { name: 'create_card', description: 'Add a card to the board.', parameters: { title: 'Short imperative card title.', description: 'Optional details / acceptance criteria.', column: 'Column title or id. Defaults to the first flow column.', files: 'Optional JSON array of repo-relative file paths this card touches.', priority: 'low | medium | high.' } },
    { name: 'update_card', description: 'Edit an existing card.', parameters: { card_id: 'Card id.', title: 'New title (optional).', description: 'New description (optional).', files: 'New JSON array of file paths (optional).', priority: 'low | medium | high (optional).' } },
    { name: 'move_card', description: 'Move a card to a flow column (Backlog/In Progress/etc). For Stage/Commit/Push/Jules use git_action or dispatch_to_jules.', parameters: { card_id: 'Card id.', column: 'Target column title or id.' } },
    { name: 'delete_card', description: 'Remove a card from the board.', parameters: { card_id: 'Card id.' } },
    { name: 'set_columns', description: 'Replace the flow (non-git) columns of the board.', parameters: { titles: 'JSON array of 1-8 column titles in order.' } },
    { name: 'update_notes', description: 'Replace the project notes (markdown). Read list_board first and preserve anything still relevant.', parameters: { content: 'Full new notes content.' } },
    { name: 'git_status', description: 'Read `git status` for the project repo.', parameters: {} },
    { name: 'git_action', description: 'Run a git rail action for a card. stage = git add; commit = add + commit; push = add + commit + push.', parameters: { card_id: 'Card id.', action: 'stage | commit | push.', message: 'Commit message (for commit/push). Defaults to the card title.', confirmed_by_user: 'Set true ONLY if the user explicitly approved this exact action in the conversation.' } },
    { name: 'dispatch_to_jules', description: 'Send a card to Jules (Google\'s cloud coding agent) to implement asynchronously; Jules opens a PR when done.', parameters: { card_id: 'Card id.', prompt: 'Task brief for Jules. Defaults to the card title + description.', confirmed_by_user: 'Set true ONLY if the user explicitly approved dispatching this card in the conversation.' } },
];

// Tools the agent is allowed to call at a given assertiveness level. Mirrors
// gateTool: Observer gets read-only tools, Advisor loses git/Jules execution.
// Keeping gated tools out of the request entirely stops small models from
// calling them, getting an error, and then claiming success anyway.
export function toolsForAssertiveness(level) {
    const readOnly = ['list_board', 'git_status'];
    if (level === 0) return PM_AGENT_TOOLS.filter(t => readOnly.includes(t.name));
    if (level === 1) return PM_AGENT_TOOLS.filter(t => !['git_action', 'dispatch_to_jules'].includes(t.name));
    return PM_AGENT_TOOLS;
}

function describeBoard(project) {
    return {
        project: { name: project.name, repoPath: project.repoPath, repo: project.repoFullName, branch: project.branch },
        assertiveness: ASSERTIVENESS_LEVELS[project.assertiveness]?.label,
        columns: getProjectColumns(project).map(c => ({ id: c.id, title: c.title, kind: c.kind })),
        cards: project.cards.map(c => ({
            id: c.id, title: c.title, description: c.description, files: c.files, priority: c.priority,
            column: getProjectColumns(project).find(col => col.id === c.columnId)?.title || c.columnId,
            git: c.git ? { action: c.git.action, status: c.git.status, detail: c.git.detail } : null,
            jules: c.jules ? { status: c.jules.status, prUrl: c.jules.prUrl } : null,
        })),
        notes: project.notes,
        recentActivity: project.activity.slice(0, 10).map(a => `${a.at.slice(0, 16)} ${a.text}`),
    };
}

// Assertiveness gate for agent-initiated tool calls. Manual UI actions bypass this.
function gateTool(name, args, level) {
    const mutating = !['list_board', 'git_status'].includes(name);
    if (level === 0 && mutating) {
        return 'Observer mode: describe what you would do instead of doing it. The user can raise your assertiveness dial in the header.';
    }
    const external = name === 'git_action' || name === 'dispatch_to_jules';
    if (level === 1 && external) {
        return 'Advisor mode: git and Jules actions are reserved for the user. Propose the exact action and let them drag the card or approve.';
    }
    if (level === 2 && external) {
        const isPushOrJules = name === 'dispatch_to_jules' || args?.action === 'push';
        if (isPushOrJules && args?.confirmed_by_user !== true && args?.confirmed_by_user !== 'true') {
            return 'Manager mode: push and Jules dispatch need explicit user approval first. Ask, then retry with confirmed_by_user=true.';
        }
    }
    return null;
}

export async function executePmTool(name, args = {}, { projectId }) {
    const state = readShipyardState();
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return { error: 'No active project.' };

    const gated = gateTool(name, args, project.assertiveness);
    if (gated) return { error: gated };

    const parseList = (v) => {
        if (Array.isArray(v)) return v;
        try { const parsed = JSON.parse(v); return Array.isArray(parsed) ? parsed : undefined; } catch { return undefined; }
    };

    switch (name) {
        case 'list_board':
            return describeBoard(project);
        case 'create_card':
            return addCard(projectId, { title: args.title, description: args.description, files: parseList(args.files) || [], priority: args.priority, columnId: args.column }, { actor: 'agent' });
        case 'update_card':
            return updateCard(projectId, args.card_id, { title: args.title, description: args.description, files: parseList(args.files), priority: args.priority }, { actor: 'agent' });
        case 'move_card': {
            const res = moveCard(projectId, args.card_id, args.column, { actor: 'agent' });
            if (res.column && res.column.kind !== 'flow') return { error: 'Use git_action or dispatch_to_jules for rail columns.' };
            return res;
        }
        case 'delete_card':
            return deleteCard(projectId, args.card_id, { actor: 'agent' });
        case 'set_columns':
            return setFlowColumns(projectId, parseList(args.titles) || [], { actor: 'agent' });
        case 'update_notes': {
            const res = setProjectNotes(projectId, args.content);
            if (res.ok) logActivity(projectId, 'Perci updated the project notes.', 'board', 'agent-note');
            return res;
        }
        case 'git_status':
            return gitStatusSummary(project);
        case 'git_action': {
            if (!['stage', 'commit', 'push'].includes(args.action)) return { error: 'action must be stage, commit, or push.' };
            return executeRailAction(projectId, args.card_id, args.action, { message: args.message, actor: 'agent' });
        }
        case 'dispatch_to_jules':
            return dispatchCardToJules(projectId, args.card_id, { prompt: args.prompt, actor: 'agent' });
        default:
            return { error: `Unknown tool: ${name}` };
    }
}

export function setProjectChat(projectId, messages) {
    return mutateProject(projectId, (project) => {
        project.chat = (Array.isArray(messages) ? messages : []).slice(-60);
        return {};
    }, { eventType: 'chat' });
}

export function sanitizeChatHistory(history) {
    const cleanHistory = [];
    const arr = Array.isArray(history) ? history : [];
    for (let i = 0; i < arr.length; i++) {
        const msg = arr[i];
        if (msg.role === 'assistant') {
            const content = (msg.content || '').toLowerCase();
            const isDefensive = [
                'do not have visibility',
                'unable to view',
                'restricted to the shipyard',
                'only monitor and manage tasks',
                'cannot see external',
                'unable to see'
            ].some(phrase => content.includes(phrase));

            if (isDefensive) {
                if (cleanHistory.length > 0 && cleanHistory[cleanHistory.length - 1].role === 'user') {
                    cleanHistory.pop();
                }
                continue;
            }
        }
        cleanHistory.push(msg);
    }
    return cleanHistory;
}

// One full PM-agent turn: system prompt + history + user message, looping
// through tool calls until the model answers in prose. The caller supplies an
// LLM client (from ChatContext keys) so ShipyardMode and the Perci pet share
// this exact loop.
export async function runPmAgentTurn({ projectId, client, model, history = [], userText, onChunk = () => {}, signal, workspaceSummary }) {
    const project = readShipyardState().projects.find(p => p.id === projectId);
    if (!project) return { error: 'No active project.' };

    let systemPrompt = buildPmSystemPrompt(project);
    if (workspaceSummary) {
        systemPrompt += `\n\nActive Workspace State (from other windows/tools):\n${workspaceSummary}`;
        systemPrompt += `\n\nIMPORTANT: You have full visibility into the active workspace, including open windows/views (like BARS, Localhost, etc.), active/blocked background runs, and chats. If the user asks where things are, what windows are open, or asks for an assessment, answer them directly using the 'Active Workspace State' provided above. Do NOT claim you cannot see other windows or that you are restricted to the Shipyard board.`;
    }

    const cleanedHistory = sanitizeChatHistory(history);
    let messages = [
        { role: 'system', content: systemPrompt },
        ...cleanedHistory.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: userText },
    ];
    const toolEvents = [];
    const textChunk = (chunk, meta) => { if (!meta?.isThinking) onChunk(chunk); };
    const allowedTools = toolsForAssertiveness(project.assertiveness);

    for (let iteration = 0; iteration < 8; iteration++) {
        const { content, toolCalls } = await client.streamChatWithTools(messages, allowedTools, textChunk, model, { signal });
        if (!toolCalls || toolCalls.length === 0) return { content: content || '', toolEvents };

        messages = [...messages, {
            role: 'assistant',
            content: content || null,
            tool_calls: toolCalls.map(tc => ({ id: tc.id, type: 'function', function: { name: tc.name, arguments: JSON.stringify(tc.args) } })),
        }];

        const results = await Promise.all(toolCalls.map(tc => executePmTool(tc.name, tc.args, { projectId })));

        for (let i = 0; i < toolCalls.length; i++) {
            const tc = toolCalls[i];
            const result = results[i];
            toolEvents.push({ name: tc.name, ok: !result?.error, error: result?.error || null });
            messages.push({ role: 'tool', tool_call_id: tc.id, name: tc.name, content: JSON.stringify(result) });
        }
    }

    messages.push({ role: 'user', content: 'Tool budget reached. Summarize the board changes so far and what remains.' });
    const { content } = await client.streamChatWithTools(messages, allowedTools, textChunk, model, { signal });
    return { content: content || '', toolEvents };
}

export function buildPmSystemPrompt(project) {
    const level = ASSERTIVENESS_LEVELS[project.assertiveness] || ASSERTIVENESS_LEVELS[1];
    return [
        'You are Perci, the project manager and workspace assistant. You manage this Shipyard board and also have full visibility and awareness of the active workspace (open windows, terminal runs, manual tasks, and other chat sessions).',
        '',
        'PM playbook (follow it):',
        '- Break work into small vertical slices; every card gets an imperative title and, when non-trivial, acceptance criteria in its description.',
        '- Prioritize by impact vs effort (RICE/WSJF thinking). High-priority = unblocks other work or user-visible value.',
        '- Respect WIP: if In Progress is crowded, say so before adding more.',
        '- When asked "where are we", "what is open", or about the workspace status, use both the board cards and the live active workspace state (open windows like Localhost or BARS, terminal tasks, chats) to give a complete standup-style assessment.',
        '- Keep project notes current: decisions, constraints, and open questions live there, not in chat scrollback.',
        '',
        'The board has flow columns plus a GitHub rail: Stage (git add), Commit (add+commit), Push (add+commit+push), and Jules (dispatch to Google\'s cloud coding agent, which opens a PR). Cards can carry a list of repo file paths; rail actions stage only those files, or all changes when the list is empty.',
        '',
        `Assertiveness dial: ${level.label} — ${level.desc} Operate strictly inside that authority; if a useful action is beyond it, propose it crisply instead.`,
        '',
        'Always call list_board before changing anything. After tool calls, reply with a short human summary of what changed — never dump raw JSON.',
        '',
        'If a tool returns an error, report that error to the user verbatim and stop — NEVER claim an action succeeded when its tool call failed or was never made. Only say a card/board change happened after the tool result confirms it.',
        '',
        `Board snapshot:\n${JSON.stringify(describeBoard(project))}`,
    ].join('\n');
}
