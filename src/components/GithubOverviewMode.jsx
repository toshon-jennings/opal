import { useCallback, useRef } from 'react';
import { RefreshCw, ExternalLink } from 'lucide-react';

const GH_ORIGIN = 'http://127.0.0.1:6282';

export default function GithubOverviewMode() {
    const webviewRef = useRef(null);
    const frameKey = useRef(0);

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

            {window.electron ? (
                <webview
                    ref={webviewRef}
                    key={frameKey.current}
                    src={GH_ORIGIN}
                    className="flex-1 min-h-0 w-full border-0 bg-white"
                    partition="persist:perci-github-overview"
                    allowpopups="true"
                />
            ) : (
                <iframe
                    ref={webviewRef}
                    key={frameKey.current}
                    src={GH_ORIGIN}
                    className="flex-1 min-h-0 w-full border-0 bg-white"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    title="GitHub Overview"
                />
            )}
        </div>
    );
}