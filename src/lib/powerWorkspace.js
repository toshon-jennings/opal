export const POWER_WORKSPACE_KEY = 'perci_power_workspace';
export const POWER_WORKSPACE_COWORK_HANDOFF_KEY = 'perci_power_workspace_cowork_handoff';
export const POWER_WORKSPACE_CHAT_HANDOFF_KEY = 'perci_power_workspace_chat_handoff';
export const POWER_WORKSPACE_PROJECT_HANDOFF_KEY = 'perci_power_workspace_project_handoff';
export const POWER_WORKSPACE_SURFACE_HANDOFF_KEY = 'perci_power_workspace_surface_handoff';
export const POWER_WORKSPACE_SURFACE_HANDOFF_EVENT = 'perci-power-workspace-surface-handoff';
export const BARS_IDEAS_KEY = 'perci_bars_ideas:v1';
export const GITSHELLS_PROJECTS_KEY = 'gitshells_projects';
export const MISSION_RUNS_KEY = 'perci_mission_runs';
export const SUPATERM_ACTIVE_PROJECT_KEY = 'supaterm_active_project_id';
export const SUPATERM_ACTIVE_TERMINAL_KEY = 'supaterm_active_terminal_id';

function safeJson(value, fallback) {
    try {
        const parsed = JSON.parse(value || '');
        return parsed ?? fallback;
    } catch {
        return fallback;
    }
}

function cleanString(value) {
    return String(value || '').trim();
}

function pathLeaf(path) {
    const cleanPath = cleanString(path).replace(/[/\\]$/, '');
    if (!cleanPath) return '';
    return cleanPath.split(/[/\\]/).filter(Boolean).pop() || cleanPath;
}

function workspaceIdFrom(name, folderPath) {
    const basis = cleanString(folderPath) || cleanString(name) || 'default';
    return `workspace:${basis.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'default'}`;
}

function sortByUpdatedAt(items) {
    return [...items].sort((a, b) => {
        const aTime = new Date(a.updatedAt || a.createdAt || a.startedAt || 0).getTime();
        const bTime = new Date(b.updatedAt || b.createdAt || b.startedAt || 0).getTime();
        return bTime - aTime;
    });
}

function uniqueStrings(values) {
    return Array.from(new Set((Array.isArray(values) ? values : [])
        .map(cleanString)
        .filter(Boolean)));
}

export function noteRefId(value) {
    return cleanString(value)
        .replace(/^\[\[/, '')
        .replace(/\]\]$/, '')
        .split('|')[0]
        .split(/[/\\]/)
        .pop()
        .replace(/\.enc\.md$/i, '')
        .replace(/\.md$/i, '')
        .trim()
        .toLowerCase();
}

export function isNoteRefLinkedToWorkspace(noteRef, workspace) {
    const target = noteRefId(noteRef);
    if (!target) return false;
    return normalizePowerWorkspace(workspace).linkedNoteRefs.some(ref => noteRefId(ref) === target);
}

export function isMissionRunRelevantToWorkspace(run, workspace) {
    const normalized = normalizePowerWorkspace(workspace);
    const runId = cleanString(run?.id);
    if (runId && normalized.linkedMissionRunIds.includes(runId)) return true;
    const folderPath = normalized.folderPath;
    const runDirectory = cleanString(run?.workingDirectory);
    return Boolean(folderPath && runDirectory && runDirectory === folderPath);
}

export function readWorkspaceCoworkActivity(workspace, sessions = []) {
    const normalized = normalizePowerWorkspace(workspace);
    const relevantSessions = (Array.isArray(sessions) ? sessions : [])
        .filter(session => {
            const sessionWorkspaceId = cleanString(session?.workspaceId);
            if (sessionWorkspaceId && sessionWorkspaceId === normalized.id) return true;
            const sessionDirectory = cleanString(session?.workingDirectory);
            return Boolean(normalized.folderPath && sessionDirectory === normalized.folderPath);
        })
        .map(session => {
            const status = cleanString(session?.status) || 'Started';
            const normalizedStatus = status.toLowerCase();
            const state = normalizedStatus === 'in progress'
                ? 'active'
                : normalizedStatus === 'started'
                    ? 'ready'
                    : cleanString(session?.reviewedAt)
                        ? 'recent'
                        : 'awaiting';
            return {
                id: cleanString(session?.id),
                title: cleanString(session?.title) || 'Untitled Cowork session',
                status,
                state,
            };
        });
    const state = relevantSessions.some(session => session.state === 'active')
        ? 'active'
        : relevantSessions.some(session => session.state === 'awaiting')
            ? 'awaiting'
        : relevantSessions.some(session => session.state === 'ready')
                ? 'ready'
                : relevantSessions.some(session => session.state === 'recent')
                    ? 'recent'
                : 'idle';

    return {
        state,
        label: {
            active: 'Agent work active',
            awaiting: 'Awaiting your review',
            ready: 'Ready to run',
            recent: 'Recent agent activity',
            idle: 'No workspace activity',
        }[state],
        sessions: relevantSessions.slice(0, 3),
    };
}

export function readWorkspaceChatActivity(workspace, chats = []) {
    const normalized = normalizePowerWorkspace(workspace);
    return (Array.isArray(chats) ? chats : [])
        .filter(chat => (
            cleanString(chat?.workspaceId) === normalized.id
            || Boolean(normalized.folderPath && cleanString(chat?.workingDirectory) === normalized.folderPath)
        ))
        .map(chat => ({
            id: cleanString(chat?.id),
            title: cleanString(chat?.title) || 'Untitled chat',
            messageCount: Array.isArray(chat?.messages) ? chat.messages.length : 0,
            updatedAt: chat?.updatedAt || chat?.createdAt || 0,
        }))
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 3);
}

function linkedFirst(items, linkedIds, limit = 4) {
    const linked = [];
    const rest = [];
    const linkedSet = new Set(linkedIds);
    for (const item of items) {
        if (linkedSet.has(item.id)) linked.push({ ...item, linked: true });
        else rest.push({ ...item, linked: false });
    }
    return [...linked, ...rest].slice(0, limit);
}

function emitWorkspaceHandoff(eventName, detail) {
    if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return;
    window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

export function buildWorkspaceCoworkPrompt(workspace, context = {}) {
    const normalized = normalizePowerWorkspace(workspace);
    const contextType = cleanString(context.type).toLowerCase();
    const contextTitle = cleanString(context.title);
    const contextRef = cleanString(context.ref);
    const contextStatus = cleanString(context.status);
    const contextNext = cleanString(context.next);
    return [
        `Continue the "${normalized.name}" workspace.`,
        normalized.goal ? `Goal: ${normalized.goal}` : '',
        normalized.folderPath ? `Local folder: ${normalized.folderPath}` : '',
        normalized.linkedNoteRefs.length ? `Linked notes/context refs: ${normalized.linkedNoteRefs.join(', ')}` : '',
        contextType === 'bars' && contextTitle ? `Selected BARS idea: ${contextTitle}` : '',
        contextType === 'bars' && contextStatus ? `Idea status: ${contextStatus}` : '',
        contextType === 'bars' && contextNext ? `Idea next action: ${contextNext}` : '',
        contextType === 'notes' && contextRef ? `Selected note/context ref: ${contextRef}` : '',
        '',
        contextType
            ? 'Use the selected context to draft the next smallest executable plan toward the workspace goal. Inspect the current state before changing files.'
            : 'Start by inspecting the current state, then propose and execute the next smallest useful step toward the workspace goal.'
    ].filter(line => line !== '').join('\n');
}

export function buildWorkspaceChatPrompt(workspace) {
    const normalized = normalizePowerWorkspace(workspace);
    return [
        `Discuss the "${normalized.name}" workspace.`,
        normalized.goal ? `Goal: ${normalized.goal}` : '',
        normalized.folderPath ? `Local folder: ${normalized.folderPath}` : '',
        normalized.linkedNoteRefs.length ? `Linked notes/context refs: ${normalized.linkedNoteRefs.join(', ')}` : '',
        '',
        'Help me reason about the next decision. Ask for missing context instead of assuming it.'
    ].filter(line => line !== '').join('\n');
}

export function normalizePowerWorkspace(raw = {}, fallback = {}) {
    const name = cleanString(raw.name) || cleanString(fallback.name) || pathLeaf(raw.folderPath || fallback.folderPath) || 'Power Workspace';
    const folderPath = cleanString(raw.folderPath) || cleanString(fallback.folderPath);
    const goal = cleanString(raw.goal) || cleanString(fallback.goal);
    const description = cleanString(raw.description) || cleanString(fallback.description);
    const now = new Date().toISOString();

    return {
        id: cleanString(raw.id) || workspaceIdFrom(name, folderPath),
        name,
        folderPath,
        goal,
        description,
        linkedIdeaIds: uniqueStrings(raw.linkedIdeaIds),
        linkedMissionRunIds: uniqueStrings(raw.linkedMissionRunIds),
        linkedNoteRefs: uniqueStrings(raw.linkedNoteRefs),
        createdAt: cleanString(raw.createdAt) || now,
        updatedAt: cleanString(raw.updatedAt) || now,
    };
}

export function chooseNextWorkspaceAction({ workspace, ideas = [], missionRuns = [], coworkActivity } = {}) {
    const goal = cleanString(workspace?.goal);
    if (!goal) {
        return {
            label: 'Write the workspace goal',
            detail: 'Give Perci one sentence about what this project is trying to accomplish.',
            target: 'workspace',
        };
    }

    const blockedRun = missionRuns.find(run => ['blocked', 'failed', 'error'].includes(cleanString(run.status).toLowerCase()));
    if (blockedRun) {
        return {
            label: 'Review the blocked run',
            detail: blockedRun.title || blockedRun.objective || 'A recent Mission run needs attention.',
            target: 'mission',
        };
    }

    const validationRun = missionRuns.find(run => (
        ['needed', 'pending', 'failed'].includes(cleanString(run.validation?.status).toLowerCase())
        || cleanString(run.status).toLowerCase().includes('validation')
    ));
    if (validationRun) {
        return {
            label: 'Validate the latest agent work',
            detail: validationRun.title || validationRun.objective || 'Mission has work that needs a trust check.',
            target: 'mission',
        };
    }

    const awaitingCowork = coworkActivity?.sessions?.find(session => session.state === 'awaiting');
    if (awaitingCowork) {
        return {
            label: 'Review the latest Cowork result',
            detail: awaitingCowork.title || 'Cowork has workspace-scoped agent work ready for review.',
            target: 'cowork',
            itemId: awaitingCowork.id,
        };
    }

    const activeIdea = ideas.find(idea => ['Building', 'Exploring', 'New'].includes(idea.status));
    if (activeIdea) {
        return {
            label: 'Turn an idea into the next plan',
            detail: activeIdea.title || 'Use a recent BARS idea as planning context.',
            target: 'bars',
        };
    }

    if (!cleanString(workspace?.folderPath)) {
        return {
            label: 'Attach a local project folder',
            detail: 'Connect Git Shells or Cowork to a folder so Perci can work against real files.',
            target: 'projects',
        };
    }

    return {
        label: 'Continue the current project',
        detail: 'Open Cowork with this goal and the active project context.',
        target: 'cowork',
    };
}

export function readPowerWorkspaceSnapshot(storage = globalThis.localStorage) {
    const storedWorkspace = safeJson(storage?.getItem?.(POWER_WORKSPACE_KEY), {});
    const workingDirectory = cleanString(storage?.getItem?.('working_directory'));
    const projects = safeJson(storage?.getItem?.(GITSHELLS_PROJECTS_KEY), []);
    const activeProjectId = cleanString(storage?.getItem?.('supaterm_active_project_id'));
    const activeProject = Array.isArray(projects)
        ? projects.find(project => project?.id === activeProjectId)
            || projects.find(project => cleanString(project?.path) === workingDirectory)
            || projects[0]
        : null;
    const fallback = {
        name: activeProject?.name || pathLeaf(workingDirectory),
        folderPath: activeProject?.path || workingDirectory,
    };
    const workspace = normalizePowerWorkspace(storedWorkspace, fallback);
    const allIdeas = sortByUpdatedAt(safeJson(storage?.getItem?.(BARS_IDEAS_KEY), []))
        .map(idea => ({
            id: cleanString(idea.id),
            title: cleanString(idea.title) || 'Untitled idea',
            status: cleanString(idea.status) || 'New',
            next: cleanString(idea.next),
            updatedAt: cleanString(idea.updatedAt || idea.createdAt),
        }));
    const relevantMissionRuns = sortByUpdatedAt(safeJson(storage?.getItem?.(MISSION_RUNS_KEY), []))
        .filter(run => {
            if (!workspace.folderPath && workspace.linkedMissionRunIds.length === 0) return true;
            return isMissionRunRelevantToWorkspace(run, workspace);
        });
    const relevantRunIds = new Set(relevantMissionRuns.map(run => cleanString(run.id)).filter(Boolean));
    const allMissionRuns = relevantMissionRuns.map(run => ({
            id: cleanString(run.id),
            title: cleanString(run.title || run.objective) || 'Untitled run',
            status: cleanString(run.status) || 'unknown',
            agent: cleanString(run.agent),
            validation: run.validation && typeof run.validation === 'object'
                ? {
                    status: cleanString(run.validation.status),
                    summary: cleanString(run.validation.summary),
                    updatedAt: cleanString(run.validation.updatedAt),
                }
                : null,
            next: cleanString(run.next),
            updatedAt: cleanString(run.updatedAt || run.startedAt),
        }));
    const ideas = linkedFirst(allIdeas, workspace.linkedIdeaIds);
    const missionRuns = linkedFirst(allMissionRuns, workspace.linkedMissionRunIds);
    const gitShells = {
        projectCount: Array.isArray(projects) ? projects.length : 0,
        activeProjectName: cleanString(activeProject?.name),
        terminalCount: Array.isArray(activeProject?.terminals) ? activeProject.terminals.length : 0,
    };
    const memoryCandidates = sortByUpdatedAt(safeJson(storage?.getItem?.(MISSION_MEMORY_CANDIDATES_KEY), []))
        .filter(candidate => candidate?.status === 'pending' && relevantRunIds.has(cleanString(candidate.sourceRunId)))
        .slice(0, 3)
        .map(candidate => ({
            id: cleanString(candidate.id),
            sourceRunId: cleanString(candidate.sourceRunId),
            sourceType: cleanString(candidate.sourceType),
            text: cleanString(candidate.text),
            createdAt: cleanString(candidate.createdAt),
        }));
    const memories = sortByUpdatedAt(safeJson(storage?.getItem?.(HARNESS_MEMORY_KEY), []))
        .filter(memory => (
            Boolean(workspace.folderPath && cleanString(memory?.scope) === workspace.folderPath)
            || relevantRunIds.has(cleanString(memory?.sourceRunId))
        ))
        .slice(0, 3)
        .map(memory => ({
            id: cleanString(memory.id),
            title: cleanString(memory.title) || 'Memory note',
            text: cleanString(memory.text),
            sourceType: cleanString(memory.sourceType),
            updatedAt: cleanString(memory.updatedAt || memory.createdAt),
        }));

    return {
        workspace,
        ideas,
        allIdeas,
        missionRuns,
        allMissionRuns,
        gitShells,
        memoryCandidates,
        memories,
        nextAction: chooseNextWorkspaceAction({ workspace, ideas, missionRuns }),
    };
}

export function savePowerWorkspace(workspace, storage = globalThis.localStorage) {
    const normalized = normalizePowerWorkspace({
        ...workspace,
        updatedAt: new Date().toISOString(),
    });
    storage?.setItem?.(POWER_WORKSPACE_KEY, JSON.stringify(normalized));
    return normalized;
}

export function setWorkspaceLink(workspace, linkKey, itemId, isLinked, storage = globalThis.localStorage) {
    const normalized = normalizePowerWorkspace(workspace);
    const currentIds = uniqueStrings(normalized[linkKey]);
    const targetId = cleanString(itemId);
    if (!targetId || !['linkedIdeaIds', 'linkedMissionRunIds', 'linkedNoteRefs'].includes(linkKey)) {
        return normalized;
    }
    const nextIds = isLinked
        ? uniqueStrings([...currentIds, targetId])
        : currentIds.filter(id => id !== targetId);
    return savePowerWorkspace({ ...normalized, [linkKey]: nextIds }, storage);
}

export function prepareWorkspaceSurfaceHandoff(target, itemRef, storage = globalThis.localStorage) {
    const normalizedTarget = cleanString(target).toLowerCase();
    const normalizedRef = cleanString(itemRef);
    if (!['bars', 'notes', 'mission'].includes(normalizedTarget) || !normalizedRef) return null;
    const handoff = {
        target: normalizedTarget,
        itemRef: normalizedRef,
        createdAt: new Date().toISOString(),
    };
    storage?.setItem?.(POWER_WORKSPACE_SURFACE_HANDOFF_KEY, JSON.stringify(handoff));
    emitWorkspaceHandoff(POWER_WORKSPACE_SURFACE_HANDOFF_EVENT, handoff);
    return handoff;
}

export function consumeWorkspaceSurfaceHandoff(target, storage = globalThis.localStorage) {
    const handoff = safeJson(storage?.getItem?.(POWER_WORKSPACE_SURFACE_HANDOFF_KEY), null);
    if (!handoff || cleanString(handoff.target).toLowerCase() !== cleanString(target).toLowerCase()) return null;
    storage?.removeItem?.(POWER_WORKSPACE_SURFACE_HANDOFF_KEY);
    return {
        target: cleanString(handoff.target).toLowerCase(),
        itemRef: cleanString(handoff.itemRef),
        createdAt: cleanString(handoff.createdAt),
    };
}

export function prepareWorkspaceCoworkHandoff(workspace, storage = globalThis.localStorage, context = null) {
    const normalized = savePowerWorkspace(workspace, storage);
    const contextTitle = cleanString(context?.title || context?.ref);
    const handoff = {
        sessionId: `workspace-cowork:${Date.now()}`,
        sessionTitle: contextTitle || `${normalized.name} workspace`,
        workspaceId: normalized.id,
        workspaceName: normalized.name,
        folderPath: normalized.folderPath,
        goal: normalized.goal,
        context,
        prompt: buildWorkspaceCoworkPrompt(normalized, context || {}),
        createdAt: new Date().toISOString(),
    };
    if (normalized.folderPath) {
        storage?.setItem?.('working_directory', normalized.folderPath);
    }
    storage?.setItem?.(POWER_WORKSPACE_COWORK_HANDOFF_KEY, JSON.stringify(handoff));
    emitWorkspaceHandoff('perci-power-workspace-cowork-handoff', handoff);
    return handoff;
}

export function prepareWorkspaceChatHandoff(workspace, chatId, storage = globalThis.localStorage) {
    const normalized = savePowerWorkspace(workspace, storage);
    const handoff = {
        chatId: cleanString(chatId),
        workspaceId: normalized.id,
        prompt: buildWorkspaceChatPrompt(normalized),
        createdAt: new Date().toISOString(),
    };
    storage?.setItem?.(POWER_WORKSPACE_CHAT_HANDOFF_KEY, JSON.stringify(handoff));
    emitWorkspaceHandoff('perci-power-workspace-chat-handoff', handoff);
    return handoff;
}

export function prepareWorkspaceProjectHandoff(workspace, storage = globalThis.localStorage) {
    const normalized = savePowerWorkspace(workspace, storage);
    const projects = safeJson(storage?.getItem?.(GITSHELLS_PROJECTS_KEY), []);
    const matchingProject = Array.isArray(projects)
        ? projects.find(project => cleanString(project?.path) === normalized.folderPath)
        : null;
    const matchingTerminal = matchingProject?.terminals?.[0] || null;
    const handoff = {
        workspaceId: normalized.id,
        workspaceName: normalized.name,
        folderPath: normalized.folderPath,
        matchedProjectId: cleanString(matchingProject?.id),
        matchedTerminalId: cleanString(matchingTerminal?.id),
        createdAt: new Date().toISOString(),
    };

    if (normalized.folderPath) {
        storage?.setItem?.('working_directory', normalized.folderPath);
    }
    if (handoff.matchedProjectId) {
        storage?.setItem?.(SUPATERM_ACTIVE_PROJECT_KEY, handoff.matchedProjectId);
    }
    if (handoff.matchedTerminalId) {
        storage?.setItem?.(SUPATERM_ACTIVE_TERMINAL_KEY, handoff.matchedTerminalId);
    }

    storage?.setItem?.(POWER_WORKSPACE_PROJECT_HANDOFF_KEY, JSON.stringify(handoff));
    emitWorkspaceHandoff('perci-power-workspace-project-handoff', handoff);
    return handoff;
}
import { HARNESS_MEMORY_KEY } from './harnessMemory';
import { MISSION_MEMORY_CANDIDATES_KEY } from './missionControl';
