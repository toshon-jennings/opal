import { describe, expect, it } from 'vitest';
import {
    POWER_WORKSPACE_CHAT_HANDOFF_KEY,
    POWER_WORKSPACE_COWORK_HANDOFF_KEY,
    POWER_WORKSPACE_PROJECT_HANDOFF_KEY,
    POWER_WORKSPACE_SURFACE_HANDOFF_KEY,
    consumeWorkspaceSurfaceHandoff,
    prepareWorkspaceChatHandoff,
    prepareWorkspaceCoworkHandoff,
    prepareWorkspaceProjectHandoff,
    prepareWorkspaceSurfaceHandoff,
    chooseNextWorkspaceAction,
    isMissionRunRelevantToWorkspace,
    isNoteRefLinkedToWorkspace,
    normalizePowerWorkspace,
    readPowerWorkspaceSnapshot,
    readWorkspaceChatActivity,
    readWorkspaceCoworkActivity,
    setWorkspaceLink,
} from '../src/lib/powerWorkspace.js';

function memoryStorage(values = {}) {
    const data = new Map(Object.entries(values));
    return {
        getItem: (key) => data.has(key) ? data.get(key) : null,
        setItem: (key, value) => data.set(key, value),
        removeItem: (key) => data.delete(key),
    };
}

describe('powerWorkspace', () => {
    it('normalizes a workspace from the current working directory fallback', () => {
        const storage = memoryStorage({ working_directory: '/Users/toshonjennings/opal' });
        const snapshot = readPowerWorkspaceSnapshot(storage);

        expect(snapshot.workspace.name).toBe('opal');
        expect(snapshot.workspace.folderPath).toBe('/Users/toshonjennings/opal');
    });

    it('prefers the active Git Shells project over a bare working directory', () => {
        const storage = memoryStorage({
            working_directory: '/tmp/other',
            supaterm_active_project_id: 'perci',
            gitshells_projects: JSON.stringify([
                { id: 'perci', name: 'Perci', path: '/Users/toshonjennings/opal', terminals: [{ id: 't1' }] },
            ]),
        });
        const snapshot = readPowerWorkspaceSnapshot(storage);

        expect(snapshot.workspace.name).toBe('Perci');
        expect(snapshot.gitShells.terminalCount).toBe(1);
    });

    it('recommends writing a goal before deeper work', () => {
        expect(chooseNextWorkspaceAction({ workspace: { goal: '' } }).target).toBe('workspace');
    });

    it('prioritizes blocked Mission runs once a goal exists', () => {
        const action = chooseNextWorkspaceAction({
            workspace: normalizePowerWorkspace({ name: 'Perci', goal: 'Improve power user workflow' }),
            missionRuns: [{ status: 'blocked', title: 'Build check blocked' }],
        });

        expect(action.target).toBe('mission');
        expect(action.label).toBe('Review the blocked run');
    });

    it('prioritizes explicit validation state and scopes memory records', () => {
        const storage = memoryStorage({
            perci_power_workspace: JSON.stringify({
                name: 'Perci',
                folderPath: '/Users/toshonjennings/opal',
                goal: 'Improve power users',
            }),
            perci_mission_runs: JSON.stringify([
                {
                    id: 'needs-check',
                    title: 'Workspace changes',
                    status: 'completed',
                    workingDirectory: '/Users/toshonjennings/opal',
                    validation: { status: 'needed', summary: 'Run focused tests.' },
                },
                { id: 'other', status: 'completed', workingDirectory: '/tmp/other' },
            ]),
            perci_mission_memory_candidates: JSON.stringify([
                { id: 'candidate-1', sourceRunId: 'needs-check', status: 'pending', text: 'Keep this decision.' },
                { id: 'candidate-2', sourceRunId: 'other', status: 'pending', text: 'Other project.' },
            ]),
            perci_harness_memory: JSON.stringify([
                { id: 'memory-1', scope: '/Users/toshonjennings/opal', text: 'Validated workspace lesson.' },
                { id: 'memory-2', scope: '/tmp/other', text: 'Other lesson.' },
            ]),
        });
        const snapshot = readPowerWorkspaceSnapshot(storage);
        const action = chooseNextWorkspaceAction({
            workspace: snapshot.workspace,
            missionRuns: snapshot.missionRuns,
        });

        expect(action.label).toBe('Validate the latest agent work');
        expect(snapshot.missionRuns[0].validation.status).toBe('needed');
        expect(snapshot.memoryCandidates.map(candidate => candidate.id)).toEqual(['candidate-1']);
        expect(snapshot.memories.map(memory => memory.id)).toEqual(['memory-1']);
    });

    it('recommends reviewing workspace Cowork results before planning more work', () => {
        const action = chooseNextWorkspaceAction({
            workspace: normalizePowerWorkspace({ name: 'Perci', goal: 'Improve power users' }),
            ideas: [{ id: 'idea-1', title: 'Another idea', status: 'Building' }],
            coworkActivity: {
                sessions: [{ id: 'session-1', title: 'Workspace implementation', state: 'awaiting' }],
            },
        });

        expect(action.target).toBe('cowork');
        expect(action.itemId).toBe('session-1');
        expect(action.label).toBe('Review the latest Cowork result');
    });

    it('stores explicit workspace idea links on the workspace record', () => {
        const storage = memoryStorage({
            perci_power_workspace: JSON.stringify({ name: 'Perci', goal: 'Improve power users' }),
        });
        const linked = setWorkspaceLink(readPowerWorkspaceSnapshot(storage).workspace, 'linkedIdeaIds', 'idea-1', true, storage);
        const unlinked = setWorkspaceLink(linked, 'linkedIdeaIds', 'idea-1', false, storage);

        expect(linked.linkedIdeaIds).toEqual(['idea-1']);
        expect(unlinked.linkedIdeaIds).toEqual([]);
    });

    it('surfaces linked ideas before merely recent ideas', () => {
        const storage = memoryStorage({
            perci_power_workspace: JSON.stringify({
                name: 'Perci',
                goal: 'Improve power users',
                linkedIdeaIds: ['older-linked'],
            }),
            'perci_bars_ideas:v1': JSON.stringify([
                { id: 'newer', title: 'Newer', updatedAt: '2026-06-21T10:00:00Z' },
                { id: 'older-linked', title: 'Linked', updatedAt: '2026-06-20T10:00:00Z' },
            ]),
        });
        const snapshot = readPowerWorkspaceSnapshot(storage);

        expect(snapshot.ideas[0].id).toBe('older-linked');
        expect(snapshot.ideas[0].linked).toBe(true);
    });

    it('matches workspace note refs across markdown and wikilink forms', () => {
        const workspace = normalizePowerWorkspace({
            name: 'Perci',
            linkedNoteRefs: ['[[Power User Brief]]', 'Index.md'],
        });

        expect(isNoteRefLinkedToWorkspace('Power User Brief.md', workspace)).toBe(true);
        expect(isNoteRefLinkedToWorkspace('Index.enc.md', workspace)).toBe(true);
        expect(isNoteRefLinkedToWorkspace('Other.md', workspace)).toBe(false);
    });

    it('matches Mission runs by linked id or workspace folder', () => {
        const workspace = normalizePowerWorkspace({
            name: 'Perci',
            folderPath: '/Users/toshonjennings/opal',
            linkedMissionRunIds: ['manual-run'],
        });

        expect(isMissionRunRelevantToWorkspace({ id: 'folder-run', workingDirectory: '/Users/toshonjennings/opal' }, workspace)).toBe(true);
        expect(isMissionRunRelevantToWorkspace({ id: 'manual-run', workingDirectory: '/tmp/other' }, workspace)).toBe(true);
        expect(isMissionRunRelevantToWorkspace({ id: 'other-run', workingDirectory: '/tmp/other' }, workspace)).toBe(false);
    });

    it('prepares and consumes a direct surface handoff once', () => {
        const storage = memoryStorage();
        const prepared = prepareWorkspaceSurfaceHandoff('notes', '[[Power User Brief]]', storage);
        const consumed = consumeWorkspaceSurfaceHandoff('notes', storage);

        expect(prepared.itemRef).toBe('[[Power User Brief]]');
        expect(consumed.itemRef).toBe('[[Power User Brief]]');
        expect(storage.getItem(POWER_WORKSPACE_SURFACE_HANDOFF_KEY)).toBeNull();
        expect(consumeWorkspaceSurfaceHandoff('notes', storage)).toBeNull();
    });

    it('prepares Cowork with the workspace prompt and folder context', () => {
        const storage = memoryStorage();
        const handoff = prepareWorkspaceCoworkHandoff({
            name: 'Perci',
            folderPath: '/Users/toshonjennings/opal',
            goal: 'Improve Perci for power users',
            linkedNoteRefs: ['Power User Brief.md'],
        }, storage);

        expect(storage.getItem('working_directory')).toBe('/Users/toshonjennings/opal');
        expect(handoff.prompt).toContain('Improve Perci for power users');
        expect(handoff.prompt).toContain('Power User Brief.md');
        expect(handoff.sessionTitle).toBe('Perci workspace');
        expect(JSON.parse(storage.getItem(POWER_WORKSPACE_COWORK_HANDOFF_KEY)).folderPath).toBe('/Users/toshonjennings/opal');
    });

    it('summarizes workspace-scoped Cowork activity', () => {
        const workspace = normalizePowerWorkspace({
            name: 'Perci',
            folderPath: '/Users/toshonjennings/opal',
        });
        const activity = readWorkspaceCoworkActivity(workspace, [
            { id: 'other', title: 'Other project', status: 'In progress', workingDirectory: '/tmp/other' },
            { id: 'done', title: 'Review this result', status: 'Completed', workingDirectory: '/Users/toshonjennings/opal' },
            { id: 'active', title: 'Implement workspace', status: 'In progress', workspaceId: workspace.id },
        ]);

        expect(activity.state).toBe('active');
        expect(activity.sessions.map(session => session.id)).toEqual(['done', 'active']);
        expect(activity.sessions[0].state).toBe('awaiting');

        const reviewed = readWorkspaceCoworkActivity(workspace, [
            { id: 'done', title: 'Reviewed result', status: 'Completed', reviewedAt: '2026-06-21T12:00:00Z', workingDirectory: '/Users/toshonjennings/opal' },
        ]);
        expect(reviewed.state).toBe('recent');
    });

    it('scopes Chat conversations and prepares a non-sending workspace prompt', () => {
        const storage = memoryStorage();
        const workspace = normalizePowerWorkspace({
            name: 'Perci',
            folderPath: '/Users/toshonjennings/opal',
            goal: 'Improve power-user continuity',
        });
        const chats = readWorkspaceChatActivity(workspace, [
            { id: 'other', title: 'Other', workingDirectory: '/tmp/other', messages: [] },
            { id: 'older', title: 'Perci decisions', workspaceId: workspace.id, messages: [{ role: 'user' }], updatedAt: 1 },
            { id: 'newer', title: 'Perci validation', workingDirectory: workspace.folderPath, messages: [], updatedAt: 2 },
        ]);
        const handoff = prepareWorkspaceChatHandoff(workspace, 'newer', storage);

        expect(chats.map(chat => chat.id)).toEqual(['newer', 'older']);
        expect(handoff.prompt).toContain('Improve power-user continuity');
        expect(JSON.parse(storage.getItem(POWER_WORKSPACE_CHAT_HANDOFF_KEY)).chatId).toBe('newer');
    });

    it('prepares Cowork with selected BARS context for planning', () => {
        const storage = memoryStorage();
        const handoff = prepareWorkspaceCoworkHandoff({
            name: 'Perci',
            folderPath: '/Users/toshonjennings/opal',
            goal: 'Improve Perci for power users',
        }, storage, {
            type: 'bars',
            title: 'Power user workspace',
            status: 'Exploring',
            next: 'Wire idea context into Cowork',
        });

        expect(handoff.prompt).toContain('Selected BARS idea: Power user workspace');
        expect(handoff.prompt).toContain('Idea status: Exploring');
        expect(handoff.prompt).toContain('Wire idea context into Cowork');
        expect(handoff.prompt).toContain('draft the next smallest executable plan');

        const noteHandoff = prepareWorkspaceCoworkHandoff({
            name: 'Perci',
            goal: 'Improve Perci for power users',
        }, storage, {
            type: 'notes',
            ref: '[[Power User Brief]]',
        });
        expect(noteHandoff.prompt).toContain('Selected note/context ref: [[Power User Brief]]');
    });

    it('prepares Git Shells by selecting a matching project and terminal', () => {
        const storage = memoryStorage({
            gitshells_projects: JSON.stringify([
                { id: 'perci', name: 'Perci', path: '/Users/toshonjennings/opal', terminals: [{ id: 'term-1' }] },
            ]),
        });
        const handoff = prepareWorkspaceProjectHandoff({
            name: 'Perci',
            folderPath: '/Users/toshonjennings/opal',
            goal: 'Improve Perci for power users',
        }, storage);

        expect(storage.getItem('working_directory')).toBe('/Users/toshonjennings/opal');
        expect(storage.getItem('supaterm_active_project_id')).toBe('perci');
        expect(storage.getItem('supaterm_active_terminal_id')).toBe('term-1');
        expect(JSON.parse(storage.getItem(POWER_WORKSPACE_PROJECT_HANDOFF_KEY)).matchedProjectId).toBe('perci');
        expect(handoff.matchedTerminalId).toBe('term-1');
    });
});
