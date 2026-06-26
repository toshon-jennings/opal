import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Database,
    HardDrive,
    ListChecks,
    Loader2,
    Play,
    RefreshCw,
    RotateCcw,
    ShieldAlert,
    TerminalSquare,
    XCircle,
} from 'lucide-react';

const GREEN = '\x1b[0;32m';
const BLUE = '\x1b[0;34m';
const RED = '\x1b[0;31m';
const SCRIPT_PATH = '~/cleanmac/cleanmac';

const CLEANUP_TARGETS = [
    { label: 'Package caches', value: 'uv, pip, npm, bun, Cargo', icon: HardDrive },
    { label: 'Build debris', value: 'Homebrew cleanup, Xcode DerivedData', icon: Clock3 },
    { label: 'Docker engine', value: 'Delegated to the local script', icon: Database },
];

function stripAnsi(str) {
    // eslint-disable-next-line no-control-regex
    return str.replace(/\x1b\[[0-9;]*m/g, '');
}

function colorizeLine(line, type = 'stdout') {
    const stripped = stripAnsi(line);
    let color = type === 'stderr' ? '#f59e0b' : 'var(--text-primary)';
    if (line.includes(GREEN)) color = '#22c55e';
    else if (line.includes(BLUE)) color = '#60a5fa';
    else if (line.includes(RED)) color = '#ef4444';
    return { text: stripped, color };
}

function formatCheckedAt(value) {
    if (!value) return '';
    try {
        return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
        return '';
    }
}

function pluralize(count, singular, plural = `${singular}s`) {
    return count === 1 ? singular : plural;
}

function StatusBadge({ state }) {
    const stateClass = {
        ready: 'border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
        running: 'border-blue-500/30 bg-blue-500/10 text-blue-500',
        complete: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
        failed: 'border-red-500/30 bg-red-500/10 text-red-500',
        unavailable: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
    }[state];

    const label = {
        ready: 'Ready',
        running: 'Running',
        complete: 'Complete',
        failed: 'Failed',
        unavailable: 'Desktop required',
    }[state];

    return (
        <span className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold ${stateClass}`}>
            {label}
        </span>
    );
}

export default function CleanmacMode() {
    const [lines, setLines] = useState([]);
    const [running, setRunning] = useState(false);
    const [exitCode, setExitCode] = useState(null);
    const [runtimeUnavailable, setRuntimeUnavailable] = useState(false);
    const [dockerInspection, setDockerInspection] = useState(null);
    const [dockerInspecting, setDockerInspecting] = useState(false);
    const [confirmedDockerReview, setConfirmedDockerReview] = useState(false);
    const outputRef = useRef(null);
    const cleanupRef = useRef(null);

    const canUseRunner = Boolean(window.electron?.cleanmacRun && window.electron?.onCleanmacOutput);
    const canInspectDocker = Boolean(window.electron?.cleanmacInspectDocker);
    const dockerCandidateCount = dockerInspection?.candidateCount || 0;
    const dockerHasCandidates = Boolean(dockerInspection?.available && dockerCandidateCount > 0);
    const dockerInspectionTruncated = Boolean(dockerInspection?.truncated);
    const dockerReviewComplete = Boolean(
        dockerInspection?.ok &&
        !dockerInspecting &&
        !dockerInspectionTruncated &&
        (!dockerHasCandidates || confirmedDockerReview)
    );
    const statusState = useMemo(() => {
        if (running) return 'running';
        if (runtimeUnavailable) return 'unavailable';
        if (exitCode === 0) return 'complete';
        if (exitCode !== null) return 'failed';
        return 'ready';
    }, [exitCode, running, runtimeUnavailable]);

    const statusText = useMemo(() => {
        if (running) return 'Cleanup is running';
        if (runtimeUnavailable) return 'Perci desktop bridge is unavailable';
        if (exitCode === 0) return 'Last run finished cleanly';
        if (exitCode !== null) return `Last run exited with code ${exitCode}`;
        if (dockerInspecting) return 'Inspecting Docker volumes';
        if (!dockerInspection) return 'Inspect Docker candidates';
        if (!dockerInspection.ok) return 'Docker inspection failed';
        if (dockerInspectionTruncated) return 'Candidate list truncated';
        if (dockerHasCandidates && !confirmedDockerReview) {
            return `${dockerCandidateCount} ${pluralize(dockerCandidateCount, 'volume')} to review`;
        }
        return 'Ready to run';
    }, [
        confirmedDockerReview,
        dockerCandidateCount,
        dockerHasCandidates,
        dockerInspecting,
        dockerInspection,
        dockerInspectionTruncated,
        exitCode,
        running,
        runtimeUnavailable,
    ]);

    const removeOutputListener = useCallback(() => {
        if (cleanupRef.current) {
            cleanupRef.current();
            cleanupRef.current = null;
        }
    }, []);

    useEffect(() => {
        return removeOutputListener;
    }, [removeOutputListener]);

    useEffect(() => {
        if (outputRef.current) {
            outputRef.current.scrollTop = outputRef.current.scrollHeight;
        }
    }, [lines]);

    const resetOutput = useCallback(() => {
        if (running) return;
        setLines([]);
        setExitCode(null);
        setRuntimeUnavailable(false);
    }, [running]);

    const inspectDockerCandidates = useCallback(async () => {
        if (dockerInspecting || running) return;
        setDockerInspecting(true);
        setConfirmedDockerReview(false);
        setRuntimeUnavailable(false);
        try {
            if (!canInspectDocker) {
                setDockerInspection({
                    ok: false,
                    available: false,
                    checkedAt: new Date().toISOString(),
                    candidateCount: 0,
                    volumes: [],
                    error: 'Perci needs the desktop Cleanmac inspection bridge. Restart Perci after this update.'
                });
                return;
            }

            const result = await window.electron.cleanmacInspectDocker();
            setDockerInspection(result || {
                ok: false,
                checkedAt: new Date().toISOString(),
                candidateCount: 0,
                volumes: [],
                error: 'Docker inspection returned no data.'
            });
        } catch (err) {
            setDockerInspection({
                ok: false,
                checkedAt: new Date().toISOString(),
                candidateCount: 0,
                volumes: [],
                error: err.message || 'Docker inspection failed.'
            });
        } finally {
            setDockerInspecting(false);
        }
    }, [canInspectDocker, dockerInspecting, running]);

    const runDisabled = running || !canUseRunner || !dockerReviewComplete;

    const runCleanmac = useCallback(async () => {
        if (runDisabled) return;
        removeOutputListener();
        setLines([]);
        setExitCode(null);
        setRunning(true);
        setRuntimeUnavailable(false);

        if (!canUseRunner) {
            setRuntimeUnavailable(true);
            setRunning(false);
            return;
        }

        cleanupRef.current = window.electron.onCleanmacOutput((type, data) => {
            if (type === 'done') {
                setExitCode(data);
                setRunning(false);
                removeOutputListener();
            } else if (type === 'error') {
                setLines(prev => [...prev, { text: `Error: ${data}`, color: '#ef4444' }]);
                setRunning(false);
                removeOutputListener();
            } else {
                const chunks = data.split('\n').filter(l => l.length > 0);
                setLines(prev => [...prev, ...chunks.map(line => colorizeLine(line, type))]);
            }
        });

        try {
            await window.electron.cleanmacRun();
        } catch (err) {
            setLines(prev => [...prev, { text: `Failed to start: ${err.message}`, color: '#ef4444' }]);
            setRunning(false);
            removeOutputListener();
        }
    }, [canUseRunner, removeOutputListener, runDisabled]);

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-300">
                        <TerminalSquare size={19} />
                    </span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h1 className="m-0 truncate text-base font-semibold leading-5">Cleanmac</h1>
                            <StatusBadge state={statusState} />
                        </div>
                        <p className="m-0 truncate font-mono text-[11px] text-[var(--text-tertiary)]">{SCRIPT_PATH}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={runCleanmac}
                    disabled={runDisabled}
                    className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)]"
                >
                    {running ? (
                        <>
                            <Loader2 size={15} className="animate-spin" />
                            Cleaning...
                        </>
                    ) : exitCode !== null ? (
                        <>
                            <RotateCcw size={15} />
                            Run again
                        </>
                    ) : (
                        <>
                            <Play size={15} />
                            Run
                        </>
                    )}
                </button>
            </header>

            <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[340px_minmax(0,1fr)] lg:overflow-hidden">
                <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
                    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                        <p className="m-0 text-xs font-semibold text-[var(--text-tertiary)]">Runtime</p>
                        <div className="mt-3 grid gap-3">
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-[var(--text-secondary)]">Source</span>
                                <span className="font-mono text-xs text-[var(--text-primary)]">{SCRIPT_PATH}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-[var(--text-secondary)]">Bridge</span>
                                <span className={canUseRunner ? 'text-sm font-medium text-emerald-500' : 'text-sm font-medium text-amber-500'}>
                                    {canUseRunner ? 'Connected' : 'Unavailable'}
                                </span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                                <span className="text-sm text-[var(--text-secondary)]">State</span>
                                <span className="text-sm font-medium text-[var(--text-primary)]">{statusText}</span>
                            </div>
                        </div>
                    </section>

                    <section className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-4">
                        <div className="flex gap-3">
                            <ShieldAlert size={20} className="mt-0.5 shrink-0 text-amber-500" />
                            <div className="min-w-0">
                                <h2 className="m-0 text-sm font-semibold text-[var(--text-primary)]">Docker/OrbStack volume review</h2>
                                <p className="mt-1 text-sm leading-5 text-[var(--text-secondary)]">
                                    The current local script may prune unused Docker volumes. Inspect the current engine first; these volumes can contain databases and app state.
                                </p>
                            </div>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center gap-2">
                            <button
                                type="button"
                                onClick={inspectDockerCandidates}
                                disabled={dockerInspecting || running}
                                className="inline-flex h-8 items-center gap-2 rounded-md border border-amber-500/30 bg-[var(--bg-primary)] px-3 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                                {dockerInspecting ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                                {dockerInspection ? 'Refresh candidates' : 'Inspect candidates'}
                            </button>
                            {dockerInspection?.checkedAt && (
                                <span className="text-xs text-[var(--text-tertiary)]">
                                    Checked {formatCheckedAt(dockerInspection.checkedAt)}
                                </span>
                            )}
                        </div>

                        {!dockerInspection && !dockerInspecting && (
                            <p className="mt-3 rounded-lg border border-amber-500/20 bg-[var(--bg-primary)] p-3 text-xs leading-5 text-[var(--text-secondary)]">
                                Run stays locked until Perci lists the unused volumes Docker reports right now.
                            </p>
                        )}

                        {dockerInspection && (
                            <div className="mt-3 rounded-lg border border-amber-500/20 bg-[var(--bg-primary)] p-3">
                                {!dockerInspection.ok ? (
                                    <div className="text-xs leading-5 text-red-500">
                                        Inspection failed: {dockerInspection.error || 'Unknown Docker inspection error.'}
                                    </div>
                                ) : dockerInspection.available === false ? (
                                    <div className="text-xs leading-5 text-[var(--text-secondary)]">
                                        Docker is not reachable right now, so the Docker block in the script should be skipped. If Docker or OrbStack starts later, inspect again before running.
                                        {dockerInspection.error && (
                                            <div className="mt-2 font-mono text-[11px] text-[var(--text-tertiary)]">{dockerInspection.error}</div>
                                        )}
                                    </div>
                                ) : dockerCandidateCount === 0 ? (
                                    <div className="flex items-start gap-2 text-xs leading-5 text-[var(--text-secondary)]">
                                        <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-emerald-500" />
                                        <span>No unused Docker volumes are currently reported for context <strong>{dockerInspection.context || 'default'}</strong>.</span>
                                    </div>
                                ) : (
                                    <div className="grid gap-3">
                                        <div className="flex items-start gap-2 text-xs leading-5 text-[var(--text-secondary)]">
                                            <ListChecks size={14} className="mt-0.5 shrink-0 text-amber-500" />
                                            <span>
                                                Docker reports {dockerCandidateCount} unused {pluralize(dockerCandidateCount, 'volume')} in context <strong>{dockerInspection.context || 'default'}</strong>. These are the volumes most likely to be removed by <code className="font-mono">docker system prune --volumes</code>.
                                            </span>
                                        </div>
                                        {dockerInspection.truncated && (
                                            <div className="rounded-md border border-red-500/25 bg-red-500/10 p-2 text-xs leading-5 text-red-500">
                                                Showing only the first {dockerInspection.volumes.length}; Run stays locked until the list can be reviewed without truncation.
                                            </div>
                                        )}
                                        <div className="max-h-48 overflow-y-auto rounded-md border border-[var(--border)]">
                                            {dockerInspection.volumes.map((volume) => (
                                                <div key={volume.name} className="border-b border-[var(--border)] p-2 last:border-b-0">
                                                    <div className="break-all font-mono text-[11px] text-[var(--text-primary)]">{volume.name}</div>
                                                    <div className="mt-1 flex flex-wrap gap-1.5 text-[10px] text-[var(--text-tertiary)]">
                                                        {volume.driver && <span>driver: {volume.driver}</span>}
                                                        {volume.composeProject && <span>compose: {volume.composeProject}</span>}
                                                        {volume.composeVolume && <span>volume: {volume.composeVolume}</span>}
                                                        {volume.createdAt && <span>created: {volume.createdAt}</span>}
                                                    </div>
                                                    {volume.labels?.length > 0 && (
                                                        <div className="mt-1 break-all font-mono text-[10px] leading-4 text-[var(--text-tertiary)]">
                                                            {volume.labels.join('  ')}
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                        <div className="rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] p-2 text-xs leading-5 text-[var(--text-secondary)]">
                                            To know what a volume is, match its name or Compose labels to a project, run <code className="font-mono">docker volume inspect &lt;name&gt;</code>, and back up or migrate anything you need. If you are unsure, do not run Cleanmac until <code className="font-mono">--volumes</code> is removed from {SCRIPT_PATH}.
                                        </div>
                                        {!dockerInspection.truncated && (
                                            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-2 text-xs leading-5 text-[var(--text-secondary)]">
                                                <input
                                                    type="checkbox"
                                                    checked={confirmedDockerReview}
                                                    onChange={(event) => setConfirmedDockerReview(event.target.checked)}
                                                    className="mt-1 h-4 w-4 accent-[var(--accent)]"
                                                />
                                                <span>I reviewed the listed unused volumes and have backed up or accepted losing anything I still need.</span>
                                            </label>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </section>

                    <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4">
                        <p className="m-0 text-xs font-semibold text-[var(--text-tertiary)]">Cleanup Areas</p>
                        <div className="mt-3 divide-y divide-[var(--border)]">
                            {CLEANUP_TARGETS.map(({ label, value, icon: Icon }) => (
                                <div key={label} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-secondary)]">
                                        <Icon size={15} />
                                    </span>
                                    <div className="min-w-0">
                                        <div className="text-sm font-medium text-[var(--text-primary)]">{label}</div>
                                        <div className="mt-0.5 text-xs leading-4 text-[var(--text-tertiary)]">{value}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                </aside>

                <section className="flex min-h-[360px] flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[#0d1117] lg:min-h-0">
                    <div className="flex h-11 shrink-0 items-center justify-between border-b border-white/10 px-3">
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
                            <TerminalSquare size={15} className="text-emerald-300" />
                            Run output
                        </div>
                        <div className="flex items-center gap-2">
                            {exitCode === 0 && <CheckCircle2 size={16} className="text-emerald-300" />}
                            {exitCode !== null && exitCode !== 0 && <XCircle size={16} className="text-red-300" />}
                            {running && <Loader2 size={16} className="animate-spin text-blue-300" />}
                            <button
                                type="button"
                                onClick={resetOutput}
                                disabled={running || (lines.length === 0 && exitCode === null)}
                                className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                                aria-label="Clear Cleanmac output"
                                title="Clear output"
                            >
                                <RotateCcw size={14} />
                            </button>
                        </div>
                    </div>

                    <div
                        ref={outputRef}
                        className="min-h-0 flex-1 overflow-y-auto p-4 font-mono text-xs leading-6"
                        role="log"
                        aria-live="polite"
                    >
                        {lines.length === 0 && !running && exitCode === null && !runtimeUnavailable && (
                            <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-3 text-center text-slate-500">
                                <AlertTriangle size={34} className="text-amber-300/70" />
                                <div>
                                    <p className="m-0 text-sm font-medium text-slate-300">Inspect Docker/OrbStack candidates before running.</p>
                                    <p className="mt-1 text-xs text-slate-500">Use Inspect candidates in the amber panel. If volumes appear, review the list before Run unlocks.</p>
                                </div>
                            </div>
                        )}

                        {lines.map((line, i) => (
                            <div key={`${i}-${line.text}`} style={{ color: line.color }}>
                                {line.text}
                            </div>
                        ))}

                        {running && (
                            <div className="mt-1 flex items-center gap-2 text-slate-500">
                                <Loader2 size={12} className="animate-spin" />
                                running...
                            </div>
                        )}

                        {exitCode !== null && !running && (
                            <div className="mt-4 border-t border-white/10 pt-3">
                                <span className={exitCode === 0 ? 'text-emerald-300' : 'text-red-300'}>
                                    {exitCode === 0 ? 'Cleanup complete' : `Exited with code ${exitCode}`}
                                </span>
                            </div>
                        )}

                        {runtimeUnavailable && (
                            <div className="mt-4 rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-amber-200">
                                This surface requires the Perci desktop app with the Cleanmac bridge loaded.
                            </div>
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
}
