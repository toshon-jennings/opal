import React, { useEffect, useState } from 'react';
import { ChevronRight, Brain, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function ThinkingDisplay({ thinking, tokens, duration, isStreaming = false }) {
    const [isExpanded, setIsExpanded] = useState(Boolean(isStreaming));

    useEffect(() => {
        if (isStreaming && thinking) {
            setIsExpanded(true);
        }
    }, [isStreaming, thinking]);

    if (!thinking && !isStreaming) return null;

    const displayCount = tokens || thinking?.length || 0;
    const countLabel = tokens ? `${tokens} tokens` : `${displayCount} chars`;

    const formatDuration = (ms) => {
        if (!ms) return null;
        return `${(ms / 1000).toFixed(1)}s`;
    };

    const handleToggle = () => setIsExpanded(v => !v);
    const handleKeyDown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleToggle(); }
    };

    return (
        <div className="thinking-container mb-3 rounded-xl overflow-hidden"
            style={{
                background: 'var(--opal-gradient-subtle)',
                border: '1px solid rgba(var(--accent-rgb), 0.18)',
            }}>
            <button
                onClick={handleToggle}
                onKeyDown={handleKeyDown}
                className="thinking-header w-full flex items-center gap-2.5 p-3 text-left group transition-all duration-200"
                style={{ background: 'transparent' }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(var(--accent-rgb), 0.06)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? 'Hide thinking process' : 'Show thinking process'}
                disabled={isStreaming && !thinking}
            >
                <motion.div
                    animate={{ rotate: isExpanded ? 90 : 0 }}
                    transition={{ duration: 0.18, ease: 'easeInOut' }}
                    className="shrink-0"
                >
                    <ChevronRight size={15} style={{ color: 'var(--accent)' }} />
                </motion.div>

                {isStreaming && !thinking ? (
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                        className="shrink-0"
                    >
                        <Sparkles size={14} style={{ color: 'var(--accent)' }} />
                    </motion.div>
                ) : (
                    <Brain size={14} className="shrink-0" style={{ color: 'var(--accent)' }} />
                )}

                <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'DM Sans, sans-serif' }}>
                        {isStreaming ? 'Reasoning live' : (isExpanded ? 'Hide reasoning' : 'Show reasoning')}
                    </span>
                    {!isExpanded && thinking && !isStreaming && (
                        <div className="text-xs truncate mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                            Click to expand
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                    {thinking && displayCount > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{
                                background: 'rgba(var(--accent-rgb), 0.12)',
                                color: 'var(--accent)',
                                border: '1px solid rgba(var(--accent-rgb), 0.2)',
                                fontFamily: 'JetBrains Mono, monospace',
                            }}>
                            {countLabel}
                        </span>
                    )}
                    {duration && (
                        <span className="text-xs tabular-nums" style={{ color: 'var(--text-tertiary)', fontFamily: 'JetBrains Mono, monospace' }}>
                            {formatDuration(duration)}
                        </span>
                    )}
                </div>
            </button>

            <AnimatePresence initial={false}>
                {isExpanded && thinking && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeInOut' }}
                        className="overflow-hidden"
                    >
                        <div className="p-4"
                            style={{
                                borderTop: '1px solid rgba(var(--accent-rgb), 0.12)',
                                background: 'rgba(var(--accent-rgb), 0.02)',
                            }}>
                            <div className="prose prose-sm max-w-none" style={{ color: 'var(--text-secondary)', fontFamily: 'DM Sans, sans-serif' }}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {thinking}
                                </ReactMarkdown>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}
