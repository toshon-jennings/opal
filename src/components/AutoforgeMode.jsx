import { useCallback, useEffect, useRef, useState } from 'react';
import { Play, Square, RefreshCw, ExternalLink, ChevronRight, Lightbulb, Terminal, Settings, Zap, Loader } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import autoforgeLogo from '../assets/autoforge-logo.png';

const AUTOFORGE_DEFAULT_PORT = 8888;

const HINTS = [
    { icon: Play, label: 'Start', desc: 'Run `autoforge` to launch the server on port 8888' },
    { icon: Settings, label: 'Config', desc: '`autoforge config` opens settings in $EDITOR' },
    { icon: RefreshCw, label: 'Repair', desc: '`autoforge --repair` rebuilds the venv if broken' },
    { icon: Terminal, label: 'Port', desc: '`autoforge --port 9000` to use a custom port' },
    { icon: Zap, label: 'No browser', desc: '`autoforge --no-browser` starts headless' },
];

export default function AutoforgeMode() {
    const { isDarkMode } = useTheme();
    const [serverUrl, setServerUrl] = useState(null);
    const [status, setStatus] = useState('checking'); // checking | online | offline | starting
    const [showHints, setShowHints] = useState(true);
    const webviewRef = useRef(null);
    const pollRef = useRef(null);

    // ── Server detection ──────────────────────────────────────────
    // Primary: Electron IPC (uses Node http.get, bypasses CSP).
    // Fallback: HTTP fetch probes (for web / no-electron).

    const findServerViaIPC = useCallback(async () => {
        if (!window.electron?.autoforgeStatus) return null;
        try {
            const result = await window.electron.autoforgeStatus();
            if (result?.running && result?.url) return result.url;
        } catch { /* ignore */ }
        return null;
    }, []);

    const findServerViaFetch = useCallback(async () => {
        for (let port = AUTOFORGE_DEFAULT_PORT; port < AUTOFORGE_DEFAULT_PORT + 10; port++) {
            try {
                await fetch(`http://127.0.0.1:${port}/`, {
                    method: 'GET',
                    mode: 'no-cors',
                    signal: AbortSignal.timeout(1500),
                });
                return `http://127.0.0.1:${port}`;
            } catch {
                continue;
            }
        }
        return null;
    }, []);

    const findServer = useCallback(async () => {
        return await findServerViaIPC() || await findServerViaFetch();
    }, [findServerViaIPC, findServerViaFetch]);

    // ── Initial scan + periodic polling ────────────────────────────

    useEffect(() => {
        let alive = true;
        const poll = async () => {
            const url = await findServer();
            if (!alive) return;
            if (url) {
                setServerUrl(url);
                setStatus('online');
            } else if (status !== 'starting') {
                setStatus('offline');
                setServerUrl(null);
            }
        };
        poll();
        pollRef.current = setInterval(poll, 6000);
        return () => { alive = false; clearInterval(pollRef.current); };
    // We intentionally *don't* depend on `status` here — the poll should
    // run at a steady cadence regardless of state transitions. Including
    // `status` would restart the interval on every status change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [findServer]);

    // ── Start / Stop ───────────────────────────────────────────────

    const handleStart = useCallback(async () => {
        setStatus('starting');

        // If already running externally, just connect
        const existing = await findServer();
        if (existing) {
            setServerUrl(existing);
            setStatus('online');
            return;
        }

        // Try to start via Electron IPC
        if (window.electron?.autoforgeStart) {
            await window.electron.autoforgeStart();
        }

        // Fast-poll until the server responds or we time out
        let tries = 0;
        const fast = setInterval(async () => {
            tries++;
            const url = await findServer();
            if (url) {
                setServerUrl(url);
                setStatus('online');
                clearInterval(fast);
            } else if (tries > 40) {
                setStatus('offline');
                clearInterval(fast);
            }
        }, 1500);
    }, [findServer]);

    const handleStop = useCallback(async () => {
        if (window.electron?.autoforgeStop) {
            await window.electron.autoforgeStop();
        }
        setStatus('offline');
        setServerUrl(null);
    }, []);

    const handleReload = useCallback(() => {
        if (window.electron) {
            webviewRef.current?.reload();
        } else if (webviewRef.current) {
            const src = webviewRef.current.src;
            webviewRef.current.src = '';
            requestAnimationFrame(() => { webviewRef.current.src = src; });
        }
    }, []);

    // ── Styling helpers ────────────────────────────────────────────

    const bg = isDarkMode ? 'bg-[#0c0c0d]' : 'bg-[#f5f5f7]';
    const cardBg = isDarkMode ? 'bg-[#1a1a1e]' : 'bg-white';
    const borderColor = isDarkMode ? 'border-[#2a2a2e]' : 'border-[#e5e7eb]';
    const textPrimary = isDarkMode ? 'text-white' : 'text-[#1a1a1a]';
    const textSecondary = isDarkMode ? 'text-[#888]' : 'text-[#666]';
    const accentBg = isDarkMode ? 'bg-orange-500/10' : 'bg-orange-50';
    const accentText = 'text-orange-500';

    // ── Render ─────────────────────────────────────────────────────

    return (
        <div className={`flex h-full w-full ${bg}`}>
            {/* Hints sidebar */}
            {showHints && (
                <div className={`w-64 flex-shrink-0 border-r ${borderColor} flex flex-col overflow-y-auto ${cardBg}`}>
                    <div className="p-4 border-b border-[var(--border)]">
                        <div className="flex items-center gap-2.5 mb-1">
                            <img src={autoforgeLogo} alt="" className="w-7 h-7 rounded" />
                            <div>
                                <h2 className={`text-sm font-semibold ${textPrimary}`}>AutoForge</h2>
                                <p className={`text-[10px] ${textSecondary}`}>Autonomous coding agent</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-4 border-b border-[var(--border)]">
                        <div className="flex items-center justify-between mb-2">
                            <span className={`text-[11px] uppercase tracking-wider ${textSecondary}`}>Status</span>
                            <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                                status === 'online' ? 'text-emerald-400' :
                                status === 'starting' || status === 'checking' ? 'text-amber-400' : 'text-red-400'
                            }`}>
                                {status === 'starting' || status === 'checking' ? (
                                    <Loader size={10} className="animate-spin" />
                                ) : (
                                    <span className={`w-1.5 h-1.5 rounded-full ${
                                        status === 'online' ? 'bg-emerald-400' : 'bg-red-400'
                                    }`} />
                                )}
                                {status === 'online' ? 'Running' : status === 'starting' ? 'Starting...' : status === 'checking' ? 'Checking...' : 'Offline'}
                            </span>
                        </div>
                        <div className="flex gap-2">
                            {status === 'online' ? (
                                <button onClick={handleStop} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors">
                                    <Square size={12} />Stop
                                </button>
                            ) : (
                                <button onClick={handleStart} disabled={status === 'starting'} className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors disabled:opacity-50">
                                    {status === 'starting' ? <><Loader size={12} className="animate-spin" />Starting...</> : <><Play size={12} />Start</>}
                                </button>
                            )}
                            {serverUrl && (
                                <button onClick={() => window.open(serverUrl, '_blank')} className="inline-flex items-center justify-center p-1.5 rounded-lg text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] border border-[var(--border)] transition-colors" title="Open in browser">
                                    <ExternalLink size={12} />
                                </button>
                            )}
                        </div>
                        {serverUrl && <p className={`mt-2 text-[10px] font-mono ${textSecondary} truncate`}>{serverUrl}</p>}
                    </div>

                    <div className="p-4 border-b border-[var(--border)]">
                        <div className="flex items-center gap-1.5 mb-3">
                            <Lightbulb size={13} className={accentText} />
                            <span className={`text-[11px] uppercase tracking-wider font-medium ${accentText}`}>Quick Reference</span>
                        </div>
                        <div className="space-y-2.5">
                            {HINTS.map(({ icon: HintIcon, label, desc }) => (
                                <div key={label} className="flex gap-2.5">
                                    <span className={`flex-shrink-0 w-5 h-5 rounded flex items-center justify-center ${accentBg}`}>
                                        <HintIcon size={11} className={accentText} />
                                    </span>
                                    <div className="min-w-0">
                                        <p className={`text-xs font-medium ${textPrimary}`}>{label}</p>
                                        <p className={`text-[10px] font-mono leading-tight ${textSecondary}`}>{desc}</p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="p-4">
                        <p className={`text-[11px] uppercase tracking-wider font-medium ${textSecondary} mb-2`}>Tips</p>
                        <ul className={`space-y-1.5 text-[11px] ${textSecondary}`}>
                            <li className="flex gap-1.5"><ChevronRight size={12} className="flex-shrink-0 mt-0.5 text-orange-500/50" /><span>Config lives at <code className="font-mono text-[10px]">~/.autoforge/</code></span></li>
                            <li className="flex gap-1.5"><ChevronRight size={12} className="flex-shrink-0 mt-0.5 text-orange-500/50" /><span>Supports Claude, Ollama, Vertex AI, and z.ai</span></li>
                            <li className="flex gap-1.5"><ChevronRight size={12} className="flex-shrink-0 mt-0.5 text-orange-500/50" /><span>Ctrl+C in terminal to stop the server</span></li>
                            <li className="flex gap-1.5"><ChevronRight size={12} className="flex-shrink-0 mt-0.5 text-orange-500/50" /><span>Web UI opens automatically on launch</span></li>
                        </ul>
                    </div>
                </div>
            )}

            {!showHints && (
                <button onClick={() => setShowHints(true)} className={`absolute top-3 left-3 z-10 p-2 rounded-lg ${cardBg} border ${borderColor} shadow-lg transition-colors hover:bg-[var(--bg-hover)]`} title="Show hints">
                    <Lightbulb size={14} className={accentText} />
                </button>
            )}

            <div className="flex-1 min-w-0 flex flex-col relative">
                <div className={`flex items-center gap-2 px-3 py-2 border-b ${borderColor} ${cardBg}`}>
                    <button onClick={() => setShowHints(v => !v)} className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors" title={showHints ? 'Hide hints' : 'Show hints'}>
                        <Lightbulb size={14} />
                    </button>
                    {status === 'online' && (
                        <button onClick={handleReload} className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors" title="Reload">
                            <RefreshCw size={14} />
                        </button>
                    )}
                    <div className="flex-1" />
                    <span className={`text-[10px] font-mono ${textSecondary}`}>{serverUrl || 'localhost:8888'}</span>
                </div>

                {status === 'online' && serverUrl ? (
                    window.electron ? (
                        <webview
                            ref={webviewRef}
                            src={serverUrl}
                            className="flex-1 min-h-0 w-full border-0 bg-white"
                            partition="persist:perci-autoforge"
                            allowpopups="true"
                        />
                    ) : (
                        <iframe
                            ref={webviewRef}
                            src={serverUrl}
                            className="flex-1 min-h-0 w-full border-0 bg-white"
                            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                            title="AutoForge"
                        />
                    )
                ) : (
                    <div className="flex-1 min-h-0 flex items-center justify-center p-8">
                        <div className="max-w-sm text-center">
                            <div className={`mx-auto mb-4 w-14 h-14 rounded-xl ${cardBg} border ${borderColor} flex items-center justify-center shadow-sm`}>
                                {status === 'starting' || status === 'checking' ? (
                                    <Loader size={24} className="text-orange-500 animate-spin" />
                                ) : (
                                    <img src={autoforgeLogo} alt="" className="w-9 h-9 rounded" />
                                )}
                            </div>
                            <h2 className={`text-base font-semibold ${textPrimary} mb-1.5`}>
                                {status === 'starting' ? 'Starting AutoForge...' :
                                 status === 'checking' ? 'Looking for AutoForge...' :
                                 'AutoForge is not running'}
                            </h2>
                            <p className={`text-sm ${textSecondary} mb-4`}>
                                {status === 'starting' ? 'Waiting for the server to respond...' :
                                 status === 'checking' ? 'Checking if the server is already running on localhost...' :
                                 'Start the server to begin building apps autonomously.'}
                            </p>
                            {status === 'offline' && (
                                <button onClick={handleStart} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-orange-500 text-white hover:bg-orange-600 transition-colors shadow-sm">
                                    <Play size={16} />Start AutoForge
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
