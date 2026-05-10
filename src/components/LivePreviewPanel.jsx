import { ExternalLink, Globe, RefreshCw } from 'lucide-react';

export default function LivePreviewPanel({ previewUrl = '', onRefresh, title = 'Preview' }) {
    return (
        <aside className="hidden xl:flex h-full w-[520px] min-w-[420px] max-w-[48vw] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-primary)]">
            <div className="flex h-12 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)]/40 px-4">
                <div className="flex min-w-0 items-center gap-2">
                    <Globe size={14} className="shrink-0 text-[var(--accent)]" />
                    <span className="truncate text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{title}</span>
                </div>
                <div className="flex items-center gap-1">
                    {previewUrl && (
                        <button
                            type="button"
                            onClick={onRefresh}
                            className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            title="Refresh preview"
                        >
                            <RefreshCw size={14} />
                        </button>
                    )}
                    {previewUrl && (
                        <a
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            title="Open preview"
                        >
                            <ExternalLink size={14} />
                        </a>
                    )}
                </div>
            </div>
            <div className="relative flex-1 bg-white">
                {previewUrl ? (
                    <iframe
                        key={previewUrl}
                        src={previewUrl}
                        title="Live preview"
                        className="h-full w-full border-0"
                        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    />
                ) : (
                    <div className="absolute inset-0 bg-[var(--bg-primary)]" />
                )}
            </div>
        </aside>
    );
}
