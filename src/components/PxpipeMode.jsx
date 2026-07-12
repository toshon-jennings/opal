import { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw, ExternalLink, Terminal, Download } from 'lucide-react';
import { PXPIPE_ORIGIN, checkPxpipeAlive } from '../lib/pxpipe';

export default function PxpipeMode() {
    const [alive, setAlive] = useState(null); // null=checking, true=alive, false=missing
    const webviewRef = useRef(null);
    const frameKey = useRef(0);

    // Single on-mount check — no polling, no spinner state
    useEffect(() => {
        let cancelled = false;
        (async () => {
            const isAlive = await checkPxpipeAlive();
            if (!cancelled) setAlive(isAlive);
        })();
        return () => { cancelled = true; };
    }, []);

    const handleReload = useCallback(() => {
        frameKey.current += 1;
        if (window.electron) {
            webviewRef.current?.reload();
        } else if (webviewRef.current) {
            const src = webviewRef.current.src;
            webviewRef.current.src = '';
            requestAnimationFrame(() => { webviewRef.current.src = src; });
        }
    }, []);

    const installCmds = [
        'npm install -g pxpipe',
        'npx pxpipe',
    ];

    // ── Checking state — brief, auto-resolves ──────────────────────

    if (alive === null) {
        return (
            <div className="h-full w-full flex items-center justify-center p-8 bg-[var(--bg-primary)]">
                <div className="text-sm text-[var(--text-secondary)] animate-pulse">
                    Detecting pxpipe on {PXPIPE_ORIGIN}…
                </div>
            </div>
        );
    }

    // ── Running — show the webview with address bar ─────────────────

    if (alive) {
        return (
            <div className="h-full w-full flex flex-col">
                <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] bg-[var(--bg-primary)] shrink-0">
                    <button
                        onClick={handleReload}
                        className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                        title="Reload"
                    >
                        <RefreshCw size={14} />
                    </button>
                    <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-xs font-mono text-[var(--text-secondary)]">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                        {PXPIPE_ORIGIN}
                    </div>
                    {window.electron?.openExternal && (
                        <button
                            onClick={() => window.electron.openExternal(PXPIPE_ORIGIN)}
                            className="p-1 rounded text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                            title="Open in browser"
                        >
                            <ExternalLink size={14} />
                        </button>
                    )}
                </div>

                {window.electron ? (
                    <webview
                        ref={webviewRef}
                        key={frameKey.current}
                        src={PXPIPE_ORIGIN}
                        className="flex-1 min-h-0 w-full border-0 bg-white"
                        partition="persist:perci-pxpipe"
                        allowpopups="true"
                    />
                ) : (
                    <iframe
                        ref={webviewRef}
                        key={frameKey.current}
                        src={PXPIPE_ORIGIN}
                        className="flex-1 min-h-0 w-full border-0 bg-white"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                        title="pxpipe"
                    />
                )}
            </div>
        );
    }

    // ── Not detected — install guide ───────────────────────────────

    return (
        <div className="h-full w-full flex items-center justify-center p-8 bg-[var(--bg-primary)]">
            <div className="max-w-md text-center space-y-5">
                <div className="mx-auto w-14 h-14 rounded-xl bg-[var(--bg-tertiary)] border border-[var(--border)] flex items-center justify-center shadow-sm">
                    <Terminal size={24} className="text-[var(--text-tertiary)]" />
                </div>

                <div>
                    <h2 className="text-base font-semibold text-[var(--text-primary)] mb-1">
                        pxpipe not detected
                    </h2>
                    <p className="text-sm text-[var(--text-secondary)]">
                        pxpipe is a local token-compression proxy that converts bulky LLM context into compressed PNG images before it leaves your machine, cutting input tokens.
                    </p>
                </div>

                <div className="text-left space-y-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)]/30 p-4">
                    <p className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                        Install & run
                    </p>
                    <div className="space-y-2">
                        <div className="flex items-center gap-2.5">
                            <span className="text-xs text-[var(--text-tertiary)] font-mono w-5 shrink-0">1.</span>
                            <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-xs font-mono text-[var(--text-primary)] break-all">
                                npm install -g pxpipe
                            </code>
                        </div>
                        <div className="flex items-center gap-2.5">
                            <span className="text-xs text-[var(--text-tertiary)] font-mono w-5 shrink-0">2.</span>
                            <code className="flex-1 px-2.5 py-1.5 rounded-lg bg-[var(--bg-tertiary)] text-xs font-mono text-[var(--text-primary)] break-all">
                                pxpipe
                            </code>
                        </div>
                    </div>
                    <p className="text-[11px] text-[var(--text-tertiary)] leading-relaxed">
                        This starts the proxy on port 47821. It also installs a LaunchAgent so it starts automatically on login.
                    </p>
                </div>

                <div className="flex flex-col items-center gap-2">
                    <a
                        href="https://github.com/teamchong/pxpipe"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs text-[var(--accent)] hover:underline"
                    >
                        <ExternalLink size={12} />
                        View on GitHub
                    </a>
                    <button
                        onClick={() => setAlive(null)}
                        className="inline-flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                    >
                        <RefreshCw size={12} />
                        Check again
                    </button>
                </div>
            </div>
        </div>
    );
}