import { useMemo, useState } from 'react';
import {
    ArrowRight, Bot, Brain, CheckCircle2, FolderOpen, Lightbulb, RefreshCw,
    MessageSquare, Plus, Rocket, Save, ScrollText, ShieldCheck, Target, TerminalSquare, X
} from 'lucide-react';
import { useMode, MODES } from '../context/ModeContext';
import { useChat } from '../context/ChatContext';
import {
    prepareWorkspaceChatHandoff,
    prepareWorkspaceCoworkHandoff,
    prepareWorkspaceProjectHandoff,
    prepareWorkspaceSurfaceHandoff,
    chooseNextWorkspaceAction,
    readPowerWorkspaceSnapshot,
    readWorkspaceChatActivity,
    readWorkspaceCoworkActivity,
    savePowerWorkspace,
    setWorkspaceLink,
} from '../lib/powerWorkspace';
import { resolveMemoryCandidate, setMissionValidationTarget } from '../lib/missionControl';

function Field({ label, children }) {
    return (
        <label className="space-y-1">
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">{label}</span>
            {children}
        </label>
    );
}

function EmptyLine({ children }) {
    return <p className="text-xs text-[var(--text-tertiary)]">{children}</p>;
}

function SummaryCard({ icon: Icon, title, children, action }) {
    return (
        <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/70 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className="grid h-8 w-8 place-items-center rounded-xl border border-orange-500/20 bg-orange-500/10 text-orange-400">
                        <Icon size={16} />
                    </span>
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
                </div>
                {action}
            </div>
            {children}
        </section>
    );
}

export default function PowerWorkspaceMode() {
    const { codeState, openWindow, setCodeState } = useMode();
    const { chats, createNewChat, switchToChat } = useChat();
    const [snapshot, setSnapshot] = useState(() => readPowerWorkspaceSnapshot());
    const [draft, setDraft] = useState(() => snapshot.workspace);
    const [savedAt, setSavedAt] = useState('');
    const [noteDraft, setNoteDraft] = useState('');
    const coworkActivity = useMemo(
        () => readWorkspaceCoworkActivity(snapshot.workspace, codeState.sessions),
        [snapshot.workspace, codeState.sessions]
    );
    const workspaceChats = useMemo(
        () => readWorkspaceChatActivity(snapshot.workspace, chats),
        [snapshot.workspace, chats]
    );
    const nextAction = chooseNextWorkspaceAction({
        workspace: snapshot.workspace,
        ideas: snapshot.ideas,
        missionRuns: snapshot.missionRuns,
        coworkActivity,
    });

    const refresh = () => {
        const next = readPowerWorkspaceSnapshot();
        setSnapshot(next);
        setDraft(next.workspace);
    };

    const save = () => {
        const workspace = savePowerWorkspace(draft);
        const next = readPowerWorkspaceSnapshot();
        setSnapshot({ ...next, workspace });
        setDraft(workspace);
        setSavedAt('Saved');
        window.setTimeout(() => setSavedAt(''), 1400);
    };

    const updateLink = (linkKey, itemId, isLinked) => {
        const workspace = setWorkspaceLink(snapshot.workspace, linkKey, itemId, isLinked);
        const next = readPowerWorkspaceSnapshot();
        setSnapshot({ ...next, workspace });
        setDraft(workspace);
    };

    const addNoteRef = (event) => {
        event.preventDefault();
        const value = noteDraft.trim();
        if (!value) return;
        updateLink('linkedNoteRefs', value, true);
        setNoteDraft('');
    };

    const nextTarget = nextAction?.target;
    const nextMode = useMemo(() => {
        const modes = {
            bars: MODES.BARS,
            cowork: MODES.COWORK,
            mission: MODES.MISSION,
            projects: MODES.PROJECTS,
            workspace: null,
        };
        return Object.prototype.hasOwnProperty.call(modes, nextTarget) ? modes[nextTarget] : MODES.COWORK;
    }, [nextTarget]);

    const openCoworkSession = (sessionId) => {
        setCodeState(current => ({ ...current, currentSessionId: sessionId }));
        openWindow(MODES.COWORK);
    };

    const openWorkspaceChat = (chatId) => {
        switchToChat(chatId);
        openWindow(MODES.CHAT);
    };

    const startWorkspaceChat = () => {
        const workspace = savePowerWorkspace(draft);
        const chatId = createNewChat({
            title: `${workspace.name} chat`,
            workspaceId: workspace.id,
            workingDirectory: workspace.folderPath,
        });
        prepareWorkspaceChatHandoff(workspace, chatId);
        openWindow(MODES.CHAT);
        refresh();
    };

    const startValidation = (run) => {
        setMissionValidationTarget(run.id);
        prepareWorkspaceProjectHandoff(draft);
        openWindow(MODES.PROJECTS);
        refresh();
    };

    const resolveWorkspaceMemory = (candidateId, resolution) => {
        resolveMemoryCandidate(candidateId, resolution);
        refresh();
    };

    const openWorkspaceTarget = (target = nextTarget, itemId = '') => {
        if (target === 'cowork') {
            if (itemId) {
                openCoworkSession(itemId);
                return;
            }
            prepareWorkspaceCoworkHandoff(draft);
            openWindow(MODES.COWORK);
            refresh();
            return;
        }
        if (target === 'projects') {
            prepareWorkspaceProjectHandoff(draft);
            openWindow(MODES.PROJECTS);
            refresh();
            return;
        }
        const mode = {
            bars: MODES.BARS,
            mission: MODES.MISSION,
            notes: MODES.NOTES,
        }[target] || nextMode;
        if (mode) openWindow(mode);
    };

    const openWorkspaceItem = (target, itemRef) => {
        prepareWorkspaceSurfaceHandoff(target, itemRef);
        openWorkspaceTarget(target);
    };

    const startCoworkWithContext = (context) => {
        prepareWorkspaceCoworkHandoff(draft, globalThis.localStorage, context);
        openWindow(MODES.COWORK);
        refresh();
    };

    return (
        <div className="h-full overflow-y-auto bg-[var(--bg-primary)] text-[var(--text-primary)]">
            <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-6">
                <header className="rounded-3xl border border-orange-500/20 bg-gradient-to-br from-orange-500/15 via-[var(--bg-secondary)] to-[var(--bg-primary)] p-5 shadow-2xl shadow-black/10">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                        <div className="space-y-2">
                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-orange-400">
                                <Rocket size={14} />
                                Power Workspace
                            </div>
                            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
                                {snapshot.workspace.name}
                            </h1>
                            <p className="max-w-2xl text-sm leading-6 text-[var(--text-secondary)]">
                                One project loop for ideas, notes, agents, terminals, validation, memory, and next action.
                            </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                            <button
                                type="button"
                                onClick={refresh}
                                className="inline-flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
                            >
                                <RefreshCw size={13} />
                                Refresh
                            </button>
                            <button
                                type="button"
                                onClick={save}
                                className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-orange-400"
                            >
                                <Save size={13} />
                                {savedAt || 'Save workspace'}
                            </button>
                        </div>
                    </div>
                </header>

                <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(360px,0.9fr)]">
                    <section className="rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)]/70 p-4">
                        <div className="mb-4 flex items-center gap-2">
                            <Target size={16} className="text-orange-400" />
                            <h2 className="text-sm font-semibold">Workspace definition</h2>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <Field label="Name">
                                <input
                                    value={draft.name}
                                    onChange={(event) => setDraft(current => ({ ...current, name: event.target.value }))}
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm outline-none focus:border-orange-500"
                                />
                            </Field>
                            <Field label="Folder">
                                <input
                                    value={draft.folderPath}
                                    onChange={(event) => setDraft(current => ({ ...current, folderPath: event.target.value }))}
                                    placeholder="/Users/name/project"
                                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-xs outline-none focus:border-orange-500"
                                />
                            </Field>
                            <div className="md:col-span-2">
                                <Field label="Goal">
                                    <textarea
                                        value={draft.goal}
                                        onChange={(event) => setDraft(current => ({ ...current, goal: event.target.value }))}
                                        placeholder="Example: Improve Perci for technical founder/operator power users."
                                        rows={3}
                                        className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm leading-6 outline-none focus:border-orange-500"
                                    />
                                </Field>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-2xl border border-orange-500/25 bg-orange-500/10 p-4">
                        <div className="mb-3 flex items-center gap-2 text-orange-300">
                            <ArrowRight size={16} />
                            <h2 className="text-sm font-semibold">Next action</h2>
                        </div>
                        <p className="text-lg font-semibold text-[var(--text-primary)]">{nextAction.label}</p>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">{nextAction.detail}</p>
                        <button
                            type="button"
                            onClick={() => openWorkspaceTarget(nextTarget, nextAction.itemId)}
                            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-orange-500 px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={!nextMode}
                        >
                            Open target surface
                            <ArrowRight size={13} />
                        </button>
                    </section>
                </div>

                <div className="grid gap-5 lg:grid-cols-2">
                    <SummaryCard
                        icon={Lightbulb}
                        title="Recent BARS ideas"
                        action={<button className="text-xs text-orange-400 hover:underline" onClick={() => openWindow(MODES.BARS)}>Open BARS</button>}
                    >
                        {snapshot.ideas.length ? (
                            <div className="space-y-2">
                                {snapshot.ideas.map(idea => (
                                    <div key={idea.id || idea.title} className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <button
                                                type="button"
                                                onClick={() => openWorkspaceItem('bars', idea.id)}
                                                className="truncate text-left text-sm font-medium hover:text-orange-300"
                                            >
                                                {idea.title}
                                            </button>
                                            <div className="flex items-center gap-2">
                                                {idea.linked && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">linked</span>}
                                                <span className="rounded-full bg-orange-500/10 px-2 py-0.5 text-[10px] text-orange-300">{idea.status}</span>
                                            </div>
                                        </div>
                                        {idea.next && <p className="mt-1 line-clamp-2 text-xs text-[var(--text-tertiary)]">{idea.next}</p>}
                                        {idea.id && (
                                            <div className="mt-2 flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => openWorkspaceItem('bars', idea.id)}
                                                    className="text-xs font-medium text-orange-400 hover:underline"
                                                >
                                                    Open idea
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => startCoworkWithContext({
                                                        type: 'bars',
                                                        title: idea.title,
                                                        status: idea.status,
                                                        next: idea.next,
                                                    })}
                                                    className="text-xs font-medium text-orange-400 hover:underline"
                                                >
                                                    Plan in Cowork
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => updateLink('linkedIdeaIds', idea.id, !idea.linked)}
                                                    className="text-xs font-medium text-[var(--text-tertiary)] hover:text-orange-400"
                                                >
                                                    {idea.linked ? 'Remove from workspace' : 'Link to workspace'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : <EmptyLine>No Perci BARS ideas yet. Capture or import ideas in BARS to make this workspace smarter.</EmptyLine>}
                    </SummaryCard>

                    <SummaryCard
                        icon={Bot}
                        title="Recent Mission runs"
                        action={<button className="text-xs text-orange-400 hover:underline" onClick={() => openWindow(MODES.MISSION)}>Open Mission</button>}
                    >
                        {snapshot.missionRuns.length ? (
                            <div className="space-y-2">
                                {snapshot.missionRuns.map(run => (
                                    <div key={run.id || run.title} className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <button
                                                type="button"
                                                onClick={() => openWorkspaceItem('mission', run.id)}
                                                className="truncate text-left text-sm font-medium hover:text-orange-300"
                                            >
                                                {run.title}
                                            </button>
                                            <div className="flex items-center gap-2">
                                                {run.linked && <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-300">linked</span>}
                                                <span className="rounded-full bg-[var(--bg-hover)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">{run.status}</span>
                                            </div>
                                        </div>
                                        {run.agent && <p className="mt-1 text-xs text-[var(--text-tertiary)]">{run.agent}</p>}
                                        {run.validation?.status && (
                                            <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                                                <ShieldCheck size={12} className={run.validation.status === 'passed' ? 'text-emerald-400' : 'text-amber-400'} />
                                                Validation: {run.validation.status}
                                                {run.validation.summary ? ` - ${run.validation.summary}` : ''}
                                            </p>
                                        )}
                                        {run.id && (
                                            <div className="mt-2 flex items-center gap-3">
                                                <button
                                                    type="button"
                                                    onClick={() => openWorkspaceItem('mission', run.id)}
                                                    className="text-xs font-medium text-orange-400 hover:underline"
                                                >
                                                    Open run
                                                </button>
                                                {run.validation?.status === 'needed' && (
                                                    <button
                                                        type="button"
                                                        onClick={() => startValidation(run)}
                                                        className="text-xs font-medium text-orange-400 hover:underline"
                                                    >
                                                        Validate in Git Shells
                                                    </button>
                                                )}
                                                <button
                                                    type="button"
                                                    onClick={() => updateLink('linkedMissionRunIds', run.id, !run.linked)}
                                                    className="text-xs font-medium text-[var(--text-tertiary)] hover:text-orange-400"
                                                >
                                                    {run.linked ? 'Remove from workspace' : 'Link to workspace'}
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : <EmptyLine>No matching Mission runs yet. Agent work and validation history will appear here.</EmptyLine>}
                    </SummaryCard>

                    <SummaryCard
                        icon={MessageSquare}
                        title="Workspace chats"
                        action={<button className="text-xs text-orange-400 hover:underline" onClick={startWorkspaceChat}>New chat</button>}
                    >
                        {workspaceChats.length ? (
                            <div className="space-y-2">
                                {workspaceChats.map(chat => (
                                    <button
                                        key={chat.id}
                                        type="button"
                                        onClick={() => openWorkspaceChat(chat.id)}
                                        className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-left hover:border-orange-500/30"
                                    >
                                        <span className="truncate text-sm font-medium">{chat.title}</span>
                                        <span className="shrink-0 text-[10px] text-[var(--text-tertiary)]">{chat.messageCount} messages</span>
                                    </button>
                                ))}
                            </div>
                        ) : (
                            <EmptyLine>Start a workspace chat to discuss decisions without losing the active goal and folder context.</EmptyLine>
                        )}
                    </SummaryCard>

                    <SummaryCard
                        icon={Brain}
                        title="Workspace memory"
                        action={<button className="text-xs text-orange-400 hover:underline" onClick={() => openWindow(MODES.MISSION)}>Open memory review</button>}
                    >
                        {snapshot.memoryCandidates.length ? (
                            <div className="space-y-2">
                                {snapshot.memoryCandidates.map(candidate => (
                                    <div key={candidate.id} className="rounded-xl border border-amber-500/20 bg-[var(--bg-primary)] p-3">
                                        <p className="line-clamp-3 text-xs leading-5 text-[var(--text-secondary)]">{candidate.text}</p>
                                        <div className="mt-2 flex gap-3">
                                            <button
                                                type="button"
                                                onClick={() => resolveWorkspaceMemory(candidate.id, 'saved')}
                                                className="text-xs font-medium text-emerald-400 hover:underline"
                                            >
                                                Save memory
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => resolveWorkspaceMemory(candidate.id, 'discarded')}
                                                className="text-xs font-medium text-[var(--text-tertiary)] hover:text-red-400"
                                            >
                                                Discard
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : snapshot.memories.length ? (
                            <div className="space-y-2">
                                {snapshot.memories.map(memory => (
                                    <div key={memory.id || memory.title} className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                                        <p className="text-xs font-medium">{memory.title}</p>
                                        <p className="mt-1 line-clamp-3 text-xs leading-5 text-[var(--text-tertiary)]">{memory.text}</p>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <EmptyLine>Validated outcomes and approved Mission candidates will become reusable workspace memory.</EmptyLine>
                        )}
                    </SummaryCard>

                    <SummaryCard
                        icon={TerminalSquare}
                        title="Execution surfaces"
                        action={<button className="text-xs text-orange-400 hover:underline" onClick={() => openWindow(MODES.COWORK)}>Open Cowork</button>}
                    >
                        <div className="mb-3 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex min-w-0 items-center gap-2">
                                    <span className={`h-2 w-2 shrink-0 rounded-full ${
                                        coworkActivity.state === 'active' ? 'bg-emerald-400'
                                            : coworkActivity.state === 'awaiting' ? 'bg-amber-400'
                                                : coworkActivity.state === 'ready' ? 'bg-blue-400'
                                                    : 'bg-[var(--text-tertiary)]'
                                    }`} />
                                    <p className="truncate text-sm font-medium">{coworkActivity.label}</p>
                                </div>
                                <span className="text-[10px] uppercase text-[var(--text-tertiary)]">Cowork</span>
                            </div>
                            {coworkActivity.sessions.length ? (
                                <div className="mt-2 space-y-1">
                                    {coworkActivity.sessions.map(session => (
                                        <button
                                            key={session.id || session.title}
                                            type="button"
                                            onClick={() => openCoworkSession(session.id)}
                                            className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left hover:bg-[var(--bg-hover)]"
                                        >
                                            <span className="truncate text-xs text-[var(--text-secondary)]">{session.title}</span>
                                            <span className="shrink-0 text-[10px] text-[var(--text-tertiary)]">{session.status}</span>
                                        </button>
                                    ))}
                                </div>
                            ) : (
                                <p className="mt-2 text-xs text-[var(--text-tertiary)]">Start Cowork here to create workspace-scoped agent activity.</p>
                            )}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                                <p className="text-xs text-[var(--text-tertiary)]">Git Shells project</p>
                                <p className="mt-1 text-sm font-medium">{snapshot.gitShells.activeProjectName || 'None selected'}</p>
                            </div>
                            <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                                <p className="text-xs text-[var(--text-tertiary)]">Open terminals</p>
                                <p className="mt-1 text-sm font-medium">{snapshot.gitShells.terminalCount || 0}</p>
                            </div>
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3">
                            <button
                                type="button"
                                onClick={() => openWorkspaceTarget('cowork')}
                                className="inline-flex items-center gap-2 rounded-xl border border-orange-500/30 px-3 py-2 text-xs font-medium text-orange-400 hover:bg-orange-500/10"
                            >
                                Start Cowork with workspace context
                                <ArrowRight size={13} />
                            </button>
                            <button
                                type="button"
                                onClick={() => openWorkspaceTarget('projects')}
                                className="inline-flex items-center gap-2 px-1 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-orange-400"
                            >
                                Open Git Shells
                            </button>
                        </div>
                    </SummaryCard>

                    <SummaryCard
                        icon={ScrollText}
                        title="Context surfaces"
                        action={<button className="text-xs text-orange-400 hover:underline" onClick={() => openWindow(MODES.NOTES)}>Open Notes</button>}
                    >
                        <div className="space-y-3 text-sm text-[var(--text-secondary)]">
                            <p className="flex items-center gap-2"><FolderOpen size={14} className="text-blue-400" /> Folder context is read from the active workspace.</p>
                            <div className="space-y-2">
                                <p className="flex items-center gap-2"><CheckCircle2 size={14} className="text-emerald-400" /> Linked note refs</p>
                                {snapshot.workspace.linkedNoteRefs?.length ? (
                                    <div className="flex flex-wrap gap-2">
                                        {snapshot.workspace.linkedNoteRefs.map(ref => (
                                            <span key={ref} className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-xs">
                                                <button
                                                    type="button"
                                                    onClick={() => openWorkspaceItem('notes', ref)}
                                                    className="hover:text-orange-300"
                                                >
                                                    {ref}
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => startCoworkWithContext({ type: 'notes', ref })}
                                                    className="text-[var(--text-tertiary)] hover:text-orange-300"
                                                    aria-label={`Plan with ${ref} in Cowork`}
                                                    title="Plan with this note in Cowork"
                                                >
                                                    <Bot size={12} />
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => updateLink('linkedNoteRefs', ref, false)}
                                                    className="text-[var(--text-tertiary)] hover:text-red-400"
                                                    aria-label={`Remove ${ref}`}
                                                >
                                                    <X size={12} />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyLine>Add a note title or filename to pin it to this workspace.</EmptyLine>
                                )}
                                <form onSubmit={addNoteRef} className="flex gap-2">
                                    <input
                                        value={noteDraft}
                                        onChange={(event) => setNoteDraft(event.target.value)}
                                        placeholder="Index.md or [[Power User Brief]]"
                                        className="min-w-0 flex-1 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-xs outline-none focus:border-orange-500"
                                    />
                                    <button
                                        type="submit"
                                        className="inline-flex items-center gap-1 rounded-xl border border-orange-500/30 px-3 py-2 text-xs font-medium text-orange-400 hover:bg-orange-500/10"
                                    >
                                        <Plus size={13} />
                                        Link
                                    </button>
                                </form>
                            </div>
                        </div>
                    </SummaryCard>
                </div>
            </div>
        </div>
    );
}
