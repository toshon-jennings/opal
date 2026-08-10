/* eslint-disable react/no-unknown-property */
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ExternalLink, RefreshCw, Play, Loader2, Hammer, X } from 'lucide-react';
import opencodeIcon from '../assets/opencode-icon.png';

const OPENCODE_URL = 'http://127.0.0.1:4096';
// Must match OPENCODE_PARTITION in electron/main.cjs — that session is where the
// Basic credentials get injected, so the webview has to load through it.
const OPENCODE_PARTITION = 'persist:perci-opencode';
const START_TIMEOUT_MS = 30000;

export default function OpencodeMode() {
    const canUseWebview = typeof window !== 'undefined' && Boolean(window.electron);
    const [frameKey, setFrameKey] = useState(0);
    const [status, setStatus] = useState('checking'); // checking | no-cli | starting | running | offline | foreign
    const [contentReady, setContentReady] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [buildInfo, setBuildInfo] = useState(null);
    const [rebuild, setRebuild] = useState(null); // null | { line } while building
    const [rebuildError, setRebuildError] = useState(null);
    const [staleDismissed, setStaleDismissed] = useState(false);
    const webviewRef = useRef(null);
    const pollIntervalRef = useRef(null);

    // In Electron the probe runs in main, which can read the status code and
    // authenticate — so it can tell "nothing listening" from "someone else's
    // server". The browser build has neither, and can't inject credentials into
    // an iframe either, so it only learns reachable vs not.
    const probe = useCallback(async () => {
        if (window.electron?.opencodeProbe) {
            try {
                const result = await window.electron.opencodeProbe();
                if (result?.state === 'ready') return 'running';
                if (result?.state === 'foreign') return 'foreign';
                return 'offline';
            } catch {
                return 'offline';
            }
        }
        try {
            await fetch(`${OPENCODE_URL}/`, {
                mode: 'no-cors',
                cache: 'no-store',
                signal: AbortSignal.timeout(1500),
            });
            return 'running';
        } catch {
            return 'offline';
        }
    }, []);

    const stopPolling = useCallback(() => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
    }, []);

    const startPolling = useCallback(() => {
        if (pollIntervalRef.current) return;
        const deadline = Date.now() + START_TIMEOUT_MS;
        pollIntervalRef.current = setInterval(async () => {
            const next = await probe();
            if (next === 'running') {
                stopPolling();
                setStatus('running');
                return;
            }
            if (Date.now() > deadline) {
                stopPolling();
                setStatus(next);
                if (next !== 'foreign') setLoadError('OpenCode did not come up in time.');
            }
        }, 1500);
    }, [probe, stopPolling]);

    // Detect the CLI (Electron only — the browser build can't launch processes),
    // then probe the port. Re-runs on Reload via frameKey.
    useEffect(() => {
        let active = true;
        (async () => {
            if (window.electron?.opencodeCheckInstall) {
                try {
                    const info = await window.electron.opencodeCheckInstall();
                    if (!active) return;
                    if (!info?.installed) {
                        setStatus('no-cli');
                        return;
                    }
                } catch {
                    if (active) setStatus('offline');
                    return;
                }
            }
            const next = await probe();
            if (active) setStatus(next);
        })();
        return () => {
            active = false;
            stopPolling();
        };
    }, [probe, stopPolling, frameKey]);

    useEffect(() => {
        const webview = webviewRef.current;
        if (!canUseWebview || !webview || status !== 'running') return;
        const handleReady = () => {
            setContentReady(true);
            setLoadError(null);
        };
        const handleFail = (event) => {
            if (event.errorCode === -3) return; // aborted — usually a redirect
            setContentReady(false);
            setLoadError(event.errorDescription || `Load failed (${event.errorCode})`);
            setStatus('offline');
        };
        webview.addEventListener('did-finish-load', handleReady);
        webview.addEventListener('did-fail-load', handleFail);
        return () => {
            webview.removeEventListener('did-finish-load', handleReady);
            webview.removeEventListener('did-fail-load', handleFail);
        };
    }, [canUseWebview, frameKey, status]);

    const refreshBuildInfo = useCallback(async () => {
        if (!window.electron?.opencodeBuildInfo) return null;
        try {
            const info = await window.electron.opencodeBuildInfo();
            setBuildInfo(info);
            return info;
        } catch {
            return null;
        }
    }, []);

    // The embedded UI is compiled into the binary, so a source edit doesn't reach
    // the window until it's rebuilt. Checked on open and after each reload.
    useEffect(() => {
        refreshBuildInfo();
    }, [refreshBuildInfo, frameKey]);

    useEffect(() => {
        if (!window.electron?.onOpencodeRebuildProgress) return;
        return window.electron.onOpencodeRebuildProgress((line) => {
            setRebuild((current) => (current ? { line } : current));
        });
    }, []);

    const handleLaunch = useCallback(async () => {
        if (!window.electron?.opencodeStart) return;
        setLoadError(null);
        setStatus('starting');
        try {
            const result = await window.electron.opencodeStart();
            if (!result?.ok) throw new Error(result?.error || 'OpenCode did not start.');
            startPolling();
        } catch (err) {
            console.error('[OpenCode] Failed to start server:', err);
            setLoadError(err.message);
            setStatus('offline');
        }
    }, [startPolling]);

    // Main stops Perci's server once the build lands, so restarting here is what
    // swaps the running server over to the freshly built binary.
    const handleRebuild = useCallback(async () => {
        if (!window.electron?.opencodeRebuild) return;
        setRebuildError(null);
        setRebuild({ line: 'Starting build…' });
        try {
            const result = await window.electron.opencodeRebuild();
            if (!result?.ok) throw new Error(result?.error || 'Rebuild failed.');
            setRebuild(null);
            await refreshBuildInfo();
            setContentReady(false);
            setFrameKey((k) => k + 1);
            setStatus('starting');
            const started = await window.electron.opencodeStart();
            if (!started?.ok) throw new Error(started?.error || 'OpenCode did not restart.');
            startPolling();
        } catch (err) {
            console.error('[OpenCode] Rebuild failed:', err);
            setRebuild(null);
            setRebuildError(err.message);
            setStatus('offline');
        }
    }, [refreshBuildInfo, startPolling]);

    const reload = () => { setLoadError(null); setContentReady(false); setFrameKey((k) => k + 1); };
    const openExternal = () => {
        if (window.electron?.openExternal) window.electron.openExternal(OPENCODE_URL);
        else window.open(OPENCODE_URL, '_blank', 'noopener,noreferrer');
    };

    const themedUrl = `${OPENCODE_URL}/?perci=1`;

    return (
        <div className="flex h-full flex-col bg-[var(--bg-primary)]">
            <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4">
                <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)]">
                        <img src={opencodeIcon} alt="OpenCode Rig" className="h-6 w-6 rounded" />
                    </div>
                    <div className="min-w-0">
                        <div className="truncate font-mono text-sm tracking-tight select-none" style={{ fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace' }}>
                            <span style={{ color: '#9CA3AF' }}>open</span><span style={{ color: '#6B7280' }}>Code</span>{' '}
                            <span style={{ color: '#D97757' }}>RIG_</span>
                        </div>
                        <div className="truncate font-mono text-[11px] text-[var(--text-tertiary)]">{OPENCODE_URL}</div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                        status === 'running' ? 'bg-emerald-500/10 text-emerald-400'
                        : status === 'starting' || status === 'checking' ? 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                        : status === 'foreign' ? 'bg-amber-500/10 text-amber-500'
                        : 'bg-red-500/10 text-red-400'
                    }`}>
                        {status === 'running' ? 'online'
                            : status === 'no-cli' ? 'not installed'
                            : status === 'foreign' ? 'locked'
                            : status}
                    </span>
                    {buildInfo && buildInfo.isRig === false && (
                        <span title="Perci fell back to the opencode CLI on PATH, which proxies its interface from app.opencode.ai"
                            className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-500">
                            stock build
                        </span>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    <button type="button" onClick={reload} title="Reload"
                        className="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                        <RefreshCw size={15} />
                    </button>
                    <button type="button" onClick={openExternal} title="Open in browser"
                        className="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                        <ExternalLink size={15} />
                    </button>
                </div>
            </div>

            {rebuild ? (
                <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-[var(--bg-tertiary)] px-4 py-2.5">
                    <Loader2 size={14} className="shrink-0 animate-spin text-[var(--accent)]" />
                    <div className="min-w-0 flex-1">
                        <div className="text-xs font-medium text-[var(--text-primary)]">Rebuilding OpenCode Rig…</div>
                        <div className="truncate font-mono text-[11px] text-[var(--text-tertiary)]">{rebuild.line}</div>
                    </div>
                </div>
            ) : rebuildError ? (
                <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-red-500/10 px-4 py-2.5">
                    <AlertCircle size={14} className="shrink-0 text-red-400" />
                    <div className="min-w-0 flex-1 text-xs text-red-400">{rebuildError}</div>
                    <button type="button" onClick={handleRebuild}
                        className="shrink-0 rounded-md border border-[var(--border)] px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                        Try again
                    </button>
                    <button type="button" onClick={() => setRebuildError(null)} title="Dismiss"
                        className="shrink-0 rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                        <X size={13} />
                    </button>
                </div>
            ) : buildInfo?.stale && buildInfo?.canRebuild && !staleDismissed ? (
                <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] bg-amber-500/10 px-4 py-2.5">
                    <Hammer size={14} className="shrink-0 text-amber-500" />
                    <div className="min-w-0 flex-1 text-xs text-[var(--text-secondary)]">
                        <span className="font-medium text-amber-500">Rig UI is out of date.</span>{' '}
                        The interface is compiled into the binary, and your source has changed since it was built.
                    </div>
                    <button type="button" onClick={handleRebuild}
                        className="shrink-0 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500 transition-colors hover:bg-amber-500/20">
                        Rebuild
                    </button>
                    <button type="button" onClick={() => setStaleDismissed(true)} title="Dismiss"
                        className="shrink-0 rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                        <X size={13} />
                    </button>
                </div>
            ) : null}

            {status === 'no-cli' ? (
                <div className="flex flex-1 items-center justify-center p-8">
                    <div className="max-w-md text-center">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">OpenCode is not installed</h2>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                            Install the opencode CLI to embed it in Perci.
                        </p>
                        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                            npm install -g opencode-ai
                        </div>
                        <p className="mt-3 text-xs text-[var(--text-tertiary)]">
                            Or download the desktop app from{' '}
                            <a href="https://github.com/toshon-jennings/opencode-rig/releases" target="_blank" rel="noopener noreferrer" className="text-[var(--accent)] underline">
                                github.com/toshon-jennings/opencode-rig
                            </a>
                        </p>
                    </div>
                </div>
            ) : status === 'foreign' ? (
                <div className="flex flex-1 items-center justify-center p-8">
                    <div className="max-w-md text-center">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Port 4096 is already in use</h2>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                            A password-protected OpenCode server that Perci didn&apos;t start is running on
                            this port, so Perci can&apos;t authenticate to it. Quit that server — the
                            desktop app, or another terminal — then reload to let Perci start its own.
                        </p>
                        <div className="mt-5 flex justify-center gap-2">
                            <button type="button" onClick={reload}
                                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                                <RefreshCw size={14} /> Reload
                            </button>
                            <button type="button" onClick={openExternal}
                                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                                <ExternalLink size={14} /> Open in browser
                            </button>
                        </div>
                    </div>
                </div>
            ) : status === 'offline' || status === 'starting' ? (
                <div className="flex flex-1 items-center justify-center p-8">
                    <div className="max-w-md text-center">
                        {status === 'starting' ? (
                            <>
                                <Loader2 size={32} className="mx-auto animate-spin text-[var(--accent)]" />
                                <p className="mt-4 text-sm text-[var(--text-secondary)]">Starting OpenCode server…</p>
                                <p className="mt-1 text-xs text-[var(--text-tertiary)]">Waiting for {OPENCODE_URL}</p>
                            </>
                        ) : (
                            <>
                                <h2 className="text-lg font-semibold text-[var(--text-primary)]">OpenCode server is not reachable</h2>
                                <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                                    Start the headless server, then reload this window.
                                </p>
                                <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                                    opencode serve --port 4096
                                </div>
                                {loadError && (
                                    <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-red-400">
                                        <AlertCircle size={13} /> {loadError}
                                    </p>
                                )}
                                <div className="mt-5 flex justify-center gap-2">
                                    <button type="button" onClick={handleLaunch}
                                        className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                                        <Play size={14} /> Start OpenCode
                                    </button>
                                    <button type="button" onClick={reload}
                                        className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                                        <RefreshCw size={14} /> Reload
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            ) : canUseWebview ? (
                <div className="relative min-h-0 flex-1">
                    <webview ref={webviewRef} key={`webview-${frameKey}`} src={themedUrl}
                        partition={OPENCODE_PARTITION}
                        title="OpenCode Rig" className="absolute inset-0 h-full w-full border-0" allowpopups="true" />
                    {!contentReady && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg-primary)]/80 backdrop-blur-sm">
                            <div className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)]">
                                <RefreshCw size={12} className="animate-spin" /> Loading OpenCode…
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <iframe key={frameKey} src={themedUrl} title="OpenCode Rig"
                    className="min-h-0 flex-1 border-0" onLoad={() => { setContentReady(true); setStatus('running'); }} />
            )}
        </div>
    );
}
