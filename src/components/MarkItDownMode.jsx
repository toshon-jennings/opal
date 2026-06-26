import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, ExternalLink, Play, RefreshCw } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import markitdownLogo from '../assets/markitdown-logo.jpeg';

const MARKITDOWN_URL = 'http://127.0.0.1:8920';
const MARKITDOWN_ORIGIN = new URL(MARKITDOWN_URL).origin;

async function checkMarkItDownStatus() {
    if (window.electron?.getMarkItDownServerStatus) {
        return window.electron.getMarkItDownServerStatus();
    }

    const response = await fetch(`${MARKITDOWN_URL}/api/health`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { ok: true, url: MARKITDOWN_URL };
}

export default function MarkItDownMode() {
    const { resolvedTheme } = useTheme();
    const canUseWebview = typeof window !== 'undefined' && Boolean(window.electron);
    const [frameKey, setFrameKey] = useState(0);
    const [status, setStatus] = useState({ state: 'loading' });
    const [contentReady, setContentReady] = useState(false);
    const [loadError, setLoadError] = useState(null);
    const [startError, setStartError] = useState('');
    const [embedMode, setEmbedMode] = useState(() => (canUseWebview ? 'webview' : 'iframe'));
    const iframeRef = useRef(null);
    const webviewRef = useRef(null);
    const themedUrl = useMemo(() => `${MARKITDOWN_URL}/?theme=${resolvedTheme}&perci=1`, [resolvedTheme]);

    useEffect(() => {
        let active = true;
        setStatus({ state: 'loading' });
        setContentReady(false);
        setEmbedMode(canUseWebview ? 'webview' : 'iframe');
        setLoadError(null);
        setStartError('');
        checkMarkItDownStatus()
            .then((result) => {
                if (!active) return;
                if (!result?.ok) throw new Error(result?.error || 'MarkItDownUI is not reachable.');
                setStatus({ state: 'online' });
            })
            .catch((error) => {
                if (!active) return;
                setLoadError(error.message || 'MarkItDownUI is not reachable.');
                setStatus({ state: 'offline' });
            });
        return () => {
            active = false;
        };
    }, [frameKey, themedUrl, canUseWebview]);

    useEffect(() => {
        if (embedMode !== 'webview') return undefined;
        const webview = webviewRef.current;
        if (!webview) return undefined;

        const handleDomReady = () => {
            setContentReady(true);
            setLoadError(null);
            setStatus({ state: 'online' });
            webview.focus();
        };
        const handleStop = () => {
            setContentReady(true);
            setLoadError(null);
            setStatus({ state: 'online' });
        };
        const handleFail = (event) => {
            if (!event.isMainFrame || event.errorCode === -3) return;
            setContentReady(false);
            setLoadError(event.errorDescription || `Failed to load (code ${event.errorCode})`);
            setStatus({ state: 'offline' });
        };

        webview.addEventListener('dom-ready', handleDomReady);
        webview.addEventListener('did-stop-loading', handleStop);
        webview.addEventListener('did-fail-load', handleFail);
        return () => {
            webview.removeEventListener('dom-ready', handleDomReady);
            webview.removeEventListener('did-stop-loading', handleStop);
            webview.removeEventListener('did-fail-load', handleFail);
        };
    }, [embedMode, frameKey, themedUrl]);

    useEffect(() => {
        const handleVisionRequest = async (event) => {
            if (event.origin !== MARKITDOWN_ORIGIN) return;
            const message = event.data || {};

            const reply = (payload) => {
                event.source?.postMessage({
                    type: message.type === 'markitdown:install-exiftool-request'
                        ? 'markitdown:install-exiftool-response'
                        : 'markitdown:vision-response',
                    id: message.id,
                    ...payload
                }, event.origin);
            };

            if (message.type === 'markitdown:install-exiftool-request') {
                if (!window.electron?.installMarkItDownExifTool) {
                    reply({ ok: false, error: 'ExifTool installation requires the Perci desktop app after restart.' });
                    return;
                }
                try {
                    const result = await window.electron.installMarkItDownExifTool();
                    reply({ ok: true, message: result.message, path: result.path, installed: result.installed });
                } catch (error) {
                    reply({ ok: false, error: error.message || 'ExifTool installation failed.' });
                }
                return;
            }

            if (message.type !== 'markitdown:vision-request') return;

            if (!window.electron?.describeMarkItDownImage) {
                reply({ ok: false, error: 'Perci OpenRouter vision requires the desktop app.' });
                return;
            }

            try {
                const result = await window.electron.describeMarkItDownImage({
                    filename: message.filename,
                    mimeType: message.mimeType,
                    dataUrl: message.dataUrl
                });
                reply({ ok: true, markdown: result.markdown, model: result.model });
            } catch (error) {
                reply({ ok: false, error: error.message || 'Perci OpenRouter vision failed.' });
            }
        };

        window.addEventListener('message', handleVisionRequest);
        return () => window.removeEventListener('message', handleVisionRequest);
    }, []);

    const reload = () => {
        setLoadError(null);
        setStartError('');
        setContentReady(false);
        setEmbedMode(canUseWebview ? 'webview' : 'iframe');
        setFrameKey((key) => key + 1);
    };

    const startServer = async () => {
        if (!window.electron?.startMarkItDownServer) {
            setStartError('Start server is available in the Perci desktop app after restart.');
            return;
        }
        setStatus({ state: 'starting' });
        setLoadError(null);
        setStartError('');
        setContentReady(false);
        setEmbedMode(canUseWebview ? 'webview' : 'iframe');
        try {
            const result = await window.electron.startMarkItDownServer();
            if (!result?.ok) {
                throw new Error(result?.message || result?.error || 'MarkItDownUI did not become ready.');
            }
            setFrameKey((key) => key + 1);
        } catch (error) {
            setStartError(error.message || 'Could not start MarkItDownUI.');
            setStatus({ state: 'offline' });
        }
    };

    const openExternal = () => {
        if (window.electron?.openExternal) {
            window.electron.openExternal(themedUrl);
        } else {
            window.open(themedUrl, '_blank', 'noopener,noreferrer');
        }
    };

    const isOffline = status.state === 'offline' || Boolean(loadError);

    return (
        <div className="flex h-full flex-col bg-[var(--bg-primary)]">
            <div className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center overflow-hidden rounded-lg border border-[var(--border)] bg-white">
                        <img src={markitdownLogo} alt="" className="h-full w-full object-cover" />
                    </span>
                    <div className="min-w-0">
                        <div className="truncate text-sm font-semibold text-[var(--text-primary)]">MarkItDownUI</div>
                        <div className="truncate font-mono text-[11px] text-[var(--text-tertiary)]">{MARKITDOWN_URL}</div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] ${
                        status.state === 'online'
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : status.state === 'starting'
                                ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                            : status.state === 'loading'
                                ? 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'
                                : 'bg-red-500/10 text-red-400'
                    }`}>
                        {status.state === 'online' ? 'v1.0.0' : status.state}
                    </span>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                    {status.state !== 'online' && (
                        <button
                            type="button"
                            onClick={startServer}
                            disabled={status.state === 'starting'}
                            className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                            title="Start MarkItDownUI server"
                        >
                            <Play size={13} />
                            {status.state === 'starting' ? 'Starting' : 'Start'}
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={reload}
                        className="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        title="Reload MarkItDownUI"
                    >
                        <RefreshCw size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={openExternal}
                        className="rounded-md p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        title="Open MarkItDownUI in browser"
                    >
                        <ExternalLink size={15} />
                    </button>
                </div>
            </div>
            {isOffline ? (
                <div className="flex flex-1 items-center justify-center p-8">
                    <div className="max-w-md text-center">
                        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
                            <img src={markitdownLogo} alt="" className="h-full w-full object-cover" />
                        </div>
                        <h2 className="text-lg font-semibold text-[var(--text-primary)]">MarkItDownUI is not reachable</h2>
                        <p className="mt-2 text-sm leading-6 text-[var(--text-secondary)]">
                            Start the local UI server from `/Users/toshonjennings/markitdown-ui/webui`, then reload this window.
                        </p>
                        <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 font-mono text-xs text-[var(--text-secondary)]">
                            ./run.sh
                        </div>
                        {(loadError || status.error) && (
                            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-red-400">
                                <AlertCircle size={13} />
                                {loadError || 'Not reachable'}
                            </p>
                        )}
                        {startError && (
                            <p className="mt-3 inline-flex items-center gap-1.5 text-xs text-red-400">
                                <AlertCircle size={13} />
                                {startError}
                            </p>
                        )}
                        <div className="mt-5 flex justify-center gap-2">
                            <button
                                type="button"
                                onClick={startServer}
                                disabled={status.state === 'starting'}
                                className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                <Play size={14} />
                                {status.state === 'starting' ? 'Starting server' : 'Start server'}
                            </button>
                            <button
                                type="button"
                                onClick={reload}
                                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            >
                                <RefreshCw size={14} />
                                Reload
                            </button>
                            <button
                                type="button"
                                onClick={openExternal}
                                className="inline-flex items-center gap-2 rounded-lg border border-[var(--border)] px-3 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            >
                                <ExternalLink size={14} />
                                Open URL
                            </button>
                        </div>
                    </div>
                </div>
            ) : (
                embedMode === 'webview' && canUseWebview ? (
                    <div className="relative min-h-0 flex-1">
                        <webview
                            ref={webviewRef}
                            key={`webview-${frameKey}-${resolvedTheme}`}
                            src={themedUrl}
                            title="MarkItDownUI"
                            className="absolute inset-0 h-full w-full border-0 bg-white"
                            allowpopups="true"
                        />
                        {!contentReady && (
                            <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--bg-primary)]/80 backdrop-blur-sm">
                                <div className="inline-flex items-center gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)]">
                                    <RefreshCw size={12} className="animate-spin" />
                                    Loading MarkItDownUI…
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <iframe
                        ref={iframeRef}
                        key={`${frameKey}-${resolvedTheme}`}
                        src={themedUrl}
                        title="MarkItDownUI"
                        className="min-h-0 flex-1 border-0 bg-white"
                        onLoad={() => {
                            setContentReady(true);
                            setLoadError(null);
                            setStatus({ state: 'online' });
                        }}
                        onError={() => {
                            setContentReady(false);
                            setLoadError('MarkItDownUI failed to load in the embedded frame.');
                            setStatus({ state: 'offline' });
                        }}
                    />
                )
            )}
        </div>
    );
}
