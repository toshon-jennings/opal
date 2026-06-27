import React, { useCallback, useRef, useState } from 'react';
import {
    AlertCircle,
    ExternalLink,
    Loader2,
    RefreshCw,
    Mail,
} from 'lucide-react';

const AGENTMAIL_URL = 'https://console.agentmail.to/dashboard/overview';

const INDIGO = '#6366f1';

export default function AgentMailMode() {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const webviewRef = useRef(null);

    const handleLoadStart = useCallback(() => {
        setLoading(true);
        setError('');
    }, []);

    const handleLoadStop = useCallback(() => {
        setLoading(false);
    }, []);

    const handleLoadFailed = useCallback((event) => {
        setLoading(false);
        if (event.errorCode !== -3) { // -3 = ABORTED (user navigated away)
            setError(`Failed to load AgentMail: ${event.errorDescription || 'Unknown error'}`);
        }
    }, []);

    const handleRefresh = useCallback(() => {
        if (webviewRef.current) {
            webviewRef.current.reload();
        }
    }, []);

    const handleOpenInBrowser = useCallback(() => {
        window.electron?.openExternal?.(AGENTMAIL_URL);
    }, []);

    if (error) {
        return (
            <div className="h items-center justify-center p-8">
                <div className="max-w-md text-center">
                    <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-red-500/30 bg-red-500/10 flex items-center justify-center">
                        <AlertCircle size={22} className="text-red-400" />
                    </div>
                    <h2 className="text-lg font-semibold">AgentMail could not load</h2>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">{error}</p>
                    <div className="mt-4 flex items-center justify-center gap-3">
                        <button
                            type="button"
                            onClick={handleRefresh}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
                        >
                            <RefreshCw size={14} />
                            Retry
                        </button>
                        <button
                            type="button"
                            onClick={handleOpenInBrowser}
                            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--text-secondary)] text-sm font-medium hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                        >
                            <ExternalLink size={14} />
                            Open in browser
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full flex flex-col">
            {/* Minimal toolbar — no address bar, just utility buttons */}
            <div className="flex items-center gap-2 px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg-secondary)]">
                <div className="flex items-center gap-2 flex-1">
                    <Mail size={14} style={{ color: INDIGO }} />
                    <span className="text-xs font-medium text-[var(--text-secondary)]">AgentMail</span>
                    {loading && <Loader2 size={12} className="animate-spin text-[var(--text-secondary)]" />}
                </div>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        onClick={handleRefresh}
                        disabled={loading}
                        className="p-1.5 rounded-md hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] disabled:opacity-50 transition-colors"
                        title="Reload"
                    >
                        <RefreshCw size={13} />
                    </button>
                    <button
                        type="button"
                        onClick={handleOpenInBrowser}
                        className="p-1.5 rounded-md hover:bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors"
                        title="Open in browser"
                    >
                        <ExternalLink size={13} />
                    </button>
                </div>
            </div>

            {/* Embedded AgentMail web console */}
            <div className="flex-1 relative">
                <webview
                    ref={webviewRef}
                    src={AGENTMAIL_URL}
                    title="AgentMail"
                    className="absolute inset-0 w-full h-full"
                    partition="persist:perci-agentmail"
                    allowpopups="true"
                    webpreferences="contextIsolation=true, nodeIntegration=false, sandbox=false"
                    onLoadStart={handleLoadStart}
                    onLoadStop={handleLoadStop}
                    onDidFailLoad={handleLoadFailed}
                />
            </div>
        </div>
    );
}
