import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    Bot,
    CheckCircle2,
    ClipboardCheck,
    Clock3,
    GitBranch,
    History,
    PauseCircle,
    PlayCircle,
    RefreshCw,
    RotateCcw,
    Server,
    ShieldCheck,
    Sparkles,
    Square,
    TerminalSquare,
    XOctagon
} from 'lucide-react';
import { useMode } from '../context/ModeContext';
import { readJsonStorage } from '../lib/persistentStore';
import {
    MISSION_MEMORY_KEY,
    buildFinishReport,
    buildMemoryCandidate,
    MISSION_UPDATED_EVENT,
    appendMissionRunEvent,
    readMissionRuns,
    readMemoryCandidates,
    recordMissionRunValidation,
    recordGatewayCheck,
    saveMemoryCandidates,
    saveMissionRuns,
    setMissionValidationTarget
} from '../lib/missionControl';

const STATUS_META = {
    running: { label: 'Running', color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/20', icon: PlayCircle },
    waiting: { label: 'Waiting', color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', icon: PauseCircle },
    blocked: { label: 'Blocked', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20', icon: AlertTriangle },
    completed: { label: 'Done', color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20', icon: CheckCircle2 },
    cancelled: { label: 'Cancelled', color: 'text-zinc-400', bg: 'bg-zinc-500/10', border: 'border-zinc-500/20', icon: XOctagon }
};

const RUN_FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'blocked', label: 'Blocked' },
    { id: 'needs-validation', label: 'Needs validation' },
    { id: 'done', label: 'Done' },
    { id: 'gateway', label: 'OpenClaw' },
    { id: 'terminal', label: 'Terminal' },
    { id: 'cowork', label: 'Cowork' },
    { id: 'code', label: 'Code' },
    { id: 'build', label: 'Build' }
];

function formatTime(value) {
    if (!value) return 'Unknown';
    return new Intl.DateTimeFormat(undefined, {
        hour: 'numeric',
        minute: '2-digit',
        month: 'short',
        day: 'numeric'
    }).format(new Date(value));
}

function getCheckpointClass(state) {
    if (state === 'done') return 'text-emerald-400';
    if (state === 'active') return 'text-amber-400';
    if (state === 'blocked') return 'text-red-400';
    return 'text-[var(--text-tertiary)]';
}

export default function MissionControl({ openClawStatus, onRestartOpenClaw, isRestartingOpenClaw }) {
    const { openClawConfig, setShowOpenClawDashboard } = useMode();
    const [runs, setRuns] = useState(() => readMissionRuns());
    const [selectedRunId, setSelectedRunId] = useState(() => runs[0]?.id || null);
    const [memoryNotes, setMemoryNotes] = useState(() => {
        const saved = readJsonStorage(MISSION_MEMORY_KEY, null);
        return Array.isArray(saved) ? saved : [];
    });
    const [memoryCandidates, setMemoryCandidates] = useState(() => readMemoryCandidates());
    const [memoryDraft, setMemoryDraft] = useState('');
    const [isCheckingGateway, setIsCheckingGateway] = useState(false);
    const [gatewayCheck, setGatewayCheck] = useState(null);
    const [activeFilter, setActiveFilter] = useState('all');
    const [validationDraft, setValidationDraft] = useState('');

    const activeProfile = openClawConfig.profiles.find(profile => profile.id === openClawConfig.activeProfileId) || openClawConfig.profiles[0];
    const filteredRuns = useMemo(() => runs.filter(run => matchesRunFilter(run, activeFilter)), [runs, activeFilter]);
    const selectedRun = filteredRuns.find(run => run.id === selectedRunId) || filteredRuns[0] || runs[0];
    const gatewayRun = runs.find(run => run.id === 'mission-openclaw-health');
    const gatewayDetails = gatewayRun?.gateway || null;
    const finishReport = useMemo(() => buildFinishReport(selectedRun), [selectedRun]);
    const pendingMemoryCandidates = memoryCandidates.filter(candidate => candidate.status === 'pending');

    useEffect(() => {
        const handleMissionUpdate = (event) => {
            const nextRuns = Array.isArray(event.detail) ? event.detail : readMissionRuns();
            setRuns(nextRuns);
        };

        window.addEventListener(MISSION_UPDATED_EVENT, handleMissionUpdate);
        window.addEventListener('storage', handleMissionUpdate);
        return () => {
            window.removeEventListener(MISSION_UPDATED_EVENT, handleMissionUpdate);
            window.removeEventListener('storage', handleMissionUpdate);
        };
    }, []);

    useEffect(() => {
        setSelectedRunId(current => (
            current && filteredRuns.some(run => run.id === current)
                ? current
                : filteredRuns[0]?.id || null
        ));
    }, [filteredRuns]);

    useEffect(() => {
        localStorage.setItem(MISSION_MEMORY_KEY, JSON.stringify(memoryNotes));
    }, [memoryNotes]);

    useEffect(() => {
        setValidationDraft('');
    }, [selectedRun?.id]);

    useEffect(() => {
        setMissionValidationTarget(needsValidation(selectedRun) ? selectedRun.id : null);
    }, [selectedRun]);

    useEffect(() => {
        const existingSourceIds = new Set(memoryCandidates.map(candidate => candidate.sourceRunId));
        const existingMemorySourceIds = new Set(memoryNotes.map(note => note.sourceRunId).filter(Boolean));
        const nextCandidates = runs
            .filter(run => !existingSourceIds.has(run.id) && !existingMemorySourceIds.has(run.id))
            .map(buildMemoryCandidate)
            .filter(Boolean);

        if (nextCandidates.length > 0) {
            setMemoryCandidates(saveMemoryCandidates([...nextCandidates, ...memoryCandidates]));
        }
    }, [runs, memoryCandidates, memoryNotes]);

    const counts = useMemo(() => {
        return runs.reduce((acc, run) => {
            acc[run.status] = (acc[run.status] || 0) + 1;
            if (needsValidation(run)) {
                acc.needsValidation = (acc.needsValidation || 0) + 1;
            }
            return acc;
        }, {});
    }, [runs]);

    const updateRunStatus = useCallback((runId, status) => {
        const nextRuns = runs.map(run => (
            run.id === runId
                ? { ...run, status, updatedAt: new Date().toISOString() }
                : run
        ));
        setRuns(saveMissionRuns(nextRuns));
    }, [runs]);

    const retryRun = useCallback((runId) => {
        const nextRuns = runs.map(run => (
            run.id === runId
                ? {
                    ...run,
                    status: 'running',
                    updatedAt: new Date().toISOString(),
                    checkpoints: run.checkpoints.map((checkpoint, index) => (
                        index === 0 ? { ...checkpoint, state: 'active' } : checkpoint
                    )),
                    next: 'Retry started from Mission Control. Watch the run inspector for validation status.'
                }
                : run
        ));
        setRuns(saveMissionRuns(nextRuns));
        appendMissionRunEvent(runId, {
            type: 'info',
            title: 'Retry requested',
            detail: 'Run was restarted from Mission Control.'
        });
    }, [runs]);

    const checkGateway = useCallback(async () => {
        if (!window.electron?.testOpenClawConnection || !activeProfile) return;
        setIsCheckingGateway(true);
        const result = await window.electron.testOpenClawConnection(activeProfile);
        setGatewayCheck({ ...result, checkedAt: new Date().toISOString() });
        recordGatewayCheck(activeProfile, result, 'manual check');
        setIsCheckingGateway(false);
    }, [activeProfile]);

    const addMemoryNote = useCallback((e) => {
        e.preventDefault();
        const text = memoryDraft.trim();
        if (!text) return;
        setMemoryNotes(prev => [
            {
                id: `memory-${Date.now()}`,
                text,
                createdAt: new Date().toISOString(),
                sourceRunId: selectedRun?.id || null
            },
            ...prev
        ].slice(0, 12));
        setMemoryDraft('');
    }, [memoryDraft, selectedRun]);

    const saveMemoryCandidate = useCallback((candidate) => {
        setMemoryNotes(prev => [
            {
                id: `memory-${Date.now()}`,
                text: candidate.text,
                createdAt: new Date().toISOString(),
                sourceRunId: candidate.sourceRunId,
                sourceType: candidate.sourceType
            },
            ...prev
        ].slice(0, 12));
        setMemoryCandidates(prev => saveMemoryCandidates(prev.map(item => (
            item.id === candidate.id
                ? { ...item, status: 'saved', resolvedAt: new Date().toISOString() }
                : item
        ))));
    }, []);

    const discardMemoryCandidate = useCallback((candidate) => {
        setMemoryCandidates(prev => saveMemoryCandidates(prev.map(item => (
            item.id === candidate.id
                ? { ...item, status: 'discarded', resolvedAt: new Date().toISOString() }
                : item
        ))));
    }, []);

    const markValidation = useCallback((status) => {
        if (!selectedRun) return;
        const nextRuns = recordMissionRunValidation(selectedRun.id, status, validationDraft);
        setRuns(nextRuns);
        setValidationDraft('');
    }, [selectedRun, validationDraft]);

    const healthState = gatewayCheck
        ? (gatewayCheck.ok ? 'online' : 'offline')
        : openClawStatus?.state;
    const healthError = gatewayCheck?.error || openClawStatus?.result?.error || gatewayDetails?.error;
    const lastGatewayCheck = gatewayCheck?.checkedAt || openClawStatus?.checkedAt || gatewayDetails?.checkedAt;

    return (
        <div className="h-full min-h-0 overflow-hidden bg-[var(--bg-primary)]">
            <div className="h-full min-h-0 grid grid-cols-[320px_minmax(0,1fr)_340px] max-xl:grid-cols-[300px_minmax(0,1fr)] max-lg:grid-cols-1">
                <aside className="min-h-0 border-r border-[var(--border)] bg-[var(--bg-secondary)] flex flex-col">
                    <div className="p-4 border-b border-[var(--border)]">
                        <div className="flex items-center gap-2">
                            <div className="h-9 w-9 rounded-lg bg-[var(--bg-tertiary)] border border-[var(--border)] flex items-center justify-center">
                                <TerminalSquare size={18} className="text-[var(--accent)]" />
                            </div>
                            <div>
                                <h2 className="text-base font-semibold text-[var(--text-primary)]">Mission Control</h2>
                                <p className="text-xs text-[var(--text-tertiary)]">Runs, results, and memories your AI should keep</p>
                            </div>
                        </div>

                        {pendingMemoryCandidates.length > 0 && (
                            <div className="mt-4 rounded-lg border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2">
                                <div className="text-xs font-semibold text-[var(--accent)]">
                                    {pendingMemoryCandidates.length} memory {pendingMemoryCandidates.length === 1 ? 'candidate' : 'candidates'} waiting
                                </div>
                                <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                                    Save the outcomes this AI should remember before they disappear into chat history.
                                </p>
                            </div>
                        )}

                        <div className="mt-4 grid grid-cols-4 gap-2">
                            <Metric label="Active" value={(counts.running || 0) + (counts.waiting || 0)} />
                            <Metric label="Blocked" value={counts.blocked || 0} />
                            <Metric label="Validate" value={counts.needsValidation || 0} />
                            <Metric label="Memory" value={pendingMemoryCandidates.length} />
                        </div>

                        <div className="mt-4 flex flex-wrap gap-1.5">
                            {RUN_FILTERS.map(filter => (
                                <button
                                    key={filter.id}
                                    type="button"
                                    onClick={() => setActiveFilter(filter.id)}
                                    className={`rounded-md border px-2 py-1 text-[11px] font-medium transition-colors ${
                                        activeFilter === filter.id
                                            ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                                            : 'border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                                    }`}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
                        {filteredRuns.length === 0 ? (
                            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-sm leading-6 text-[var(--text-secondary)]">
                                No Mission runs match this filter.
                            </div>
                        ) : filteredRuns.map(run => (
                            <RunListItem
                                key={run.id}
                                run={run}
                                active={selectedRun?.id === run.id}
                                onSelect={() => setSelectedRunId(run.id)}
                            />
                        ))}
                    </div>
                </aside>

                <section className="min-h-0 overflow-y-auto">
                    {selectedRun && (
                        <div className="p-6 max-w-5xl mx-auto">
                            <div className="flex flex-wrap items-start justify-between gap-4">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <StatusBadge status={selectedRun.status} />
                                        {needsValidation(selectedRun) && <ValidationBadge />}
                                    </div>
                                    <h1 className="mt-3 text-2xl font-semibold text-[var(--text-primary)]">{selectedRun.title}</h1>
                                    <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--text-secondary)]">{selectedRun.objective}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    {selectedRun.status === 'running' ? (
                                        <ActionButton icon={PauseCircle} label="Pause" onClick={() => updateRunStatus(selectedRun.id, 'waiting')} />
                                    ) : (
                                        <ActionButton icon={PlayCircle} label="Resume" onClick={() => updateRunStatus(selectedRun.id, 'running')} />
                                    )}
                                    <ActionButton icon={RotateCcw} label="Retry" onClick={() => retryRun(selectedRun.id)} />
                                    <ActionButton icon={Square} label="Cancel" onClick={() => updateRunStatus(selectedRun.id, 'cancelled')} />
                                </div>
                            </div>

                            <div className="mt-6 grid grid-cols-3 gap-3 max-md:grid-cols-1">
                                <InfoTile icon={Bot} label="Agent" value={selectedRun.agent} />
                                <InfoTile icon={Clock3} label="Updated" value={formatTime(selectedRun.updatedAt)} />
                                <InfoTile icon={GitBranch} label="Workspace" value={selectedRun.workingDirectory} mono />
                            </div>

                            <div className="mt-6 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                                <Panel title="Why This Is Running" icon={Sparkles}>
                                    <p className="text-sm leading-6 text-[var(--text-secondary)]">{selectedRun.reason}</p>
                                </Panel>

                                <Panel title="Next Action" icon={ClipboardCheck}>
                                    <p className="text-sm leading-6 text-[var(--text-secondary)]">{selectedRun.next}</p>
                                </Panel>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                                <Panel title="Checkpoints" icon={History}>
                                    <div className="space-y-3">
                                        {(selectedRun.checkpoints || []).map((checkpoint, index) => (
                                            <div key={`${checkpoint.label}-${index}`} className="flex items-center gap-3">
                                                <span className={`h-2.5 w-2.5 rounded-full ${checkpoint.state === 'done' ? 'bg-emerald-400' : checkpoint.state === 'active' ? 'bg-amber-400' : checkpoint.state === 'blocked' ? 'bg-red-400' : 'bg-[var(--bg-tertiary)] border border-[var(--border)]'}`} />
                                                <span className={`text-sm ${getCheckpointClass(checkpoint.state)}`}>{checkpoint.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </Panel>

                                <Panel title="Risk Notes" icon={ShieldCheck}>
                                    <ul className="space-y-2">
                                        {(selectedRun.risks || []).map(risk => (
                                            <li key={risk} className="text-sm leading-6 text-[var(--text-secondary)]">{risk}</li>
                                        ))}
                                    </ul>
                                </Panel>
                            </div>

                            <div className="mt-4 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                                <Panel title="Commands" icon={TerminalSquare}>
                                    <div className="space-y-2">
                                        {(selectedRun.commands || []).map(command => (
                                            <code key={command} className="block rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-secondary)] overflow-x-auto">{command}</code>
                                        ))}
                                    </div>
                                </Panel>

                                <Panel title="Touched Context" icon={GitBranch}>
                                    <div className="space-y-2">
                                        {(selectedRun.files || []).map(file => (
                                            <code key={file} className="block rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-xs text-[var(--text-secondary)] overflow-x-auto">{file}</code>
                                        ))}
                                    </div>
                                </Panel>
                            </div>

                            <div className="mt-4">
                                <Panel title="Finish Report" icon={ClipboardCheck}>
                                    <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
                                        <ReportField label="Outcome" value={finishReport.outcome} />
                                        <ReportField label="Validation" value={finishReport.validation} />
                                        <ReportField label="Remaining Risk" value={finishReport.remainingRisk} />
                                        <ReportField label="Next Action" value={finishReport.nextAction} />
                                    </div>
                                    <div className="mt-3 grid grid-cols-2 gap-3 max-lg:grid-cols-1">
                                        <ReportList label="Commands Attempted" values={finishReport.commandsAttempted} />
                                        <ReportList label="Context Touched" values={finishReport.contextTouched} />
                                    </div>
                                </Panel>
                            </div>

                            {selectedRun.validation && (
                                <div className="mt-4">
                                    <Panel title="Validation Actions" icon={ShieldCheck}>
                                        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 max-md:grid-cols-1">
                                            <textarea
                                                value={validationDraft}
                                                onChange={e => setValidationDraft(e.target.value)}
                                                placeholder="Short validation result, command, or failure note..."
                                                className="min-h-[84px] w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm leading-5 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
                                            />
                                            <div className="flex min-w-[140px] flex-col gap-2 max-md:flex-row">
                                                <ActionButton icon={CheckCircle2} label="Mark validated" onClick={() => markValidation('passed')} />
                                                <ActionButton icon={XOctagon} label="Mark failed" onClick={() => markValidation('failed')} />
                                            </div>
                                        </div>
                                        <p className="mt-2 text-xs leading-5 text-[var(--text-tertiary)]">
                                            This updates the Finish Report, removes passed or failed runs from Needs validation, and records the result in the timeline.
                                        </p>
                                    </Panel>
                                </div>
                            )}

                            {selectedRun.terminal && (
                                <div className="mt-4">
                                    <Panel title="Terminal Result" icon={TerminalSquare}>
                                        <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3 max-md:grid-cols-1">
                                            <ReportField
                                                label="Exit Code"
                                                value={selectedRun.terminal.exitCode === null || selectedRun.terminal.exitCode === undefined
                                                    ? 'Pending'
                                                    : String(selectedRun.terminal.exitCode)}
                                            />
                                            <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                                                <div className="text-[11px] font-semibold uppercase text-[var(--text-tertiary)]">Output</div>
                                                <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-[var(--text-secondary)]">
                                                    {selectedRun.terminal.outputSnippet || 'No output captured yet.'}
                                                </pre>
                                            </div>
                                        </div>
                                    </Panel>
                                </div>
                            )}

                            <div className="mt-4">
                                <Panel title="Run Events" icon={History}>
                                    {selectedRun.events?.length ? (
                                        <div className="space-y-3">
                                            {selectedRun.events.map(event => (
                                                <div key={event.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <span className="text-sm font-medium text-[var(--text-primary)]">{event.title}</span>
                                                        <span className="text-[11px] text-[var(--text-tertiary)]">{formatTime(event.createdAt)}</span>
                                                    </div>
                                                    {event.detail && (
                                                        <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">{event.detail}</p>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-sm leading-6 text-[var(--text-secondary)]">No recorded events yet.</p>
                                    )}
                                </Panel>
                            </div>
                        </div>
                    )}
                </section>

                <aside className="min-h-0 overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-secondary)] p-4 flex flex-col gap-4 max-xl:col-span-2 max-xl:border-l-0 max-xl:border-t max-lg:col-span-1">
                    <div className="order-2">
                    <Panel title="OpenClaw Integration" icon={Server}>
                        <p className="mb-3 text-xs leading-5 text-[var(--text-secondary)]">
                            Gateway status for the OpenClaw dashboard and agent handoff.
                        </p>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className={`text-sm font-semibold ${healthState === 'online' ? 'text-emerald-400' : healthState === 'checking' ? 'text-amber-400' : 'text-red-400'}`}>
                                    {healthState === 'online' ? 'Gateway reachable' : healthState === 'checking' ? 'Checking gateway' : 'Gateway unreachable'}
                                </div>
                                <div className="mt-1 text-xs font-medium text-[var(--text-secondary)]">{gatewayDetails?.profileName || activeProfile?.name || 'No profile configured'}</div>
                                <div className="mt-1 text-xs font-mono text-[var(--text-tertiary)] break-all">{gatewayDetails?.gatewayUrl || activeProfile?.gatewayUrl || 'No gateway configured'}</div>
                            </div>
                            <span className={`h-2.5 w-2.5 rounded-full ${healthState === 'online' ? 'bg-emerald-400' : healthState === 'checking' ? 'bg-amber-400' : 'bg-red-400'}`} />
                        </div>
                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5">
                                <div className="text-[var(--text-tertiary)]">Mode</div>
                                <div className="mt-0.5 text-[var(--text-secondary)]">{gatewayDetails?.mode || activeProfile?.mode || 'local'}</div>
                            </div>
                            <div className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5">
                                <div className="text-[var(--text-tertiary)]">Last check</div>
                                <div className="mt-0.5 text-[var(--text-secondary)]">{lastGatewayCheck ? formatTime(lastGatewayCheck) : 'Not checked'}</div>
                            </div>
                        </div>
                        {(gatewayDetails?.controlUrl || activeProfile?.controlUrl) && (
                            <div className="mt-2 text-xs font-mono text-[var(--text-tertiary)] break-all">
                                {gatewayDetails?.controlUrl || activeProfile?.controlUrl}
                            </div>
                        )}
                        {healthError && (
                            <p className="mt-3 text-xs leading-5 text-red-400">{healthError}</p>
                        )}
                        <div className="mt-4 flex flex-wrap gap-2">
                            <ActionButton icon={RefreshCw} label={isCheckingGateway ? 'Checking' : 'Check'} onClick={checkGateway} disabled={isCheckingGateway || !window.electron?.testOpenClawConnection} />
                            <ActionButton icon={Server} label="Open" onClick={() => setShowOpenClawDashboard(true)} />
                            {window.electron?.restartOpenClawGateway && activeProfile?.mode === 'local' && (
                                <ActionButton icon={RefreshCw} label={isRestartingOpenClaw ? 'Restarting' : 'Restart'} onClick={onRestartOpenClaw} disabled={isRestartingOpenClaw} />
                            )}
                        </div>
                    </Panel>
                    </div>

                    <div className="order-1">
                    <Panel title="Memory Review" icon={ClipboardCheck}>
                        <div className="mb-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2">
                            <div className="text-xs font-semibold text-[var(--text-primary)]">What should this AI remember?</div>
                            <p className="mt-1 text-xs leading-5 text-[var(--text-secondary)]">
                                Completed and blocked runs become short, auditable memory candidates that you approve before saving.
                            </p>
                        </div>
                        <div className="space-y-2">
                            {pendingMemoryCandidates.length === 0 ? (
                                <p className="text-sm leading-6 text-[var(--text-secondary)]">No memory candidates waiting for review.</p>
                            ) : pendingMemoryCandidates.map(candidate => (
                                <div key={candidate.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="text-[11px] font-semibold uppercase text-[var(--accent)]">{candidate.sourceType}</span>
                                        <span className="text-[11px] text-[var(--text-tertiary)]">{formatTime(candidate.createdAt)}</span>
                                    </div>
                                    <p className="mt-2 text-sm leading-5 text-[var(--text-secondary)]">{candidate.text}</p>
                                    <div className="mt-3 flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => saveMemoryCandidate(candidate)}
                                            className="rounded-md bg-[var(--accent)] px-2.5 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-hover)] transition-colors"
                                        >
                                            Save
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => discardMemoryCandidate(candidate)}
                                            className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                                        >
                                            Discard
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>

                        <div className="my-4 h-px bg-[var(--border)]" />

                        <form onSubmit={addMemoryNote} className="space-y-3">
                            <textarea
                                value={memoryDraft}
                                onChange={e => setMemoryDraft(e.target.value)}
                                placeholder="Capture a short decision, rejected approach, or operational fix..."
                                className="w-full min-h-[92px] resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm leading-5 text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)]"
                            />
                            <button type="submit" className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--accent-hover)] transition-colors">
                                Save Manual Note
                            </button>
                        </form>
                        <div className="mt-4 space-y-2">
                            {memoryNotes.length === 0 ? (
                                <p className="text-sm leading-6 text-[var(--text-secondary)]">No saved memory notes yet.</p>
                            ) : memoryNotes.map(note => (
                                <div key={note.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                                    <p className="text-sm leading-5 text-[var(--text-secondary)]">{note.text}</p>
                                    <p className="mt-2 text-[11px] text-[var(--text-tertiary)]">{formatTime(note.createdAt)}</p>
                                </div>
                            ))}
                        </div>
                    </Panel>
                    </div>
                </aside>
            </div>
        </div>
    );
}

function Metric({ label, value }) {
    return (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2">
            <div className="text-lg font-semibold text-[var(--text-primary)]">{value}</div>
            <div className="text-[11px] uppercase text-[var(--text-tertiary)]">{label}</div>
        </div>
    );
}

function RunListItem({ run, active, onSelect }) {
    const meta = STATUS_META[run.status] || STATUS_META.waiting;
    const Icon = meta.icon;
    return (
        <button
            type="button"
            onClick={onSelect}
            className={`w-full text-left rounded-lg border p-3 transition-colors ${active ? 'border-[var(--accent)] bg-[var(--bg-primary)]' : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-primary)]'}`}
        >
            <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.color} ${meta.bg} ${meta.border}`}>
                        <Icon size={11} />
                        {meta.label}
                    </span>
                    {needsValidation(run) && <ValidationBadge compact />}
                </div>
                <span className="text-[11px] text-[var(--text-tertiary)]">{formatTime(run.updatedAt)}</span>
            </div>
            <div className="mt-3 text-sm font-semibold text-[var(--text-primary)]">{run.title}</div>
            <div className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--text-secondary)]">{run.objective}</div>
        </button>
    );
}

function StatusBadge({ status }) {
    const meta = STATUS_META[status] || STATUS_META.waiting;
    const Icon = meta.icon;
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${meta.color} ${meta.bg} ${meta.border}`}>
            <Icon size={13} />
            {meta.label}
        </span>
    );
}

function ValidationBadge({ compact = false }) {
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border border-amber-500/25 bg-amber-500/10 font-medium text-amber-400 ${compact ? 'px-2 py-0.5 text-[11px]' : 'px-2.5 py-1 text-xs'}`}>
            <AlertTriangle size={compact ? 11 : 13} />
            {compact ? 'Validate' : 'Needs validation'}
        </span>
    );
}

function ActionButton({ icon: Icon, label, onClick, disabled }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={disabled}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] disabled:opacity-50 disabled:hover:bg-[var(--bg-primary)] transition-colors"
        >
            <Icon size={14} />
            {label}
        </button>
    );
}

function InfoTile({ icon: Icon, label, value, mono }) {
    return (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            <div className="flex items-center gap-2 text-xs uppercase text-[var(--text-tertiary)]">
                <Icon size={13} />
                {label}
            </div>
            <div className={`mt-2 truncate text-sm text-[var(--text-primary)] ${mono ? 'font-mono' : ''}`}>{value}</div>
        </div>
    );
}

function ReportField({ label, value }) {
    return (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3">
            <div className="text-[11px] font-semibold uppercase text-[var(--text-tertiary)]">{label}</div>
            <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{value}</p>
        </div>
    );
}

function ReportList({ label, values }) {
    return (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3">
            <div className="text-[11px] font-semibold uppercase text-[var(--text-tertiary)]">{label}</div>
            <div className="mt-2 space-y-1.5">
                {(values || []).map(value => (
                    <code key={value} className="block rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5 text-xs text-[var(--text-secondary)] overflow-x-auto">{value}</code>
                ))}
            </div>
        </div>
    );
}

function Panel({ title, icon: Icon, children }) {
    return (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
            <div className="mb-3 flex items-center gap-2">
                <Icon size={15} className="text-[var(--accent)]" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
            </div>
            {children}
        </div>
    );
}

function matchesRunFilter(run, filter) {
    if (filter === 'all') return true;
    if (filter === 'active') return ['running', 'waiting'].includes(run.status);
    if (filter === 'blocked') return run.status === 'blocked';
    if (filter === 'needs-validation') return needsValidation(run);
    if (filter === 'done') return run.status === 'completed';
    return getRunSourceType(run) === filter;
}

function needsValidation(run) {
    return run?.validation?.status === 'needed';
}

function getRunSourceType(run) {
    if (run.id === 'mission-openclaw-health' || run.gateway) return 'gateway';
    if (run.id?.startsWith('terminal-') || run.agent === 'Opal Terminal') return 'terminal';
    if (run.id?.startsWith('cowork-') || run.agent === 'Opal Cowork Agent') return 'cowork';
    if (run.id?.startsWith('code-') || run.agent === 'Opal Code Assistant' || run.agent === 'Opal Code Editor') return 'code';
    if (run.id?.startsWith('build-') || run.agent === 'Opal Build Assistant') return 'build';
    return 'general';
}
