import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertCircle,
    ArrowUpRight,
    BookOpen,
    CheckCircle2,
    ExternalLink,
    GitBranch,
    GitCommitHorizontal,
    Github,
    Layers,
    Loader2,
    RefreshCw,
    AlertTriangle
} from 'lucide-react';
import eidosLogo from '../assets/eidos-logo.png';
import { EidosGuideModal } from './EidosGuideModal';
import './EidosMode.css';

const DASHBOARD_URL = 'http://localhost:3000';
const CONTRIBUTIONS_GRAPH_URL = 'https://github.pumbas.net/api/contributions/toshon-jennings';
const INSIGHTS_REFRESH_MS = 30000;
const EMPTY_SUMMARY = {
    repoCount: 0,
    openRepoCount: 0,
    cleanRepoCount: 0,
    reposWithOpenCommits: 0,
    reposNeedingPull: 0,
    staleRepoCount: 0,
    branchCount: 0,
    totalOpenCommits: 0,
    totalChangedFiles: 0,
    totalUntrackedFiles: 0,
};

const SETUP_STEPS = [
    { id: 'orbstack', label: 'Checking OrbStack / Docker' },
    { id: 'docker', label: 'Starting Docker runtime' },
    { id: 'compose', label: 'Pulling & starting containers' },
    { id: 'health', label: 'Waiting for Eidos API' },
];

function compactNumber(value) {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
}

function relativeTime(value) {
    if (!value) return 'No commits yet';
    const timestamp = typeof value === 'number' ? value : new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return 'Unknown';
    const diffMs = Date.now() - timestamp;
    if (diffMs < 0) return 'now';
    const minutes = Math.floor(diffMs / 60000);
    if (minutes < 1) return 'now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    const months = Math.floor(days / 30);
    return `${months}mo ago`;
}

function ratioPercent(value, total) {
    if (!total || total <= 0) return 0;
    return Math.max(0, Math.min(100, (value / total) * 100));
}

function shortenPath(value) {
    if (typeof value !== 'string' || !value) return '';
    const home = typeof process !== 'undefined' ? process?.env?.HOME || '' : '';
    return home && value.startsWith(home)
        ? `~${value.slice(home.length)}`
        : value;
}

function KpiCard({ label, value, detail, tone = 'default' }) {
    return (
        <article className="eidos-kpi-card" data-tone={tone}>
            <span>{label}</span>
            <strong>{value}</strong>
            <small>{detail}</small>
        </article>
    );
}

function EidosModeInner({ onOpenGuide }) {
    const [status, setStatus] = useState('idle'); // idle | checking | starting | running | error
    const [currentStep, setCurrentStep] = useState(0);
    const [error, setError] = useState(null);
    const [dashboardReady, setDashboardReady] = useState(false);
    const [surface, setSurface] = useState('dashboard'); // overview | dashboard
    const [frameKey, setFrameKey] = useState(0);
    const [insights, setInsights] = useState(null);
    const [insightsLoading, setInsightsLoading] = useState(false);
    const [insightsError, setInsightsError] = useState('');
    const pollRef = useRef(null);
    const runningRef = useRef(false);

    const isElectron = !!window.electron;
    const hasEidosAPI = isElectron && window.electron?.eidosStatus;
    const hasInsightsAPI = isElectron && window.electron?.eidosInsights;

    const stopPolling = useCallback(() => {
        if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
        }
    }, []);

    const loadInsights = useCallback(async ({ silent = false } = {}) => {
        if (!hasInsightsAPI) {
            setInsightsError('Git visualizer is only available in the desktop app.');
            return;
        }
        if (!silent) {
            setInsightsLoading(true);
        }
        try {
            const next = await window.electron.eidosInsights();
            setInsights(next || null);
            setInsightsError(next?.ok === false && next?.error ? next.error : '');
        } catch (err) {
            setInsightsError(err?.message || 'Failed to load Git visualizer data');
        } finally {
            if (!silent) {
                setInsightsLoading(false);
            }
        }
    }, [hasInsightsAPI]);

    const pollProgress = useCallback(async () => {
        if (!hasEidosAPI || !runningRef.current) return;
        try {
            const progress = await window.electron.eidosProgress();
            if (progress.error) {
                setError(progress.error);
                setStatus('error');
                runningRef.current = false;
                stopPolling();
                return;
            }
            if (progress.done || progress.step >= 4) {
                setStatus('running');
                setDashboardReady(true);
                setSurface('dashboard');
                runningRef.current = false;
                stopPolling();
                return;
            }
            setCurrentStep(Math.min(progress.step, SETUP_STEPS.length - 1));
        } catch (err) {
            console.warn('[eidos] progress poll failed:', err.message);
        }
    }, [hasEidosAPI, stopPolling]);

    const startEidos = useCallback(async () => {
        if (!hasEidosAPI || runningRef.current) return;
        runningRef.current = true;

        setStatus('checking');
        setCurrentStep(0);
        setError(null);
        setDashboardReady(false);
        setSurface('dashboard');
        setInsights(null);
        setInsightsError('');
        stopPolling();

        try {
            const statusResult = await window.electron.eidosStatus();
            if (statusResult.error) {
                setError(statusResult.error);
                setStatus('error');
                runningRef.current = false;
                return;
            }

            if (statusResult.state === 'running') {
                setStatus('running');
                setDashboardReady(true);
                setSurface('dashboard');
                runningRef.current = false;
                return;
            }

            if (statusResult.state === 'no-docker') {
                setError(statusResult.error || 'Docker/OrbStack not found. Install OrbStack from https://orbstack.dev');
                setStatus('error');
                runningRef.current = false;
                return;
            }

            setStatus('starting');
            setCurrentStep(1);

            window.electron.eidosStart().then((result) => {
                if (result.error) {
                    setError(result.error);
                    setStatus('error');
                    runningRef.current = false;
                    stopPolling();
                }
            });

            pollRef.current = setInterval(pollProgress, 2000);
        } catch (err) {
            setError(err.message || 'Failed to start Eidos');
            setStatus('error');
            runningRef.current = false;
        }
    }, [hasEidosAPI, pollProgress, stopPolling]);

    useEffect(() => {
        if (hasEidosAPI) {
            startEidos();
        }
        return stopPolling;
    }, [hasEidosAPI, startEidos, stopPolling]);

    useEffect(() => {
        if (status !== 'running' || !dashboardReady || surface !== 'overview') return;
        void loadInsights();
        const refreshId = setInterval(() => {
            void loadInsights({ silent: true });
        }, INSIGHTS_REFRESH_MS);
        return () => clearInterval(refreshId);
    }, [dashboardReady, loadInsights, status, surface]);

    const handleRetry = useCallback(() => {
        setFrameKey((prev) => prev + 1);
        runningRef.current = false;
        stopPolling();
        startEidos();
    }, [startEidos, stopPolling]);

    const handleOpenDashboardInBrowser = useCallback(() => {
        void window.electron?.openExternal?.(DASHBOARD_URL);
    }, []);

    const summary = insights?.summary || EMPTY_SUMMARY;
    const services = insights?.services || {
        runtime: 'unknown',
        apiHealthy: false,
        dashboardHealthy: false,
    };
    const repos = useMemo(() => (
        Array.isArray(insights?.repos) ? insights.repos : []
    ), [insights]);
    const attentionRepos = useMemo(() => {
        if (Array.isArray(insights?.attentionRepos) && insights.attentionRepos.length > 0) {
            return insights.attentionRepos;
        }
        return repos.filter((repo) => repo.hasOpenWork).slice(0, 8);
    }, [insights, repos]);
    const cleanRepos = useMemo(() => repos.filter((repo) => !repo.hasOpenWork).slice(0, 4), [repos]);
    const snapshotText = insights?.generatedAt ? relativeTime(insights.generatedAt) : 'Not updated yet';

    if (!isElectron) {
        return (
            <div className="h-full w-full flex items-center justify-center p-8">
                <div className="max-w-lg text-center">
                    <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-center overflow-hidden">
                        <img src={eidosLogo} alt="Eidos" className="w-8 h-8" />
                    </div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                        Eidos requires the desktop app
                    </h2>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        Eidos runs as a local Docker stack managed by Perci&apos;s desktop runtime.
                        Open Perci from the desktop app to use Eidos.
                    </p>
                    <button
                        type="button"
                        onClick={onOpenGuide}
                        className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                        <BookOpen size={14} />
                        Read the Eidos guide
                    </button>
                </div>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="h-full w-full flex items-center justify-center p-8">
                <div className="max-w-lg text-center">
                    <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-red-500/30 bg-red-500/10 flex items-center justify-center">
                        <AlertCircle size={22} className="text-red-400" />
                    </div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                        Eidos could not start
                    </h2>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        {error || 'An unknown error occurred.'}
                    </p>
                    <div className="mt-4 flex flex-col items-center gap-3">
                        {error && /orbstack|docker/i.test(error) && (
                            <a
                                href="https://orbstack.dev"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                            >
                                <ExternalLink size={14} />
                                Install OrbStack
                            </a>
                        )}
                        <button
                            type="button"
                            onClick={handleRetry}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
                        >
                            <RefreshCw size={14} />
                            Retry
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (status !== 'running' || !dashboardReady) {
        return (
            <div className="h-full w-full flex items-center justify-center p-8">
                <div className="max-w-md w-full">
                    <div className="text-center mb-8">
                        <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-center overflow-hidden">
                            <img src={eidosLogo} alt="Eidos" className="w-8 h-8" />
                        </div>
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                            {status === 'checking' ? 'Checking Eidos…' : 'Starting Eidos'}
                        </h2>
                        <p className="mt-1 text-sm text-[var(--text-secondary)]">
                            Setting up your persistent memory stack…
                        </p>
                    </div>
                    <div className="space-y-3">
                        {SETUP_STEPS.map((step, index) => {
                            const done = index < currentStep;
                            const active = index === currentStep;
                            return (
                                <div
                                    key={step.id}
                                    className={`flex items-center gap-3 rounded-lg border px-4 py-2.5 transition-colors ${
                                        active
                                            ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                                            : done
                                                ? 'border-emerald-500/30 bg-emerald-500/5'
                                                : 'border-[var(--border)] bg-[var(--bg-secondary)] opacity-50'
                                    }`}
                                >
                                    {done ? (
                                        <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                                    ) : active ? (
                                        <Loader2 size={16} className="text-[var(--accent)] shrink-0 animate-spin" />
                                    ) : (
                                        <div className="w-4 h-4 rounded-full border border-[var(--border)] shrink-0" />
                                    )}
                                    <span className={`text-sm ${
                                        done
                                            ? 'text-emerald-500'
                                            : active
                                                ? 'text-[var(--text-primary)]'
                                                : 'text-[var(--text-tertiary)]'
                                    }`}>
                                        {step.label}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        );
    }

    if (surface === 'dashboard') {
        return (
            <div className="eidos-dashboard-root">
                <div className="eidos-dashboard-toolbar">
                    <button
                        type="button"
                        className="eidos-toolbar-btn eidos-toolbar-btn-primary"
                        onClick={() => setSurface('overview')}
                    >
                        <Layers size={14} />
                        Overview
                    </button>
                    <button
                        type="button"
                        className="eidos-toolbar-btn"
                        onClick={() => setFrameKey((prev) => prev + 1)}
                    >
                        <RefreshCw size={14} />
                        Reload dashboard
                    </button>
                    <button
                        type="button"
                        className="eidos-toolbar-btn"
                        onClick={handleOpenDashboardInBrowser}
                    >
                        <ExternalLink size={14} />
                        Open in browser
                    </button>
                    <button
                        type="button"
                        className="eidos-toolbar-btn"
                        onClick={onOpenGuide}
                        style={{ marginLeft: 'auto' }}
                    >
                        <BookOpen size={14} />
                        Guide
                    </button>
                </div>
                <webview
                    key={`eidos-${frameKey}`}
                    src={DASHBOARD_URL}
                    title="Eidos Dashboard"
                    className="eidos-dashboard-webview"
                    partition="persist:perci-eidos"
                    allowpopups="true"
                />
            </div>
        );
    }

    return (
        <div className="eidos-front-root">
            <div className="eidos-front-bg" aria-hidden="true">
                <span className="eidos-front-orb eidos-front-orb-main" />
                <span className="eidos-front-orb eidos-front-orb-side" />
                <span className="eidos-front-grid" />
            </div>

            <div className="eidos-front-scroll">
                <section className="eidos-contrib-card" aria-label="Toshon Jennings GitHub contribution graph">
                    <div className="eidos-contrib-head">
                        <span>
                            <Github size={13} />
                            GitHub activity
                        </span>
                        <a
                            href="https://github.com/toshon-jennings"
                            target="_blank"
                            rel="noopener noreferrer"
                        >
                            toshon-jennings
                            <ArrowUpRight size={13} />
                        </a>
                    </div>
                    <img
                        src={CONTRIBUTIONS_GRAPH_URL}
                        alt="GitHub contribution graph for toshon-jennings"
                        className="eidos-contrib-graph"
                        loading="eager"
                        referrerPolicy="no-referrer"
                    />
                </section>

                <section className="eidos-front-hero">
                    <div>
                        <p className="eidos-front-kicker">
                            <GitBranch size={13} />
                            Eidos command center
                        </p>
                        <div className="eidos-front-title-row">
                            <Github size={34} aria-hidden="true" />
                            <h1 className="eidos-front-title">Git Visualizer</h1>
                        </div>
                        <p className="eidos-front-subtitle">
                            See open commits, branch drift, and local change pressure across your active repositories.
                        </p>
                    </div>
                    <div className="eidos-front-actions">
                        <button
                            type="button"
                            className="eidos-cta eidos-cta-primary"
                            onClick={() => setSurface('dashboard')}
                        >
                            <Layers size={14} />
                            Open Eidos dashboard
                        </button>
                        <button
                            type="button"
                            className="eidos-cta"
                            onClick={() => void loadInsights()}
                            disabled={insightsLoading}
                        >
                            <RefreshCw size={14} className={insightsLoading ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                        <button
                            type="button"
                            className="eidos-cta"
                            onClick={handleOpenDashboardInBrowser}
                        >
                            <ExternalLink size={14} />
                            Browser
                        </button>
                        <button
                            type="button"
                            className="eidos-cta"
                            onClick={onOpenGuide}
                        >
                            <BookOpen size={14} />
                            Guide
                        </button>
                    </div>
                </section>

                <section className="eidos-kpi-grid">
                    <KpiCard
                        label="Open commits"
                        value={compactNumber(summary.totalOpenCommits)}
                        detail={`${summary.reposWithOpenCommits} repos ahead`}
                        tone="attention"
                    />
                    <KpiCard
                        label="Changed files"
                        value={compactNumber(summary.totalChangedFiles)}
                        detail={`${summary.openRepoCount} repos with active work`}
                        tone="active"
                    />
                    <KpiCard
                        label="Need pull"
                        value={compactNumber(summary.reposNeedingPull)}
                        detail={`${summary.staleRepoCount} stale repos`}
                        tone="warning"
                    />
                    <KpiCard
                        label="Tracked repos"
                        value={compactNumber(summary.repoCount)}
                        detail={`${summary.branchCount} active branches`}
                        tone="default"
                    />
                </section>

                <section className="eidos-front-grid-layout">
                    <article className="eidos-panel eidos-panel-main">
                        <div className="eidos-panel-head">
                            <div>
                                <h2>Repos with open work</h2>
                                <p>Updated {snapshotText}</p>
                            </div>
                            <span>{attentionRepos.length} repos</span>
                        </div>

                        {insightsError && (
                            <div className="eidos-inline-error">
                                <AlertTriangle size={14} />
                                <span>{insightsError}</span>
                            </div>
                        )}

                        {attentionRepos.length > 0 ? (
                            <ul className="eidos-repo-list">
                                {attentionRepos.map((repo) => {
                                    const stackTotal = Math.max(repo.changedFiles + repo.openCommits + repo.behindCommits, 1);
                                    const dirtyWidth = ratioPercent(repo.changedFiles, stackTotal);
                                    const aheadWidth = ratioPercent(repo.openCommits, stackTotal);
                                    const behindWidth = ratioPercent(repo.behindCommits, stackTotal);
                                    return (
                                        <li key={repo.id || repo.path} className="eidos-repo-card">
                                            <div className="eidos-repo-header">
                                                <div className="eidos-repo-title">
                                                    <strong>{repo.name}</strong>
                                                    <span>{repo.branch || 'detached'}</span>
                                                </div>
                                                <div className="eidos-repo-age">{relativeTime(repo.lastCommitAt)}</div>
                                            </div>
                                            <div className="eidos-repo-stack" aria-hidden="true">
                                                <span className="is-dirty" style={{ width: `${dirtyWidth}%` }} />
                                                <span className="is-ahead" style={{ width: `${aheadWidth}%` }} />
                                                <span className="is-behind" style={{ width: `${behindWidth}%` }} />
                                            </div>
                                            <div className="eidos-repo-meta">
                                                <span className="eidos-chip is-dirty">{repo.changedFiles} changed</span>
                                                <span className="eidos-chip is-ahead">{repo.openCommits} open commits</span>
                                                <span className="eidos-chip is-behind">{repo.behindCommits} behind</span>
                                                <span className="eidos-chip">{repo.untrackedFiles} untracked</span>
                                            </div>
                                            <p className="eidos-repo-path">{shortenPath(repo.path)}</p>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <p className="eidos-empty-state">
                                {insightsLoading
                                    ? 'Loading repository state...'
                                    : 'No repos currently need attention. Register projects in Git Shells to expand this visualizer.'}
                            </p>
                        )}
                    </article>

                    <aside className="eidos-rail">
                        <article className="eidos-panel">
                            <div className="eidos-panel-head">
                                <h2>Service heartbeat</h2>
                                <span>{services.runtime || 'unknown'}</span>
                            </div>
                            <div className="eidos-health-grid">
                                <span className={`eidos-health-pill ${services.apiHealthy ? 'is-online' : 'is-offline'}`}>
                                    API {services.apiHealthy ? 'online' : 'offline'}
                                </span>
                                <span className={`eidos-health-pill ${services.dashboardHealthy ? 'is-online' : 'is-offline'}`}>
                                    Dashboard {services.dashboardHealthy ? 'online' : 'offline'}
                                </span>
                                <span className="eidos-health-pill">
                                    Runtime {services.runtime || 'unknown'}
                                </span>
                            </div>
                        </article>

                        <article className="eidos-panel">
                            <div className="eidos-panel-head">
                                <h2>Clean repos</h2>
                                <span>{summary.cleanRepoCount}</span>
                            </div>
                            {cleanRepos.length > 0 ? (
                                <ul className="eidos-clean-list">
                                    {cleanRepos.map((repo) => (
                                        <li key={repo.id || repo.path}>
                                            <span>{repo.name}</span>
                                            <small>{repo.branch || 'detached'}</small>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="eidos-empty-state">No clean repos detected yet.</p>
                            )}
                        </article>
                    </aside>
                </section>

                {repos.length > 0 && (
                    <section className="eidos-panel eidos-panel-matrix">
                        <div className="eidos-panel-head">
                            <div>
                                <h2>Repository matrix</h2>
                                <p>At-a-glance state for all tracked repos</p>
                            </div>
                            <span>{repos.length}</span>
                        </div>
                        <div className="eidos-matrix">
                            {repos.map((repo) => (
                                <div
                                    key={`matrix-${repo.id || repo.path}`}
                                    className={`eidos-matrix-item ${repo.hasOpenWork ? 'is-hot' : 'is-cool'}`}
                                >
                                    <div className="eidos-matrix-top">
                                        <strong>{repo.name}</strong>
                                        {repo.hasOpenWork ? (
                                            <GitCommitHorizontal size={13} />
                                        ) : (
                                            <CheckCircle2 size={13} />
                                        )}
                                    </div>
                                    <div className="eidos-matrix-bottom">
                                        <span>{repo.branch || 'detached'}</span>
                                        <span>
                                            {repo.openCommits > 0
                                                ? `${repo.openCommits} open`
                                                : repo.changedFiles > 0
                                                    ? `${repo.changedFiles} changed`
                                                    : 'Clean'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <section className="eidos-front-footer">
                    <p>
                        Source scan: {insights?.sources?.candidateCount || 0} candidate folders ·
                        {` `}Git Shells projects: {insights?.sources?.gitShellProjectCount || 0}
                    </p>
                    <button
                        type="button"
                        className="eidos-footer-link"
                        onClick={() => setSurface('dashboard')}
                    >
                        Open full dashboard
                        <ArrowUpRight size={13} />
                    </button>
                </section>
            </div>
        </div>
    );
}

export default function EidosMode() {
    const [guideOpen, setGuideOpen] = useState(false);
    return (
        <div className="relative h-full">
            <EidosModeInner onOpenGuide={() => setGuideOpen(true)} />
            <EidosGuideModal isOpen={guideOpen} onClose={() => setGuideOpen(false)} />
        </div>
    );
}
