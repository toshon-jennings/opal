import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, ExternalLink, RefreshCw, RotateCw } from 'lucide-react';

const GH_ORIGIN = 'http://127.0.0.1:6282';

export default function GithubOverviewMode() {
    const webviewRef = useRef(null);
    const canUseWebview = typeof window !== 'undefined' && Boolean(window.electron);
    const [frameKey, setFrameKey] = useState(0);
    const [status, setStatus] = useState('loading'); // 'loading' | 'online' | 'offline'
    const [contentReady, setContentReady] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [refreshingAll, setRefreshingAll] = useState(false);

    useEffect(() => {
        let active = true;
        setStatus('loading');
        setContentReady(false);
        setLoadError(null);
        if (canUseWebview) return () => { active = false; };
        fetch(GH_ORIGIN, { cache: 'no-store', mode: 'no-cors' })
            .then(res => {
                if (!active) return;
                if (res.type !== 'opaque' && !res.ok) throw new Error(`HTTP ${res.status}`);
                setStatus('online');
            })
            .catch(err => {
                if (!active) return;
                setLoadError(err.message || 'GitHub Overview is not reachable.');
                setStatus('offline');
            });
        return () => { active = false; };
    }, [canUseWebview, frameKey]);

    useEffect(() => {
        if (!canUseWebview) return undefined;
        const webview = webviewRef.current;
        if (!webview) return undefined;
        const onReady = () => { setContentReady(true); setLoadError(null); setStatus('online'); };
        const onFail = (event) => {
            if (!event.isMainFrame || event.errorCode === -3) return;
            setLoadError(event.errorDescription || `Failed to load (code ${event.errorCode})`);
            setStatus('offline');
        };
        webview.addEventListener('dom-ready', onReady);
        webview.addEventListener('did-fail-load', onFail);
        return () => {
            webview.removeEventListener('dom-ready', onReady);
            webview.removeEventListener('did-fail-load', onFail);
        };
    }, [canUseWebview, frameKey]);

    const reload = useCallback(() => {
        setLoadError(null);
        setContentReady(false);
        setFrameKey(k => k + 1);
    }, []);

    const handleRefreshAll = useCallback(async () => {
        setRefreshingAll(true);
        try {
            await fetch(`${GH_ORIGIN}/repos/poll-all`, { method: 'POST' });
        } catch (err) {
            console.error('Failed to trigger refresh all:', err);
        } finally {
            setTimeout(() => setRefreshingAll(false), 800);
        }
    }, []);

    const isOffline = status === 'offline' || Boolean(loadError);

    return (
        <div className="h-full w-full flex flex-col bg-[var(--bg-primary)]">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-secondary)]/30 shrink-0">
                <button
                    onClick={reload}
                    className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                    title="Reload page"
                >
                    <RotateCw size={14} />
                </button>
                <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-xs font-mono text-[var(--text-secondary)]">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${status === 'online' ? 'bg-emerald-400' : status === 'loading' ? 'bg-yellow-400 animate-pulse' : 'bg-red-400'}`} />
                    {GH_ORIGIN}
                </div>
                {window.electron?.openExternal && (
                    <button
                        onClick={() => window.electron.openExternal(GH_ORIGIN)}
                        className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                        title="Open in browser"
                    >
                        <ExternalLink size={14} />
                    </button>
                )}
            </div>

            {isOffline ? (
                <div className="flex flex-1 items-center justify-center p-8">
                    <div className="max-w-lg text-center">
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">GitHub Overview is not running</h2>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                            GitHub Overview is a self-contained Go binary that polls your repos for commits, CI status, alerts, and PRs. It needs to be running locally on port <code className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-xs">6282</code>.
                        </p>
                        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-left">
                            <p className="text-[11px] font-medium text-[var(--text-tertiary)] uppercase tracking-wide mb-2">Install &amp; run</p>
                            <div className="space-y-1.5 font-mono text-xs text-[var(--text-secondary)]">
                                <p>git clone https://github.com/toshon-jennings/github-overview ~/github-overview</p>
                                <p>cd ~/github-overview &amp;&amp; go build -o github-overview .</p>
                                <p>./github-overview serve</p>
                            </div>
                        </div>
                        <p className="mt-3 text-xs text-[var(--text-tertiary)]">
                            Requires Go 1.25+. A GitHub token is optional but recommended for useful poll rates.
                        </p>
                        {loadError && (
                            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-red-400">
                                <AlertCircle size={13} /> {loadError}
                            </p>
                        )}
                        <div className="mt-5 flex justify-center gap-2">
                            <button type="button" onClick={reload}
                                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                                <RefreshCw size={14} /> Reload
                            </button>
                        </div>
                    </div>
                </div>
            ) : canUseWebview ? (
                <div className="relative min-h-0 flex-1">
                    <webview
                        ref={webviewRef}
                        key={frameKey}
                        src={GH_ORIGIN}
                        className="absolute inset-0 h-full w-full border-0"
                        partition="persist:perci-github-overview"
                        allowpopups="true"
                    />
                    {!contentReady && (
                        <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg-primary)]/80 backdrop-blur-sm">
                            <div className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)]">
                                <RefreshCw size={12} className="animate-spin" /> Loading GitHub Overview…
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <iframe
                    ref={webviewRef}
                    key={frameKey}
                    src={GH_ORIGIN}
                    className="flex-1 min-h-0 w-full border-0"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    title="GitHub Overview"
                    onLoad={() => { setContentReady(true); setStatus('online'); }}
                />
            )}
        </div>
    );
}
