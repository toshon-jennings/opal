import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ExternalLink, ShieldAlert, ShieldCheck, Play, Loader2 } from 'lucide-react';
import keysafeLogo from '../assets/keysafe-logo.jpeg';
import './KeysafeMode.css';

const KEYSAFE_ORIGIN = 'http://localhost:4100';

export default function KeysafeMode() {
    const [status, setStatus] = useState('checking'); // checking | running | offline | starting
    const webviewRef = useRef(null);
    const [frameKey, setFrameKey] = useState(0);
    const pollIntervalRef = useRef(null);

    const checkAlive = useCallback(async () => {
        try {
            await fetch(`${KEYSAFE_ORIGIN}/`, {
                mode: 'no-cors',
                cache: 'no-store',
                signal: AbortSignal.timeout(1500),
            });
            return true;
        } catch {
            return false;
        }
    }, []);

    const startPolling = useCallback(() => {
        if (pollIntervalRef.current) return;
        pollIntervalRef.current = setInterval(async () => {
            const isAlive = await checkAlive();
            if (isAlive) {
                setStatus('running');
                if (pollIntervalRef.current) {
                    clearInterval(pollIntervalRef.current);
                    pollIntervalRef.current = null;
                }
            }
        }, 1500);
    }, [checkAlive]);

    const stopPolling = useCallback(() => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
    }, []);

    // Initial check
    useEffect(() => {
        let active = true;
        (async () => {
            const isAlive = await checkAlive();
            if (!active) return;
            if (isAlive) {
                setStatus('running');
            } else {
                setStatus('offline');
            }
        })();
        return () => {
            active = false;
            stopPolling();
        };
    }, [checkAlive, stopPolling]);

    const handleLaunch = useCallback(async () => {
        if (!window.electron?.localhostStartNow) return;
        setStatus('starting');
        try {
            await window.electron.localhostStartNow({
                cwd: '~/keysafe',
                command: 'npm run dev',
            });
            startPolling();
        } catch (err) {
            console.error('[KeySafe] Failed to auto-start server:', err);
            setStatus('offline');
        }
    }, [startPolling]);

    const handleReload = useCallback(() => {
        setFrameKey((prev) => prev + 1);
        if (window.electron && webviewRef.current) {
            webviewRef.current.reload();
        }
    }, []);

    const handleOpenExternal = useCallback(() => {
        if (window.electron?.openExternal) {
            window.electron.openExternal(KEYSAFE_ORIGIN);
        }
    }, []);

    // ── 1. Checking state ───────────────────────────────────────────
    if (status === 'checking') {
        return (
            <div className="keysafe-status-container">
                <div className="keysafe-status-card">
                    <Loader2 size={32} className="keysafe-spinner animate-spin text-[var(--accent)]" />
                    <p className="keysafe-status-text">Detecting KeySafe service...</p>
                </div>
            </div>
        );
    }

    // ── 2. Starting state ───────────────────────────────────────────
    if (status === 'starting') {
        return (
            <div className="keysafe-status-container">
                <div className="keysafe-status-card">
                    <Loader2 size={32} className="keysafe-spinner animate-spin text-[var(--accent)]" />
                    <p className="keysafe-status-text">Starting local KeySafe dev server...</p>
                    <p className="keysafe-status-subtext">Waiting for http://localhost:4100 to respond.</p>
                </div>
            </div>
        );
    }

    // ── 3. Offline / Setup state ────────────────────────────────────
    if (status === 'offline') {
        return (
            <div className="keysafe-status-container">
                <div className="keysafe-offline-card">
                    <div className="keysafe-logo-ring">
                        <img src={keysafeLogo} alt="KeySafe Logo" className="keysafe-hero-logo" />
                    </div>

                    <div className="keysafe-header-group">
                        <h2 className="keysafe-offline-title">KeySafe is Offline</h2>
                        <p className="keysafe-offline-desc">
                            KeySafe is a local-first, serverless credential manager. All your credentials, custom tags, and screenshot data are stored securely on your local device in IndexedDB.
                        </p>
                    </div>

                    <div className="keysafe-badge-group">
                        <span className="keysafe-status-badge offline">
                            <ShieldAlert size={12} />
                            Offline
                        </span>
                    </div>

                    <div className="keysafe-instructions">
                        <p className="keysafe-instruction-title">Start Local Server</p>
                        <p className="keysafe-instruction-body">
                            Perci can automatically launch the KeySafe Vite dev server in the background, or you can run it manually from the terminal.
                        </p>
                        <div className="keysafe-command-box">
                            <code>cd ~/keysafe && npm run dev</code>
                        </div>
                    </div>

                    <div className="keysafe-actions-group">
                        <button
                            type="button"
                            onClick={handleLaunch}
                            className="keysafe-btn keysafe-btn-primary"
                        >
                            <Play size={14} fill="currentColor" />
                            Launch KeySafe Server
                        </button>

                        <button
                            type="button"
                            onClick={async () => {
                                setStatus('checking');
                                const isAlive = await checkAlive();
                                setStatus(isAlive ? 'running' : 'offline');
                            }}
                            className="keysafe-btn keysafe-btn-secondary"
                        >
                            <RefreshCw size={14} />
                            Retry Check
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── 4. Running/WebView state ────────────────────────────────────
    return (
        <div className="keysafe-window-root">
            <div className="keysafe-nav-bar">
                <button
                    type="button"
                    onClick={handleReload}
                    className="keysafe-nav-btn"
                    title="Reload KeySafe"
                >
                    <RefreshCw size={14} />
                </button>

                <div className="keysafe-address-bar">
                    <span className="keysafe-live-dot" />
                    <span className="keysafe-url-text">{KEYSAFE_ORIGIN}</span>
                </div>

                <button
                    type="button"
                    onClick={handleOpenExternal}
                    className="keysafe-nav-btn"
                    title="Open in external browser"
                >
                    <ExternalLink size={14} />
                </button>
            </div>

            {window.electron ? (
                <webview
                    ref={webviewRef}
                    key={frameKey}
                    src={KEYSAFE_ORIGIN}
                    className="keysafe-webview"
                    partition="persist:perci-keysafe"
                    allowpopups="true"
                />
            ) : (
                <iframe
                    ref={webviewRef}
                    key={frameKey}
                    src={KEYSAFE_ORIGIN}
                    className="keysafe-webview"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    title="KeySafe"
                />
            )}
        </div>
    );
}
