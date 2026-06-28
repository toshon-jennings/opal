import { useState, useRef, useCallback, useEffect } from 'react';
import { AlertTriangle, RefreshCw, ExternalLink, Play, Loader2, Container } from 'lucide-react';

// Default URL for the Open Notebook window. Change this to point at whatever
// notebook / localhost service you want to embed. The value is persisted in
// localStorage so it survives reloads.
const STORAGE_KEY = 'perci_open_notebook_url';
const DEFAULT_URL = 'http://localhost:8502';

function readUrl() {
    try {
        return localStorage.getItem(STORAGE_KEY) || DEFAULT_URL;
    } catch {
        return DEFAULT_URL;
    }
}

export default function OpenNotebookMode() {
    const isElectron = !!window.electron;
    const hasDockerApi = isElectron && window.electron?.dockerStatus;

    const [url] = useState(readUrl);
    const [loadError, setLoadError] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [dockerState, setDockerState] = useState('checking');
    const [dockerStarting, setDockerStarting] = useState(false);
    const [dockerMessage, setDockerMessage] = useState('');
    const webviewRef = useRef(null);

    const checkDocker = useCallback(async () => {
        if (!hasDockerApi) {
            setDockerState('running');
            return;
        }
        setDockerState('checking');
        try {
            const result = await window.electron.dockerStatus();
            setDockerState(result.state);
            setDockerMessage(result.error || '');
        } catch (err) {
            setDockerState('error');
            setDockerMessage(err?.message || 'Failed to check Docker status');
        }
    }, [hasDockerApi]);

    useEffect(() => {
        checkDocker();
    }, [checkDocker]);

    const handleStartOrbStack = useCallback(async () => {
        if (!window.electron?.dockerStartOrbStack) return;
        setDockerStarting(true);
        setDockerMessage('Starting OrbStack...');
        try {
            const result = await window.electron.dockerStartOrbStack();
            if (result.alreadyRunning) {
                setDockerState('running');
                setDockerMessage('');
            } else if (result.state === 'running') {
                setDockerState('running');
                setDockerMessage('');
            } else {
                setDockerState(result.state);
                setDockerMessage(result.error || 'OrbStack failed to start');
            }
        } catch (err) {
            setDockerState('error');
            setDockerMessage(err?.message || 'Failed to start OrbStack');
        } finally {
            setDockerStarting(false);
        }
    }, []);

    const handleReload = useCallback(() => {
        if (webviewRef.current) {
            setLoadError(null);
            webviewRef.current.reload();
        }
    }, []);

    const handleOpenInBrowser = useCallback(() => {
        if (window.electron?.openExternal) {
            window.electron.openExternal(url);
        } else {
            window.open(url, '_blank', 'noopener,noreferrer');
        }
    }, [url]);

    // ── Non-Electron fallback ─────────────────────────────────────────────
    if (!isElectron) {
        return (
            <div className="h-full w-full flex items-center justify-center p-8">
                <div className="max-w-lg text-center">
                    <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-center">
                        <ExternalLink size={22} className="text-[var(--text-tertiary)]" />
                    </div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">Open Notebook requires the desktop app</h2>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">
                        Embedding a localhost notebook needs Electron's webview. Open Perci from the desktop app to use this.
                    </p>
                </div>
            </div>
        );
    }

    // ── Docker not ready — show prompt instead of webview ────────────────
    if (dockerState !== 'running' && dockerState !== 'checking') {
        return (
            <div className="h-full w-full flex items-center justify-center p-8 bg-[var(--bg-primary)]">
                <div className="max-w-md text-center">
                    <div className="mx-auto mb-4 w-14 h-14 rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] flex items-center justify-center">
                        <Container size={28} className="text-[var(--text-tertiary)]" />
                    </div>
                    <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                        {dockerState === 'not-installed' ? 'OrbStack Required' : 'OrbStack Not Running'}
                    </h2>
                    <p className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                        {dockerState === 'not-installed'
                            ? 'Open Notebook needs a local Docker runtime. Install OrbStack to run the notebook service locally.'
                            : dockerState === 'orbstack-stopped'
                                ? 'OrbStack is installed but not started. Start it to launch the notebook service.'
                                : (dockerMessage || 'Waiting for Docker/OrbStack to become available...')}
                    </p>

                    {dockerState === 'orbstack-stopped' && (
                        <button
                            type="button"
                            onClick={handleStartOrbStack}
                            disabled={dockerStarting}
                            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-50"
                        >
                            {dockerStarting ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
                            {dockerStarting ? 'Starting...' : 'Start OrbStack'}
                        </button>
                    )}

                    {dockerState === 'not-installed' && (
                        <a
                            href="https://orbstack.dev"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
                        >
                            <ExternalLink size={16} />
                            Install OrbStack
                        </a>
                    )}

                    <button
                        type="button"
                        onClick={checkDocker}
                        className="mt-3 block w-full text-center text-xs text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
                    >
                        Re-check status
                    </button>
                </div>
            </div>
        );
    }

    // ── Normal webview mode (Docker is running) ───────────────────────────
    return (
        <div className="h-full w-full flex flex-col bg-[var(--bg-primary)]">
            {/* Minimal toolbar — NOT an address bar. Just status + reload + external. */}
            <div className="shrink-0 flex items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)]/40 px-3 py-1.5">
                <div className="flex items-center gap-2 min-w-0">
                    {isLoading && (
                        <span className="inline-block h-2 w-2 rounded-full bg-[var(--accent)] animate-pulse" />
                    )}
                    <span className="text-[11px] text-[var(--text-tertiary)] truncate font-mono">
                        {url}
                    </span>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={handleReload}
                        className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        title="Reload"
                    >
                        <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                    <button
                        type="button"
                        onClick={handleOpenInBrowser}
                        className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        title="Open in browser"
                    >
                        <ExternalLink size={13} />
                    </button>
                </div>
            </div>

            {loadError && (
                <div className="shrink-0 flex items-center justify-between gap-3 border-b border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
                    <div className="flex items-center gap-2 min-w-0">
                        <AlertTriangle size={14} className="shrink-0" />
                        <span className="truncate">{loadError}</span>
                    </div>
                    <button
                        type="button"
                        onClick={handleReload}
                        className="shrink-0 font-medium hover:text-red-300"
                    >
                        Retry
                    </button>
                </div>
            )}

            <div className="relative min-h-0 flex-1">
                <webview
                    ref={webviewRef}
                    src={url}
                    title="Open Notebook"
                    className="absolute inset-0 h-full w-full border-0"
                    partition="persist:perci-notebook"
                    allowpopups="true"
                    webpreferences="contextIsolation=yes, javascript=yes"
                    onError={(e) => {
                        setLoadError(e.errorDescription || `Failed to load (code ${e.errorCode})`);
                        setIsLoading(false);
                    }}
                    onDidStartLoading={() => { setIsLoading(true); setLoadError(null); }}
                    onDidStopLoading={() => setIsLoading(false)}
                />
            </div>
        </div>
    );
}
