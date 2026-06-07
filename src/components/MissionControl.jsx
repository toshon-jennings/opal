import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    BookOpen,
    Bot,
    CheckCircle2,
    ClipboardCheck,
    Clock3,
    FileCode,
    GitBranch,
    History,
    Maximize2,
    PauseCircle,
    PlayCircle,
    RefreshCw,
    RotateCcw,
    Server,
    ShieldCheck,
    Sparkles,
    Square,
    TerminalSquare,
    X,
    XOctagon
} from 'lucide-react';
import { useMode } from '../context/ModeContext';
import { MissionControlGuideModal } from './MissionControlGuideModal';
import { readJsonStorage } from '../lib/persistentStore';
import { readIntentReviews } from '../lib/diffReview';
import { addHarnessMemory, readHarnessMemory } from '../lib/harnessMemory';
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
import { assignTransitLayout, buildMissionTransitGraph } from '../lib/transitMap';

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

function cancelTerminalRun(runId) {
    return new Promise((resolve) => {
        const port = localStorage.getItem('opal_terminal_port') || '3001';
        const socket = new WebSocket(`ws://localhost:${port}/?sessionId=default&telemetry=1`);
        const timeout = setTimeout(() => {
            socket.close();
            resolve({ ok: false, detail: 'Timed out while connecting to the local terminal server.' });
        }, 1500);
        socket.onopen = () => {
            socket.send(JSON.stringify({ type: 'cancelCommand', runId }));
        };
        socket.onmessage = (event) => {
            if (typeof event.data !== 'string') return;
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'commandCancelled' && message.runId === runId) {
                    clearTimeout(timeout);
                    socket.close();
                    resolve({ ok: true, detail: 'Sent Ctrl-C to the terminal session for this Mission run.' });
                }
            } catch {
                // Ignore non-protocol terminal data.
            }
        };
        socket.onerror = () => {
            clearTimeout(timeout);
            resolve({ ok: false, detail: 'Could not reach the local terminal server.' });
        };
    });
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
    const [harnessMemory, setHarnessMemory] = useState(() => readHarnessMemory());
    const [intentReviews, setIntentReviews] = useState(() => readIntentReviews());
    const [transitModalOpen, setTransitModalOpen] = useState(false);
    const [guideModalOpen, setGuideModalOpen] = useState(false);
    const [liveEvents, setLiveEvents] = useState([]);

    const activeProfile = openClawConfig.profiles.find(profile => profile.id === openClawConfig.activeProfileId) || openClawConfig.profiles[0];
    const filteredRuns = useMemo(() => runs.filter(run => matchesRunFilter(run, activeFilter)), [runs, activeFilter]);
    const selectedRun = filteredRuns.find(run => run.id === selectedRunId) || filteredRuns[0] || runs[0];
    const gatewayRun = runs.find(run => run.id === 'mission-openclaw-health');
    const gatewayDetails = gatewayRun?.gateway || null;
    const finishReport = useMemo(() => buildFinishReport(selectedRun), [selectedRun]);
    const pendingMemoryCandidates = memoryCandidates.filter(candidate => candidate.status === 'pending');
    const latestIntentReview = selectedRun?.review || intentReviews.find(review => (
        review.files?.some(file => selectedRun?.files?.includes(file))
    ));
    const transitGraph = useMemo(() => assignTransitLayout(buildMissionTransitGraph(runs, harnessMemory)), [runs, harnessMemory]);

    useEffect(() => {
        const handleMissionUpdate = (event) => {
            const nextRuns = Array.isArray(event.detail) ? event.detail : readMissionRuns();
            setRuns(nextRuns);
            setHarnessMemory(readHarnessMemory());
            setIntentReviews(readIntentReviews());
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

    const cancelRun = useCallback((run) => {
        if (!run) return;
        if (run.terminal && run.status === 'running') {
            cancelTerminalRun(run.id).then(result => {
                appendMissionRunEvent(run.id, {
                    type: result.ok ? 'info' : 'error',
                    title: result.ok ? 'Terminal interrupt sent' : 'Terminal interrupt unavailable',
                    detail: result.detail
                }, {
                    status: 'cancelled',
                    terminal: {
                        ...(run.terminal || {}),
                        cancelledAt: new Date().toISOString(),
                        cancelSignalSent: result.ok
                    },
                    checkpoints: [
                        ...(run.checkpoints || []).filter(checkpoint => !/cancel/i.test(checkpoint.label || '')),
                        { label: result.ok ? 'Cancel signal sent' : 'Cancel recorded locally', state: result.ok ? 'done' : 'blocked' }
                    ],
                    next: result.ok
                        ? 'Confirm the terminal has returned to a prompt before retrying.'
                        : 'Open the terminal panel and interrupt the process manually if it is still running.'
                });
                setRuns(readMissionRuns());
            });
            return;
        }
        appendMissionRunEvent(run.id, {
            type: 'info',
            title: 'Run cancelled',
            detail: 'Mission Control marked this run cancelled. Some provider calls cannot be interrupted after dispatch.'
        }, {
            status: 'cancelled',
            checkpoints: [
                ...(run.checkpoints || []).filter(checkpoint => checkpoint.state !== 'active'),
                { label: 'Cancellation recorded', state: 'done' }
            ],
            next: 'Start a new run when the provider or local process is ready.'
        });
    }, []);

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
        if (result.ok && window.electron?.getOpenClawGatewayStatus) {
            try {
                const status = await window.electron.getOpenClawGatewayStatus(activeProfile);
                if (status?.ok && status.health) result.health = status.health;
            } catch { /* keep bare reachability result */ }
        }
        setGatewayCheck({ ...result, checkedAt: new Date().toISOString() });
        recordGatewayCheck(activeProfile, result, 'manual check');
        setIsCheckingGateway(false);
    }, [activeProfile]);

    // Live gateway event stream — subscribe while Mission Control is open. The
    // raw log is noisy (CLI table dumps, migration warnings), so keep only
    // meaningful lines: warnings/errors or messages that mention agent/task/
    // session/gateway activity, and drop box-drawing table output.
    useEffect(() => {
        if (!activeProfile || !window.electron?.startOpenClawEvents || !window.electron?.onOpenClawEvent) return;
        const keyword = /\b(agent|task|session|exec|cron|gateway|completed|failed|started|cancelled|delivered)\b/i;
        const unsubscribe = window.electron.onOpenClawEvent((evt) => {
            if (!evt?.message || /[│┌├└┬┼┴]/.test(evt.message)) return;
            const meaningful = evt.level === 'warn' || evt.level === 'error' || evt.type === 'stream-error' || keyword.test(evt.message);
            if (!meaningful) return;
            setLiveEvents(prev => {
                const uniqueId = `${evt.time || Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
                return [{ ...evt, id: uniqueId }, ...prev].slice(0, 20);
            });
        });
        window.electron.startOpenClawEvents(activeProfile);
        return () => {
            unsubscribe();
            window.electron.stopOpenClawEvents?.();
        };
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
        addHarnessMemory({
            scope: selectedRun?.workingDirectory || 'global',
            sourceRunId: selectedRun?.id || null,
            sourceType: 'manual',
            title: 'Manual Mission memory',
            status: 'saved',
            tags: ['manual', selectedRun?.agent].filter(Boolean),
            text
        });
        setMemoryDraft('');
        setHarnessMemory(readHarnessMemory());
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
        addHarnessMemory({
            scope: selectedRun?.workingDirectory || 'global',
            sourceRunId: candidate.sourceRunId,
            sourceType: candidate.sourceType,
            title: `Mission memory: ${candidate.sourceType}`,
            status: 'saved',
            tags: ['mission', candidate.sourceType, candidate.quality?.verdict].filter(Boolean),
            quality: candidate.quality,
            text: candidate.text
        });
        setMemoryCandidates(prev => saveMemoryCandidates(prev.map(item => (
            item.id === candidate.id
                ? { ...item, status: 'saved', resolvedAt: new Date().toISOString() }
                : item
        ))));
        setHarnessMemory(readHarnessMemory());
    }, [selectedRun]);

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
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <h2 className="text-base font-semibold text-[var(--text-primary)]">Mission Control</h2>
                                    <button
                                        type="button"
                                        onClick={() => setGuideModalOpen(true)}
                                        className="inline-flex items-center gap-1 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                        title="Open Mission Control guide"
                                    >
                                        <BookOpen size={12} />
                                        Guide
                                    </button>
                                </div>
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

                        <div className="focus-field mt-4 grid grid-cols-4 gap-2">
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

                    <div className="focus-field flex-1 min-h-0 overflow-y-auto p-2 space-y-2 perci-domino-list">
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
                                    <ActionButton icon={Square} label="Cancel" onClick={() => cancelRun(selectedRun)} />
                                </div>
                            </div>

                            <div className="focus-field mt-6 grid grid-cols-5 gap-3 max-md:grid-cols-1">
                                <InfoTile icon={Bot} label="Agent" value={selectedRun.agent} />
                                <InfoTile icon={Clock3} label="Updated" value={formatTime(selectedRun.updatedAt)} />
                                <InfoTile icon={GitBranch} label="Workspace" value={selectedRun.workingDirectory} mono wide wrap />
                                <InfoTile icon={Sparkles} label="Memory" value={`${harnessMemory.length} notes`} />
                            </div>

                            <div className="focus-field mt-6 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                                <Panel title="Why This Is Running" icon={Sparkles}>
                                    <p className="text-sm leading-6 text-[var(--text-secondary)]">{selectedRun.reason}</p>
                                </Panel>

                                <Panel title="Next Action" icon={ClipboardCheck}>
                                    <p className="text-sm leading-6 text-[var(--text-secondary)]">{selectedRun.next}</p>
                                </Panel>
                            </div>

                            <div className="focus-field mt-4 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
                                <Panel title="Checkpoints" icon={History}>
                                    <div className={`space-y-3 perci-timeline ${selectedRun.status === 'running' ? 'streaming' : ''}`}>
                                        {(selectedRun.checkpoints || []).map((checkpoint, index) => (
                                            <div
                                                key={`${checkpoint.label}-${index}`}
                                                className={`perci-timeline-node flex items-center gap-3 ${checkpoint.state === 'active' ? 'is-running' : ''}`}
                                            >
                                                <span
                                                    className={`perci-timeline-dot ${
                                                        checkpoint.state === 'done'
                                                            ? 'is-done'
                                                            : checkpoint.state === 'active'
                                                                ? 'is-running'
                                                                : checkpoint.state === 'blocked'
                                                                    ? 'is-blocked'
                                                                    : ''
                                                    }`}
                                                />
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

                            <div className="focus-field mt-4 grid grid-cols-2 gap-4 max-lg:grid-cols-1">
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
                                    <div className="focus-field grid grid-cols-2 gap-3 max-lg:grid-cols-1">
                                        <ReportField label="Outcome" value={finishReport.outcome} />
                                        <ReportField label="Validation" value={finishReport.validation} />
                                        <ReportField label="Remaining Risk" value={finishReport.remainingRisk} />
                                        <ReportField label="Next Action" value={finishReport.nextAction} />
                                    </div>
                                    <div className="focus-field mt-3 grid grid-cols-2 gap-3 max-lg:grid-cols-1">
                                        <ReportList label="Commands Attempted" values={finishReport.commandsAttempted} />
                                        <ReportList label="Context Touched" values={finishReport.contextTouched} />
                                    </div>
                                </Panel>
                            </div>

                            {latestIntentReview && (
                                <div className="mt-4">
                                    <Panel title="Intent-First Review" icon={ShieldCheck}>
                                        <div className="focus-field grid grid-cols-2 gap-3 max-lg:grid-cols-1">
                                            <ReportField label="Summary" value={latestIntentReview.summary} />
                                            <ReportField label="Validation" value={latestIntentReview.validation?.summary || 'No validation detected.'} />
                                            <ReportList label="Files" values={latestIntentReview.files?.length ? latestIntentReview.files : ['No files detected.']} />
                                            <ReportList label="Risks" values={latestIntentReview.risks?.length ? latestIntentReview.risks : ['No obvious risks detected.']} />
                                        </div>
                                    </Panel>
                                </div>
                            )}

                            {selectedRun.validation && (
                                <div className="mt-4">
                                    <Panel title="Validation Actions" icon={ShieldCheck}>
                                        <div className="focus-field grid grid-cols-[minmax(0,1fr)_auto] gap-3 max-md:grid-cols-1">
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
                                        <div className="focus-field grid grid-cols-[160px_minmax(0,1fr)] gap-3 max-md:grid-cols-1">
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
                                        <div className={`space-y-3 perci-timeline perci-domino-list ${selectedRun.status === 'running' ? 'streaming' : ''}`}>
                                            {selectedRun.events.map((event, index) => (
                                                <div
                                                    key={event.id}
                                                    className={`perci-timeline-node rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 ${
                                                        selectedRun.status === 'running' && index === 0 ? 'is-running' : ''
                                                    }`}
                                                >
                                                    <span className={`perci-timeline-dot ${selectedRun.status === 'running' && index === 0 ? 'is-running' : 'is-done'}`} />
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

                <aside className="focus-field min-h-0 overflow-y-auto border-l border-[var(--border)] bg-[var(--bg-secondary)] p-4 flex flex-col gap-4 max-xl:col-span-2 max-xl:border-l-0 max-xl:border-t max-lg:col-span-1">
                    <div className="focus-card order-2">
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
                        {gatewayDetails?.health && (
                            <div className="mt-3 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-2 text-xs">
                                <div className="flex items-center justify-between">
                                    <span className="text-[var(--text-tertiary)]">Runtime</span>
                                    <span className="font-mono text-[var(--text-secondary)]">{gatewayDetails.health.runtimeVersion || '—'}</span>
                                </div>
                                {gatewayDetails.health.tasks?.total != null && (
                                    <div className="mt-1 flex items-center justify-between">
                                        <span className="text-[var(--text-tertiary)]">Tasks</span>
                                        <span className="text-[var(--text-secondary)]">
                                            {gatewayDetails.health.tasks.total} total · {gatewayDetails.health.tasks.active ?? 0} active
                                            {gatewayDetails.health.tasks.failures ? ` · ${gatewayDetails.health.tasks.failures} failed` : ''}
                                        </span>
                                    </div>
                                )}
                                {gatewayDetails.health.agents?.length > 0 && (
                                    <div className="mt-1 flex items-center justify-between gap-2">
                                        <span className="text-[var(--text-tertiary)]">Agents</span>
                                        <span className="text-right text-[var(--text-secondary)] break-all">{gatewayDetails.health.agents.join(', ')}</span>
                                    </div>
                                )}
                            </div>
                        )}
                        {healthError && (
                            <p className="mt-3 text-xs leading-5 text-red-400">{healthError}</p>
                        )}
                        {liveEvents.length > 0 && (
                            <div className="mt-3">
                                <div className="mb-1 flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
                                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                                    Live activity
                                </div>
                                <div className="max-h-40 overflow-y-auto rounded-md border border-[var(--border)] bg-[var(--bg-primary)] divide-y divide-[var(--border)]">
                                    {liveEvents.map(evt => (
                                        <div key={evt.id} className="px-2 py-1.5 text-xs">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className={`font-medium ${evt.level === 'error' || evt.type === 'stream-error' ? 'text-red-400' : evt.level === 'warn' ? 'text-amber-400' : 'text-[var(--text-secondary)]'}`}>
                                                    {evt.subsystem || evt.level || 'log'}
                                                </span>
                                                <span className="text-[var(--text-tertiary)]">{formatTime(evt.time)}</span>
                                            </div>
                                            <div className="mt-0.5 text-[var(--text-secondary)] break-words line-clamp-2">{evt.message}</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
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

                    <div className="focus-card order-1">
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
                                    {candidate.quality && (
                                        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
                                            <span className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-1.5 py-0.5 uppercase text-[var(--text-secondary)]">
                                                {candidate.quality.verdict} {candidate.quality.score}/8
                                            </span>
                                            {(candidate.quality.reasons || []).map(reason => (
                                                <span key={reason} className="rounded-md bg-[var(--bg-secondary)] px-1.5 py-0.5">{reason}</span>
                                            ))}
                                        </div>
                                    )}
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

                        <Panel
                            title="Transit Map"
                            icon={GitBranch}
                            action={<button type="button" onClick={() => setTransitModalOpen(true)} className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"><Maximize2 size={11} />Expand</button>}
                        >
                            <TransitGraph graph={transitGraph} runs={runs} />
                            <p className="mt-3 text-xs leading-5 text-[var(--text-secondary)]">
                                Click a node to inspect it, or expand for a full view.
                            </p>
                        </Panel>
                        {transitModalOpen && (
                            <TransitMapModal
                                graph={transitGraph}
                                runs={runs}
                                onClose={() => setTransitModalOpen(false)}
                            />
                        )}
                        <MissionControlGuideModal
                            isOpen={guideModalOpen}
                            onClose={() => setGuideModalOpen(false)}
                        />
                    </aside>
            </div>
        </div>
    );
}

function Metric({ label, value }) {
    return (
        <div className="focus-card rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2">
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
            className={`focus-card w-full text-left rounded-lg border p-3 transition-colors ${active ? 'border-[var(--accent)] bg-[var(--bg-primary)]' : 'border-transparent hover:border-[var(--border)] hover:bg-[var(--bg-primary)]'}`}
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

function InfoTile({ icon: Icon, label, value, mono, wide, wrap }) {
    return (
        <div className={`focus-card rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 ${wide ? 'md:col-span-2' : ''}`}>
            <div className="flex items-center gap-2 text-xs uppercase text-[var(--text-tertiary)]">
                <Icon size={13} />
                {label}
            </div>
            <div
                className={`mt-2 text-sm text-[var(--text-primary)] ${wrap ? 'break-all leading-5' : 'truncate'} ${mono ? 'font-mono' : ''}`}
                title={typeof value === 'string' ? value : undefined}
            >
                {value}
            </div>
        </div>
    );
}

function ReportField({ label, value }) {
    return (
        <div className="focus-card rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3">
            <div className="text-[11px] font-semibold uppercase text-[var(--text-tertiary)]">{label}</div>
            <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">{value}</p>
        </div>
    );
}

function ReportList({ label, values }) {
    return (
        <div className="focus-card rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3">
            <div className="text-[11px] font-semibold uppercase text-[var(--text-tertiary)]">{label}</div>
            <div className="mt-2 space-y-1.5">
                {(values || []).map(value => (
                    <code key={value} className="block rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5 text-xs text-[var(--text-secondary)] overflow-x-auto">{value}</code>
                ))}
            </div>
        </div>
    );
}

function Panel({ title, icon: Icon, children, action }) {
    return (
        <div className="focus-card rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
            <div className="mb-3 flex items-center gap-2">
                <Icon size={15} className="text-[var(--accent)]" />
                <h3 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h3>
                {action && <div className="ml-auto">{action}</div>}
            </div>
            {children}
        </div>
    );
}

function TransitGraph({ graph, runs = [], onNodeClick, selectedNodeId, compact = false }) {
    const [hoveredId, setHoveredId] = useState(null);
    const [inlineSelected, setInlineSelected] = useState(null);
    const nodes = graph?.nodes || [];
    const edges = graph?.edges || [];
    const byId = new Map(nodes.map(node => [node.id, node]));
    const activeSelected = selectedNodeId !== undefined ? selectedNodeId : inlineSelected;

    if (nodes.length === 0) {
        return <p className="text-sm leading-6 text-[var(--text-secondary)]">No run graph available yet.</p>;
    }

    const handleNodeClick = (node) => {
        if (onNodeClick) {
            onNodeClick(node);
        } else {
            setInlineSelected(prev => prev === node.id ? null : node.id);
        }
    };

    const selectedNode = nodes.find(n => n.id === activeSelected);
    const selectedRun = selectedNode?.id?.startsWith('run-')
        ? runs.find(r => `run-${r.id}` === selectedNode.id)
        : null;

    return (
        <div>
            <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]">
                <svg
                    viewBox={`0 0 ${graph.width} ${graph.height}`}
                    className={compact ? 'h-[420px] w-full' : 'h-[260px] w-full'}
                >
                    <defs>
                        <filter id="nodeShadow" x="-20%" y="-20%" width="140%" height="140%">
                            <feDropShadow dx="0" dy="2" stdDeviation="2" floodOpacity="0.18" />
                        </filter>
                    </defs>
                    {edges.map((edge, index) => {
                        const from = byId.get(edge.from);
                        const to = byId.get(edge.to);
                        if (!from || !to) return null;
                        const midX = (from.x + to.x) / 2;
                        const path = `M ${from.x} ${from.y} C ${midX} ${from.y}, ${midX} ${to.y}, ${to.x} ${to.y}`;
                        const isRelated = activeSelected && (edge.from === activeSelected || edge.to === activeSelected);
                        return (
                            <path
                                key={`${edge.from}-${edge.to}-${index}`}
                                d={path}
                                fill="none"
                                stroke={getLineColor(edge.label)}
                                strokeWidth={isRelated ? 4 : 3}
                                strokeLinecap="round"
                                opacity={activeSelected && !isRelated ? 0.2 : 0.75}
                            />
                        );
                    })}
                    {nodes.map(node => {
                        const isSelected = node.id === activeSelected;
                        const isHovered = node.id === hoveredId;
                        const isDimmed = activeSelected && !isSelected;
                        const r = node.type === 'origin' ? 10 : 8;
                        return (
                            <g
                                key={node.id}
                                transform={`translate(${node.x}, ${node.y})`}
                                style={{ cursor: 'pointer' }}
                                onClick={() => handleNodeClick(node)}
                                onMouseEnter={() => setHoveredId(node.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                opacity={isDimmed ? 0.3 : 1}
                            >
                                {(isSelected || isHovered) && (
                                    <circle r={r + 6} fill={getNodeColor(node)} opacity="0.2" />
                                )}
                                <circle r={r} fill={getNodeColor(node)} filter="url(#nodeShadow)" />
                                <circle r={node.type === 'origin' ? 4 : 3} fill="var(--bg-primary)" opacity="0.85" />
                                <text
                                    x="0"
                                    y="22"
                                    textAnchor="middle"
                                    className="fill-[var(--text-secondary)]"
                                    style={{ fontSize: 10, fontWeight: isSelected ? 700 : 600, pointerEvents: 'none' }}
                                >
                                    {truncateLabel(node.label)}
                                </text>
                            </g>
                        );
                    })}
                </svg>
            </div>
            {!onNodeClick && selectedNode && (
                <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3">
                    <NodeDetail node={selectedNode} run={selectedRun} />
                </div>
            )}
        </div>
    );
}

function NodeDetail({ node, run }) {
    if (!node) return null;
    const meta = run ? (STATUS_META[run.status] || STATUS_META.waiting) : null;
    const StatusIcon = meta?.icon;
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-[var(--text-primary)]">{node.label}</span>
                {meta && (
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.color} ${meta.bg} ${meta.border}`}>
                        <StatusIcon size={10} />
                        {meta.label}
                    </span>
                )}
                <span className="ml-auto text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">{node.type}</span>
            </div>
            {run?.objective && (
                <p className="text-xs leading-5 text-[var(--text-secondary)]">{run.objective}</p>
            )}
            {node.type === 'file' && node.path && (
                <code className="block text-xs text-[var(--text-secondary)] font-mono">{node.path}</code>
            )}
            {node.type === 'memory' && node.count !== undefined && (
                <p className="text-xs text-[var(--text-secondary)]">{node.count} memory entries loaded</p>
            )}
            {run?.files?.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                    {run.files.slice(0, 6).map(f => (
                        <span key={f} className="inline-flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--bg-secondary)] px-1.5 py-0.5 text-[10px] font-mono text-[var(--text-tertiary)]">
                            <FileCode size={9} />
                            {f.split('/').pop()}
                        </span>
                    ))}
                    {run.files.length > 6 && <span className="text-[10px] text-[var(--text-tertiary)]">+{run.files.length - 6} more</span>}
                </div>
            )}
            {node.updatedAt && (
                <p className="text-[11px] text-[var(--text-tertiary)]">{formatTime(node.updatedAt)}</p>
            )}
        </div>
    );
}

function TransitMapModal({ graph, runs, onClose }) {
    const [selectedNode, setSelectedNode] = useState(null);
    const overlayRef = useRef(null);

    useEffect(() => {
        const handleKey = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose]);

    const selectedRun = selectedNode?.id?.startsWith('run-')
        ? runs.find(r => `run-${r.id}` === selectedNode.id)
        : null;

    const LEGEND = [
        { color: '#34d399', label: 'Completed' },
        { color: '#38bdf8', label: 'Running' },
        { color: '#f87171', label: 'Blocked' },
        { color: '#fbbf24', label: 'File' },
        { color: '#a78bfa', label: 'Memory' },
        { color: '#60a5fa', label: 'Control' },
        { color: 'var(--accent)', label: 'General' },
    ];

    return (
        <div
            ref={overlayRef}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
        >
            <div className="relative flex h-[90vh] w-[95vw] max-w-6xl flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] shadow-2xl overflow-hidden">
                <div className="flex items-center gap-3 border-b border-[var(--border)] px-5 py-3">
                    <GitBranch size={16} className="text-[var(--accent)]" />
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">Transit Map</h2>
                    <p className="text-xs text-[var(--text-tertiary)]">Click any node to inspect it</p>
                    <button
                        type="button"
                        onClick={onClose}
                        className="ml-auto rounded border border-[var(--border)] bg-[var(--bg-primary)] p-1.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                        <X size={14} />
                    </button>
                </div>

                <div className="flex flex-1 overflow-hidden">
                    <div className="flex-1 overflow-auto p-4">
                        <TransitGraph
                            graph={graph}
                            runs={runs}
                            onNodeClick={setSelectedNode}
                            selectedNodeId={selectedNode?.id}
                            compact
                        />
                        <div className="mt-3 flex flex-wrap gap-3">
                            {LEGEND.map(item => (
                                <div key={item.label} className="flex items-center gap-1.5">
                                    <span className="h-2.5 w-2.5 rounded-full flex-shrink-0" style={{ background: item.color }} />
                                    <span className="text-[11px] text-[var(--text-tertiary)]">{item.label}</span>
                                </div>
                            ))}
                        </div>
                        <MissionPulsePanel runs={runs} selectedNode={selectedNode} selectedRun={selectedRun} />
                    </div>

                    <div className="w-72 flex-shrink-0 border-l border-[var(--border)] overflow-y-auto">
                        {selectedNode ? (
                            <div className="p-4 space-y-4">
                                <NodeDetail node={selectedNode} run={selectedRun} />
                                {selectedRun && (
                                    <div className="space-y-2">
                                        <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">Edges from this run</p>
                                        {(graph.edges || [])
                                            .filter(e => e.from === selectedNode.id || e.to === selectedNode.id)
                                            .map((e, i) => (
                                                <div key={i} className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)]">
                                                    <span className="font-mono text-[10px] text-[var(--text-tertiary)]">{e.from === selectedNode.id ? '→' : '←'}</span>
                                                    <span>{e.from === selectedNode.id ? e.to : e.from}</span>
                                                    <span className="ml-auto rounded border border-[var(--border)] px-1 py-0.5 text-[10px]">{e.label}</span>
                                                </div>
                                            ))}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                                <GitBranch size={28} className="text-[var(--text-tertiary)] opacity-40" />
                                <p className="text-xs text-[var(--text-tertiary)]">Select a node to see its details</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function MissionPulsePanel({ runs = [], selectedNode, selectedRun }) {
    const recentRuns = runs.slice(0, 8);
    const activeRuns = runs.filter(run => ['running', 'waiting'].includes(run.status)).length;
    const validationCount = runs.filter(needsValidation).length;
    const fileTouchCount = new Set(runs.flatMap(run => run.files || [])).size;
    const completedCount = runs.filter(run => run.status === 'completed').length;
    const laneSummary = ['terminal', 'cowork', 'code', 'build', 'gateway', 'general']
        .map(type => ({
            type,
            label: type === 'gateway' ? 'OpenClaw' : type[0].toUpperCase() + type.slice(1),
            runs: runs.filter(run => getRunSourceType(run) === type)
        }))
        .filter(lane => lane.runs.length > 0);
    const selectedLabel = selectedRun?.title || selectedNode?.label || 'No node selected';
    const selectedStatus = selectedRun?.status || selectedNode?.type || 'overview';

    return (
        <div className="mission-pulse-panel delight-field layout-transition mt-4 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)]">
            <div className="mission-pulse-grid" aria-hidden="true" />
            <div className="relative z-10 grid gap-4 p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(260px,0.8fr)]">
                <div className="min-w-0">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                            <div className="flex items-center gap-2">
                                <Sparkles size={14} className="text-[var(--accent)]" />
                                <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--text-primary)]">Mission Pulse</h3>
                            </div>
                            <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">Live orchestration flow across active run lanes</p>
                        </div>
                        <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-400">
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse-subtle" />
                            {activeRuns} active
                        </div>
                    </div>

                    <div className="space-y-3">
                        {(laneSummary.length > 0 ? laneSummary : [{ type: 'general', label: 'General', runs: recentRuns }]).map((lane, laneIndex) => {
                            const latest = lane.runs[0];
                            return (
                                <div key={lane.type} className="grid grid-cols-[76px_minmax(0,1fr)_72px] items-center gap-3">
                                    <span className="truncate text-[11px] font-medium text-[var(--text-secondary)]">{lane.label}</span>
                                    <div className="mission-pulse-track">
                                        <span
                                            className="mission-pulse-packet"
                                            style={{
                                                animationDelay: `${laneIndex * -1.1}s`,
                                                background: getNodeColor({ type: lane.type, status: latest?.status })
                                            }}
                                        />
                                        {lane.runs.slice(0, 5).map((run, index) => (
                                            <span
                                                key={run.id}
                                                className="mission-pulse-stop"
                                                style={{
                                                    left: `${Math.min(92, 8 + index * 20)}%`,
                                                    background: getNodeColor({ type: lane.type, status: run.status })
                                                }}
                                                title={run.title}
                                            />
                                        ))}
                                    </div>
                                    <span className="text-right text-[11px] text-[var(--text-tertiary)]">{lane.runs.length} runs</span>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <div className="grid min-w-0 grid-cols-2 gap-2">
                    <PulseMetric icon={Clock3} label="Active" value={activeRuns} />
                    <PulseMetric icon={ShieldCheck} label="Validate" value={validationCount} />
                    <PulseMetric icon={FileCode} label="Files" value={fileTouchCount} />
                    <PulseMetric icon={CheckCircle2} label="Done" value={completedCount} />
                    <div className="col-span-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/70 p-3">
                        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                            <History size={12} />
                            Selected signal
                        </div>
                        <p className="mt-2 truncate text-sm font-medium text-[var(--text-primary)]">{selectedLabel}</p>
                        <p className="mt-1 text-[11px] text-[var(--text-tertiary)]">{selectedStatus}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}

function PulseMetric({ icon: Icon, label, value }) {
    return (
        <div className="micro-interaction rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]/70 p-3">
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">
                <Icon size={12} />
                {label}
            </div>
            <div className="mt-1 text-lg font-semibold text-[var(--text-primary)]">{value}</div>
        </div>
    );
}

function getNodeColor(node) {
    if (node.status === 'blocked') return '#f87171';
    if (node.status === 'completed') return '#34d399';
    if (node.status === 'running') return '#38bdf8';
    if (node.type === 'memory') return '#a78bfa';
    if (node.type === 'file') return '#fbbf24';
    if (node.type === 'control') return '#60a5fa';
    return 'var(--accent)';
}

function getLineColor(label) {
    if (label === 'failed' || label === 'blocked') return '#f87171';
    if (label === 'passed' || label === 'candidate') return '#34d399';
    if (label === 'touches') return '#fbbf24';
    return 'var(--accent)';
}

function truncateLabel(label = '') {
    const value = String(label);
    return value.length > 16 ? `${value.slice(0, 14)}..` : value;
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
