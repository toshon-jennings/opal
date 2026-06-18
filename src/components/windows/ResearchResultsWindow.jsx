import React from 'react';
import { useMode } from '../../context/ModeContext';
import { FileText, X, ExternalLink, Clock, Search } from 'lucide-react';

// Displays the results of a Deep Research run in a dedicated floating window.
// Data is passed via openResearchData() and includes the query, sources, and
// the final synthesized answer.
export default function ResearchResultsWindow() {
    const { researchData } = useMode();

    if (!researchData) {
        return (
            <div className="flex h-full items-center justify-center p-8 text-center text-[var(--text-tertiary)]">
                <div>
                    <Search size={32} className="mx-auto mb-3 opacity-40" />
                    <p className="text-sm">No research results to display.</p>
                    <p className="mt-1 text-xs">Run a Deep Research query in Chat to see results here.</p>
                </div>
            </div>
        );
    }

    const { query, answer, sources = [], elapsed, completedAt } = researchData;

    return (
        <div className="flex h-full flex-col bg-[var(--bg-primary)]">
            {/* Header */}
            <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-5 py-3">
                <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[rgba(var(--accent-rgb),0.10)] text-[var(--accent)]">
                        <FileText size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[var(--text-primary)]">
                            {query || 'Deep Research'}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
                            {completedAt && (
                                <span className="inline-flex items-center gap-1">
                                    <Clock size={10} />
                                    {new Date(completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                            {elapsed != null && (
                                <span>{Math.floor(elapsed / 1000)}s</span>
                            )}
                            <span>{sources.length} sources</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
                {answer && (
                    <div className="max-w-3xl mx-auto px-6 py-6">
                        <div className="prose prose-sm max-w-none text-[var(--text-primary)] leading-relaxed">
                            {answer.split('\n').map((line, i) => {
                                if (!line.trim()) return <br key={i} />;
                                if (line.startsWith('# ')) return <h1 key={i} className="text-xl font-semibold mb-3 mt-4" style={{ fontSize: '22px', fontWeight: 700 }}>{line.slice(2)}</h1>;
                                if (line.startsWith('## ')) return <h2 key={i} className="text-lg font-semibold mb-2 mt-3" style={{ fontSize: '18px', fontWeight: 600 }}>{line.slice(3)}</h2>;
                                if (line.startsWith('### ')) return <h3 key={i} className="text-base font-semibold mb-2 mt-2">{line.slice(4)}</h3>;
                                if (line.startsWith('- ') || line.startsWith('* ')) return <li key={i} className="ml-4 mb-1 list-disc">{line.slice(2)}</li>;
                                return <p key={i} className="mb-3 leading-7">{line}</p>;
                            })}
                        </div>
                    </div>
                )}

                {sources.length > 0 && (
                    <div className="max-w-3xl mx-auto px-6 pb-6">
                        <h3 className="text-sm font-semibold text-[var(--text-secondary)] mb-3 border-t border-[var(--border)] pt-4">
                            Sources ({sources.length})
                        </h3>
                        <div className="space-y-2">
                            {sources.map((source, i) => (
                                <div key={i} className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-[var(--bg-tertiary)] text-[10px] font-bold text-[var(--text-secondary)]">
                                        {i + 1}
                                    </span>
                                    <div className="min-w-0 flex-1">
                                        {source.url ? (
                                            <a
                                                href={source.url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="flex items-center gap-1 text-sm font-medium text-[var(--accent)] hover:underline"
                                            >
                                                <span className="truncate">{source.title || source.url}</span>
                                                <ExternalLink size={12} className="shrink-0" />
                                            </a>
                                        ) : (
                                            <span className="text-sm font-medium text-[var(--text-primary)]">{source.title || 'Untitled'}</span>
                                        )}
                                        {source.snippet && (
                                            <p className="mt-1 text-xs text-[var(--text-tertiary)] line-clamp-2">{source.snippet}</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
