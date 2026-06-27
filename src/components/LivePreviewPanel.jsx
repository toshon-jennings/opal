import { ExternalLink, Globe, RefreshCw } from 'lucide-react';

export default function LivePreviewPanel({ previewUrl = '', onRefresh, title = 'Preview' }) {
    const hasPreview = Boolean(previewUrl);

    return (
        <aside
            className={`layout-transition hidden xl:flex h-full shrink-0 flex-col border-l border-[var(--border)] bg-[var(--bg-primary)] ${
                hasPreview ? 'w-[520px] min-w-[420px] max-w-[48vw]' : 'w-[4rem] min-w-[4rem] max-w-[4rem]'
            }`}
        >
            <div className={`flex h-12 items-center border-b border-[var(--border)] bg-[var(--bg-secondary)]/40 ${hasPreview ? 'justify-between px-4' : 'justify-center px-2'}`}>
                <div className="flex min-w-0 items-center gap-2">
                    <Globe size={14} className="shrink-0 text-[var(--accent)]" />
                    {hasPreview && (
                        <span className="truncate text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">{title}</span>
                    )}
                </div>
                {hasPreview && (
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={onRefresh}
                            className="micro-interaction rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            title="Refresh preview"
                        >
                            <RefreshCw size={14} />
                        </button>
                        <a
                            href={previewUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="micro-interaction rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                            title="Open preview"
                        >
                            <ExternalLink size={14} />
                        </a>
                    </div>
                )}
            </div>
            <div className={`relative flex-1 ${hasPreview ? 'bg-white' : 'bg-[var(--bg-secondary)]/20'}`}>
                {hasPreview ? (
                    <iframe
                        key={previewUrl}
                        src={previewUrl}
                        title="Live preview"
                        className="h-full w-full border-0"
                        sandbox=""
                        referrerPolicy="no-referrer"
                    />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span
                            className="select-none text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--text-tertiary)]"
                            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
                        >
                            Preview
                        </span>
                    </div>
                )}
            </div>
        </aside>
    );
}
