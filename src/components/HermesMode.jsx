import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Activity, BarChart3, CheckCircle2, Clock, ExternalLink, Globe,
    MessageSquare, RefreshCw, Send, Square, Terminal, TerminalSquare, XCircle, Zap
} from 'lucide-react';
import TerminalTabs from './TerminalTabs';
import ChatTab from './ChatTab';
import NousBadge from './NousBadge';

// Hermes window surface. A deliberately lighter sibling of the OpenClaw
// window: one-shot runs through `hermes -z` (Console), the session store
// (Sessions), usage analytics (Insights), and the embedded `hermes dashboard`
// web UI. All CLI access goes through the hermes:* IPC bridge in main.cjs.

const HERMES_AMBER = '#eab308';

const TABS = [
    { id: 'chat', label: 'Chat', icon: MessageSquare },
    { id: 'console', label: 'Console', icon: Terminal },
    { id: 'terminal', label: 'Terminal', icon: TerminalSquare },
    { id: 'sessions', label: 'Sessions', icon: MessageSquare },
    { id: 'insights', label: 'Insights', icon: BarChart3 },
    { id: 'webui', label: 'Web UI', icon: Globe },
];

function formatClock(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// `tools.terminal_tool` → `terminal`; `agent.conversation_loop` → `agent`.
function describeLogComponent(component = '') {
    if (component.startsWith('tools.')) {
        return { kind: 'tool', label: component.slice(6).replace(/_tool$/, '') };
    }
    return { kind: 'agent', label: component.split('.')[0] || 'agent' };
}

function StatusChip({ icon: Icon, label, tone = 'neutral' }) {
    const toneClass = tone === 'good'
        ? 'text-emerald-500 border-emerald-500/30 bg-emerald-500/10'
        : tone === 'bad'
            ? 'text-red-400 border-red-500/30 bg-red-500/10'
            : 'text-[var(--text-secondary)] border-[var(--border)] bg-[var(--bg-secondary)]';
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${toneClass}`}>
            <Icon size={11} />
            {label}
        </span>
    );
}

export default function HermesMode() {
    const isDesktop = Boolean(window.electron?.getHermesStatus);

    const [activeTab, setActiveTab] = useState('chat');
    const [status, setStatus] = useState({ state: 'loading' });
    // The multitab terminal mounts on first visit and then stays mounted
    // (hidden) so its shell sessions survive switching to other tabs.
    const [terminalOpened, setTerminalOpened] = useState(false);
    useEffect(() => { if (activeTab === 'terminal') setTerminalOpened(true); }, [activeTab]);

    // Chat tab stays mounted so session survives switching.
    const [chatMounted, setChatMounted] = useState(false);
    useEffect(() => { if (activeTab === 'chat') setChatMounted(true); }, [activeTab]);

    // Console state
    const [prompt, setPrompt] = useState('');
    const [runs, setRuns] = useState([]); // newest first: { id, prompt, startedAt, status, output, error, finishedAt }
    const [activity, setActivity] = useState([]); // live parsed agent.log tail
    const [showActivity, setShowActivity] = useState(true);
    const runningRun = runs.find(r => r.status === 'running') || null;

    // Sessions / Insights / Web UI state
    const [sessions, setSessions] = useState({ state: 'idle' });
    const [insightDays, setInsightDays] = useState(30);
    const [insights, setInsights] = useState({ state: 'idle', byDays: {} });
    const [dashboard, setDashboard] = useState({ state: 'idle' });

    const runsEndRef = useRef(null);
    const activityEndRef = useRef(null);

    const refreshStatus = useCallback(async () => {
        if (!isDesktop) {
            setStatus({ state: 'unsupported' });
            return;
        }
        setStatus(s => (s.state === 'ready' ? { ...s, refreshing: true } : { state: 'loading' }));
        const result = await window.electron.getHermesStatus();
        if (result?.ok) setStatus({ state: 'ready', ...result });
        else setStatus({ state: 'error', error: result?.error || 'Hermes CLI is unavailable.' });
    }, [isDesktop]);

    useEffect(() => { refreshStatus(); }, [refreshStatus]);

    // Live agent.log tail: runs while the window is mounted so tool calls and
    // turns are visible as they happen, even for runs started elsewhere
    // (Telegram, cron, the Agents panel).
    useEffect(() => {
        if (!isDesktop) return undefined;
        window.electron.startHermesLogs();
        const unsubscribe = window.electron.onHermesLogEvent(evt => {
            if (evt?.type !== 'log') return;
            if (evt.component?.startsWith('gateway.')) return; // heartbeat noise
            setActivity(list => [...list.slice(-199), { ...evt, key: `${evt.time}-${list.length}-${Math.random().toString(36).slice(2, 6)}` }]);
        });
        return () => {
            unsubscribe();
            window.electron.stopHermesLogs();
        };
    }, [isDesktop]);

    // Run completion events from the one-shot bridge.
    useEffect(() => {
        if (!isDesktop) return undefined;
        return window.electron.onHermesRunEvent(evt => {
            setRuns(list => list.map(run => {
                if (run.id !== evt.id || run.status !== 'running') return run;
                if (evt.type === 'done') return { ...run, status: 'done', output: evt.output, finishedAt: evt.finishedAt };
                if (evt.type === 'cancelled') return { ...run, status: 'cancelled', finishedAt: evt.finishedAt };
                return { ...run, status: 'failed', error: evt.error || 'Run failed.', finishedAt: evt.finishedAt };
            }));
        });
    }, [isDesktop]);

    useEffect(() => { runsEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [runs]);
    useEffect(() => { activityEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [activity]);

    const submitRun = async () => {
        const text = prompt.trim();
        if (!text || runningRun || !isDesktop) return;
        const result = await window.electron.runHermesTask({ prompt: text });
        if (!result?.ok) {
            setRuns(list => [...list, { id: `local-${Date.now()}`, prompt: text, startedAt: new Date().toISOString(), status: 'failed', error: result?.error || 'Could not start Hermes.' }]);
            return;
        }
        setPrompt('');
        setRuns(list => [...list, { id: result.id, prompt: text, startedAt: result.startedAt, status: 'running' }]);
    };

    const cancelRun = async () => {
        if (!runningRun) return;
        await window.electron.cancelHermesRun();
    };

    const loadSessions = useCallback(async () => {
        setSessions(s => ({ ...s, state: 'loading' }));
        const result = await window.electron.listHermesSessions({ limit: 30 });
        if (result?.ok) setSessions({ state: 'ready', sessions: result.sessions, stats: result.stats });
        else setSessions({ state: 'error', error: result?.error || 'Could not load sessions.' });
    }, []);

    const loadInsights = useCallback(async (days) => {
        setInsights(s => ({ ...s, state: 'loading', days }));
        const result = await window.electron.getHermesInsights({ days });
        setInsights(s => result?.ok
            ? { state: 'ready', days, byDays: { ...s.byDays, [days]: result.text } }
            : { ...s, state: 'error', days, error: result?.error || 'Could not load insights.' });
    }, []);

    const checkDashboard = useCallback(async () => {
        setDashboard(d => (d.state === 'running' ? d : { state: 'checking' }));
        const result = await window.electron.getHermesDashboardStatus();
        setDashboard(result?.running ? { state: 'running', url: result.url } : { state: 'stopped', url: result?.url });
    }, []);

    const startDashboard = async () => {
        setDashboard(d => ({ ...d, state: 'starting' }));
        const result = await window.electron.startHermesDashboard();
        setDashboard(result?.running
            ? { state: 'running', url: result.url }
            : { state: 'stopped', url: result?.url, error: result?.error || 'Could not start the dashboard.' });
    };

    // Lazy-load tab data on first visit.
    useEffect(() => {
        if (!isDesktop) return;
        if (activeTab === 'sessions' && sessions.state === 'idle') loadSessions();
        if (activeTab === 'insights' && !insights.byDays[insightDays] && insights.state !== 'loading') loadInsights(insightDays);
        if (activeTab === 'webui' && dashboard.state === 'idle') checkDashboard();
    }, [activeTab, isDesktop, sessions.state, insights.byDays, insights.state, insightDays, dashboard.state, loadSessions, loadInsights, checkDashboard]);

    const vitals = useMemo(() => {
        if (status.state !== 'ready') return [];
        return [
            ...(status.model ? [{ icon: Zap, label: status.model }] : []),
            ...(status.keysTotal ? [{ icon: Activity, label: `${status.keysConfigured}/${status.keysTotal} providers` }] : []),
            ...(status.scheduledJobs ? [{ icon: Clock, label: `Cron: ${status.scheduledJobs}` }] : []),
            ...(status.activeSessions != null ? [{ icon: MessageSquare, label: `${status.activeSessions} active session${status.activeSessions === 1 ? '' : 's'}` }] : []),
        ];
    }, [status]);

    if (!isDesktop) {
        return (
            <div className="flex h-full items-center justify-center bg-[var(--bg-primary)] p-8">
                <div className="max-w-md text-center">
                    <div className="mb-4 flex justify-center"><NousBadge size="h-12 w-12" /></div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Hermes requires the desktop app</h2>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        The Hermes surface drives the local <code className="font-mono">hermes</code> CLI, which is only reachable from Perci&apos;s Electron build.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full flex-col bg-[var(--bg-primary)]">
            {/* Header */}
            <div className="hermes-header flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                    <div className={`relative rounded-full transition-shadow duration-500 ${runningRun ? 'shadow-[0_0_18px_rgba(234,179,8,0.45)]' : ''}`}>
                        <NousBadge />
                        {runningRun && (
                            <span
                                className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full animate-pulse-subtle"
                                style={{ backgroundColor: HERMES_AMBER, boxShadow: `0 0 8px ${HERMES_AMBER}` }}
                            />
                        )}
                    </div>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
                            {status.state === 'ready' ? status.version : 'Hermes Agent'}
                        </div>
                        <div className="truncate text-[11px] text-[var(--text-tertiary)]">
                            {runningRun
                                ? 'Working on a task…'
                                : status.state === 'ready'
                                    ? [status.model, status.provider].filter(Boolean).join(' · ') || 'Local CLI'
                                    : status.state === 'loading'
                                        ? 'Checking the local CLI…'
                                        : status.error || 'Unavailable'}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {status.state === 'ready' && (
                        <span className={`hidden sm:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                            status.gatewayRunning
                                ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500'
                                : 'border-red-500/30 bg-red-500/10 text-red-400'
                        }`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${status.gatewayRunning ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]' : 'bg-red-400'}`} />
                            Gateway
                        </span>
                    )}
                    <button
                        onClick={refreshStatus}
                        className="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        title="Refresh Hermes status"
                    >
                        <RefreshCw size={15} className={status.state === 'loading' || status.refreshing ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>
            {/* Tab strip */}
            <div className="flex shrink-0 items-center border-b border-[var(--border)] bg-[var(--bg-secondary)] px-2">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`hermes-tab flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors ${
                            activeTab === tab.id
                                ? 'active text-amber-600 dark:text-amber-300'
                                : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                        }`}
                    >
                        <tab.icon size={12} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Chat — stays mounted (hidden) so session survives tab switches */}
            {chatMounted && (
                <div className={activeTab === 'chat' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
                    <ChatTab isDesktop={isDesktop} />
                </div>
            )}
            {!chatMounted && activeTab === 'chat' && (
                <ChatTab isDesktop={isDesktop} />
            )}

            {/* Console */}
            {activeTab === 'console' && (
                <div className="flex min-h-0 flex-1">
                    <div className="flex min-w-0 flex-1 flex-col">
                        {vitals.length > 0 && (
                            <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-b border-[var(--border)] px-4 py-2">
                                {vitals.map(v => <StatusChip key={v.label} {...v} />)}
                            </div>
                        )}
                        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                            {runs.length === 0 ? (
                                <div className="hermes-empty flex h-full items-center justify-center">
                                    <div className="max-w-sm text-center">
                                        <div className="mb-3 flex justify-center">
                                            <span className="rounded-full shadow-[0_0_36px_rgba(234,179,8,0.22)]"><NousBadge size="h-10 w-10" /></span>
                                        </div>
                                        <p className="text-sm font-medium text-[var(--text-primary)]">Send Hermes a one-shot task</p>
                                        <p className="mt-1 text-xs leading-5 text-[var(--text-tertiary)]">
                                            Runs use your default model with tools, memory, and rules loaded.
                                            Tool calls stream into the activity rail while Hermes works.
                                        </p>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {runs.map(run => (
                                        <div
                                            key={run.id}
                                            className={`hermes-run-card overflow-hidden rounded-xl border bg-[var(--bg-secondary)] ${
                                                run.status === 'running' ? 'border-amber-500/40' : 'border-[var(--border)]'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] border-l-2 border-l-amber-500/70 bg-[var(--bg-hover)]/40 px-3.5 py-2.5">
                                                <p className="min-w-0 flex-1 whitespace-pre-wrap text-[13px] leading-5 text-[var(--text-primary)]">{run.prompt}</p>
                                                <span className="shrink-0 text-[10px] font-mono text-[var(--text-tertiary)]">{formatClock(run.startedAt)}</span>
                                            </div>
                                            <div className="px-3.5 py-3">
                                                {run.status === 'running' && (
                                                    <div className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                                                        <span className="perci-whirlpool perci-whirlpool-sm" aria-hidden />
                                                        Hermes is working — watch the activity rail
                                                    </div>
                                                )}
                                                {run.status === 'done' && (
                                                    <div className="flex items-start gap-2">
                                                        <CheckCircle2 size={14} className="mt-1 shrink-0 text-emerald-500" />
                                                        <p className="min-w-0 whitespace-pre-wrap text-sm leading-6 text-[var(--text-primary)]">{run.output}</p>
                                                    </div>
                                                )}
                                                {run.status === 'failed' && (
                                                    <div className="flex items-start gap-2">
                                                        <XCircle size={14} className="mt-0.5 shrink-0 text-red-400" />
                                                        <p className="min-w-0 whitespace-pre-wrap font-mono text-xs leading-5 text-red-400">{run.error}</p>
                                                    </div>
                                                )}
                                                {run.status === 'cancelled' && (
                                                    <p className="text-xs italic text-[var(--text-tertiary)]">Cancelled.</p>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={runsEndRef} />
                                </div>
                            )}
                        </div>
                        <div className="shrink-0 border-t border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                            <div className="flex items-end gap-2">
                                <textarea
                                    value={prompt}
                                    onChange={e => setPrompt(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                                            e.preventDefault();
                                            submitRun();
                                        }
                                    }}
                                    rows={2}
                                    placeholder="Give Hermes a task… (⌘↩ to run)"
                                    className="min-h-[44px] flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none transition-all focus:border-amber-500/60 focus:shadow-[0_0_0_3px_rgba(234,179,8,0.12)]"
                                />
                                {runningRun ? (
                                    <button
                                        onClick={cancelRun}
                                        className="flex h-[44px] items-center gap-1.5 rounded-lg border border-red-500/40 bg-red-500/10 px-3.5 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/20"
                                    >
                                        <Square size={14} />
                                        Cancel
                                    </button>
                                ) : (
                                    <button
                                        onClick={submitRun}
                                        disabled={!prompt.trim() || status.state === 'error'}
                                        className="flex h-[44px] items-center gap-1.5 rounded-lg bg-amber-500 px-3.5 text-sm font-semibold text-black shadow-[0_0_16px_rgba(234,179,8,0.25)] transition-all hover:bg-amber-400 hover:shadow-[0_0_22px_rgba(234,179,8,0.4)] disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
                                    >
                                        <Send size={14} />
                                        Run
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Live activity rail */}
                    {showActivity && (
                        <div className="flex w-72 shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-secondary)]">
                            <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-3 py-2">
                                <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                                    <Activity size={11} className={runningRun ? 'animate-pulse-subtle' : ''} style={runningRun ? { color: HERMES_AMBER } : undefined} />
                                    Live activity
                                </span>
                                <button
                                    onClick={() => setShowActivity(false)}
                                    className="text-[10px] font-medium uppercase tracking-wider text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                                >
                                    Hide
                                </button>
                            </div>
                            <div className="min-h-0 flex-1 overflow-y-auto px-2.5 py-2">
                                {activity.length === 0 ? (
                                    <p className="px-1 py-2 text-[11px] leading-5 text-[var(--text-tertiary)]">
                                        Tailing <code className="font-mono">agent.log</code> — tool calls and turns appear here as Hermes works.
                                    </p>
                                ) : (
                                    <div className="space-y-1">
                                        {activity.map(evt => {
                                            const meta = describeLogComponent(evt.component);
                                            return (
                                                <div key={evt.key} className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5">
                                                    <div className="flex items-center gap-1.5">
                                                        <span
                                                            className={`rounded px-1 py-px text-[9px] font-bold uppercase tracking-wider ${
                                                                meta.kind === 'tool' ? '' : 'text-[var(--text-tertiary)] bg-[var(--bg-hover)]'
                                                            }`}
                                                            style={meta.kind === 'tool' ? { color: HERMES_AMBER, backgroundColor: 'rgba(234, 179, 8, 0.12)' } : undefined}
                                                        >
                                                            {meta.label}
                                                        </span>
                                                        <span className="ml-auto text-[9px] font-mono text-[var(--text-tertiary)]">{evt.time?.slice(11)}</span>
                                                    </div>
                                                    <p className="mt-1 break-words font-mono text-[10px] leading-4 text-[var(--text-secondary)] line-clamp-3">{evt.message}</p>
                                                </div>
                                            );
                                        })}
                                        <div ref={activityEndRef} />
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                    {!showActivity && (
                        <button
                            onClick={() => setShowActivity(true)}
                            className="flex shrink-0 items-center border-l border-[var(--border)] bg-[var(--bg-secondary)] px-1.5 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
                            title="Show live activity"
                        >
                            <Activity size={13} className={runningRun ? 'animate-pulse-subtle' : ''} style={runningRun ? { color: HERMES_AMBER } : undefined} />
                        </button>
                    )}
                </div>
            )}

            {/* Terminal — a multitab local shell; stays mounted so sessions persist */}
            {terminalOpened && (
                <div className={activeTab === 'terminal' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
                    <TerminalTabs idPrefix="hermes-shell" />
                </div>
            )}

            {/* Sessions */}
            {activeTab === 'sessions' && (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex shrink-0 items-center justify-between border-b border-[var(--border)] px-4 py-2">
                        <span className="text-xs text-[var(--text-secondary)]">
                            {sessions.state === 'ready'
                                ? [
                                    sessions.stats?.totalSessions && `${sessions.stats.totalSessions} sessions`,
                                    sessions.stats?.totalMessages && `${sessions.stats.totalMessages} messages`,
                                    sessions.stats?.databaseSize && sessions.stats.databaseSize,
                                ].filter(Boolean).join(' · ')
                                : 'Session store'}
                        </span>
                        <button
                            onClick={loadSessions}
                            className="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            title="Refresh sessions"
                        >
                            <RefreshCw size={13} className={sessions.state === 'loading' ? 'animate-spin' : ''} />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto p-3">
                        {sessions.state === 'error' ? (
                            <p className="px-1 font-mono text-xs text-red-400">{sessions.error}</p>
                        ) : sessions.state !== 'ready' ? (
                            <p className="px-1 text-xs text-[var(--text-tertiary)]">Loading sessions…</p>
                        ) : sessions.sessions.length === 0 ? (
                            <p className="px-1 text-xs text-[var(--text-tertiary)]">No sessions yet.</p>
                        ) : (
                            <div className="space-y-1.5">
                                {sessions.sessions.map(s => (
                                    <div key={s.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 transition-colors hover:border-amber-500/35">
                                        <div className="flex items-center justify-between gap-3">
                                            <span className="min-w-0 truncate text-[13px] font-medium text-[var(--text-primary)]">
                                                {s.title && s.title !== '—' ? s.title : 'Untitled session'}
                                            </span>
                                            <span className="shrink-0 text-[10px] text-[var(--text-tertiary)]">{s.lastActive}</span>
                                        </div>
                                        <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">{s.preview}</p>
                                        <p className="mt-1 font-mono text-[10px] text-[var(--text-tertiary)]">{s.id}</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Insights */}
            {activeTab === 'insights' && (
                <div className="flex min-h-0 flex-1 flex-col">
                    <div className="flex shrink-0 items-center gap-1.5 border-b border-[var(--border)] px-4 py-2">
                        {[7, 30, 90].map(days => (
                            <button
                                key={days}
                                onClick={() => { setInsightDays(days); if (!insights.byDays[days]) loadInsights(days); }}
                                className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                                    insightDays === days
                                        ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(234,179,8,0.3)]'
                                        : 'border border-[var(--border)] text-[var(--text-secondary)] hover:border-amber-500/40 hover:text-[var(--text-primary)]'
                                }`}
                            >
                                {days} days
                            </button>
                        ))}
                        <button
                            onClick={() => loadInsights(insightDays)}
                            className="ml-auto rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            title="Refresh insights"
                        >
                            <RefreshCw size={13} className={insights.state === 'loading' ? 'animate-spin' : ''} />
                        </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto p-4">
                        {insights.state === 'error' && !insights.byDays[insightDays] ? (
                            <p className="font-mono text-xs text-red-400">{insights.error}</p>
                        ) : insights.byDays[insightDays] ? (
                            <pre className="overflow-auto whitespace-pre rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 font-mono text-[11px] leading-5 text-[var(--text-secondary)]">{insights.byDays[insightDays]}</pre>
                        ) : (
                            <p className="text-xs text-[var(--text-tertiary)]">Analyzing the last {insightDays} days…</p>
                        )}
                    </div>
                </div>
            )}

            {/* Web UI */}
            {activeTab === 'webui' && (
                dashboard.state === 'running' ? (
                    <webview
                        src={dashboard.url}
                        title="Hermes Dashboard"
                        className="min-h-0 w-full flex-1 border-0 bg-white"
                        partition="persist:perci-hermes"
                    />
                ) : (
                    <div className="flex min-h-0 flex-1 items-center justify-center p-8">
                        <div className="max-w-md text-center">
                            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]">
                                <Globe size={22} className="text-[var(--text-tertiary)]" />
                            </div>
                            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                                {dashboard.state === 'starting' ? 'Starting the Hermes dashboard…' : 'Hermes dashboard is not running'}
                            </h2>
                            <p className="mt-2 text-sm text-[var(--text-secondary)]">
                                {dashboard.state === 'starting'
                                    ? 'First launch can take a minute while the web UI builds.'
                                    : 'The dashboard manages config, API keys, and sessions in a local web UI.'}
                            </p>
                            {dashboard.error && (
                                <p className="mt-3 font-mono text-xs text-red-400">{dashboard.error}</p>
                            )}
                            {dashboard.state !== 'starting' && dashboard.state !== 'checking' && (
                                <div className="mt-5 flex items-center justify-center gap-2">
                                    <button
                                        onClick={startDashboard}
                                        className="inline-flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-sm font-semibold text-black shadow-[0_0_16px_rgba(234,179,8,0.25)] transition-all hover:bg-amber-400 hover:shadow-[0_0_22px_rgba(234,179,8,0.4)]"
                                    >
                                        <Globe size={15} />
                                        Start dashboard
                                    </button>
                                    <button
                                        onClick={checkDashboard}
                                        className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                                    >
                                        <RefreshCw size={15} />
                                        Check again
                                    </button>
                                </div>
                            )}
                            {dashboard.state === 'starting' && (
                                <div className="mt-5 flex justify-center">
                                    <span className="perci-whirlpool" aria-hidden />
                                </div>
                            )}
                            {dashboard.url && (
                                <button
                                    onClick={() => window.electron?.openExternal?.(dashboard.url)}
                                    className="mt-4 inline-flex items-center gap-1 text-xs text-amber-600 hover:underline dark:text-amber-400"
                                >
                                    Open in browser <ExternalLink size={11} />
                                </button>
                            )}
                        </div>
                    </div>
                )
            )}
        </div>
    );
}
