import React, { useEffect, useMemo, useState } from 'react';
import { Search, ChevronDown, ChevronUp, CheckCircle, Loader2, Globe, Sparkles, FileText, Timer, Network, Radio } from 'lucide-react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';

/**
 * ChatGPT-style collapsible search progress component
 * Shows "Searching the web..." with expandable progress details
 */
export function SearchProgress({
    isSearching,
    mode = 'web',
    searchSteps = [],
    totalSources = 0,
    currentQuery = '',
    onComplete
}) {
    const [isExpanded, setIsExpanded] = useState(false);
    const reduce = useReducedMotion();

    if (!isSearching && searchSteps.length === 0) return null;

    const isComplete = !isSearching && searchSteps.length > 0;

    if (mode === 'research') {
        return (
            <ResearchProgress
                isSearching={isSearching}
                searchSteps={searchSteps}
                totalSources={totalSources}
                currentQuery={currentQuery}
                isComplete={isComplete}
                reduce={reduce}
            />
        );
    }

    return (
        <div className="search-progress-container my-3 layout-transition">
            {/* Main collapsible button */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className={`micro-interaction inline-flex items-center gap-2 px-4 py-2.5 rounded-full transition-all duration-300 ease-out hover:shadow-md cursor-pointer select-none ${isSearching ? 'status-progress' : ''}`}
                style={isComplete
                    ? { background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', color: '#16a34a' }
                    : { background: 'var(--opal-gradient-subtle)', border: '1px solid rgba(var(--accent-rgb), 0.25)', color: 'var(--accent)' }
                }
            >
                {/* Icon */}
                {isComplete ? (
                    <CheckCircle size={16} className="text-green-500" />
                ) : (
                    <div className="relative">
                        <Globe size={16} className="animate-pulse" />
                        <div className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-blue-500 rounded-full animate-ping" />
                    </div>
                )}

                {/* Text */}
                <span className="text-sm font-medium">
                    {isComplete
                        ? `Searched ${searchSteps.length} ${searchSteps.length === 1 ? 'query' : 'queries'}`
                        : 'Searching the web...'
                    }
                </span>

                {/* Sources count badge */}
                {totalSources > 0 && (
                    <span className={`
                        px-2 py-0.5 rounded-full text-xs font-semibold
                        ${isComplete
                            ? 'bg-green-500/20 text-green-600 dark:text-green-400'
                            : 'bg-blue-500/20 text-blue-600 dark:text-blue-400'
                        }
                    `}>
                        {totalSources} sources
                    </span>
                )}

                {/* Expand/collapse chevron */}
                {isExpanded ? (
                    <ChevronUp size={14} className="ml-1" />
                ) : (
                    <ChevronDown size={14} className="ml-1" />
                )}
            </button>

            {/* Expandable details panel */}
            <AnimatePresence>
                {isExpanded && (
                    <motion.div
                        initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        transition={reduce ? { duration: 0.01 } : { duration: 0.2, ease: 'easeOut' }}
                        className="overflow-hidden"
                    >
                        <div className="mt-2 ml-2 pl-4 border-l-2 border-[var(--border)] space-y-2">
                            {searchSteps.map((step, index) => (
                                <SearchStepItem
                                    key={index}
                                    step={step}
                                    index={index + 1}
                                    isLast={index === searchSteps.length - 1}
                                    isCurrentlySearching={isSearching && index === searchSteps.length - 1}
                                />
                            ))}

                            {/* Show "searching..." for current query */}
                            {isSearching && currentQuery && (
                                <SearchStepItem
                                    step={{ query: currentQuery, status: 'searching' }}
                                    index={searchSteps.length + 1}
                                    isLast={true}
                                    isCurrentlySearching={true}
                                />
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
}

const RESEARCH_PHASES = [
    { id: 'decomposing', label: 'Plan', icon: Sparkles },
    { id: 'searching', label: 'Search', icon: Search },
    { id: 'reading', label: 'Read', icon: Network },
    { id: 'synthesizing', label: 'Write', icon: FileText },
];

function ResearchProgress({ isSearching, searchSteps, totalSources, currentQuery, isComplete, reduce }) {
    const [isExpanded, setIsExpanded] = useState(true);
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        if (!isSearching) return;
        const started = Date.now();
        const timer = setInterval(() => setElapsed(Date.now() - started), 1000);
        return () => clearInterval(timer);
    }, [isSearching]);

    const activePhase = useMemo(() => {
        const lastStatus = [...searchSteps].reverse().find(step => step.status || step.phase)?.status;
        if (lastStatus === 'synthesizing') return 'synthesizing';
        if (lastStatus === 'searching') return 'searching';
        if (lastStatus === 'reading') return 'reading';
        return isComplete ? 'synthesizing' : 'decomposing';
    }, [isComplete, searchSteps]);

    const activeIndex = Math.max(0, RESEARCH_PHASES.findIndex(phase => phase.id === activePhase));
    const query = currentQuery || searchSteps[0]?.query || 'Deep research';
    const searchCount = searchSteps.filter(step => step.status === 'searching' || step.phase === 'searching').length;
    const formattedElapsed = formatElapsed(elapsed);
    const visibleSteps = searchSteps.slice(-6);

    return (
        <motion.div
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={reduce ? { duration: 0.01 } : undefined}
            className="my-3 overflow-hidden rounded-2xl border border-[rgba(var(--accent-rgb),0.28)] bg-[linear-gradient(135deg,rgba(var(--accent-rgb),0.10),var(--bg-secondary))] shadow-[0_18px_48px_rgba(0,0,0,0.18)]"
        >
            <div className={`relative p-4 ${isSearching ? 'status-progress' : ''}`}>
                <div className="relative z-10 flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                        <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[rgba(var(--accent-rgb),0.28)] bg-[rgba(var(--accent-rgb),0.10)] text-[var(--accent)]">
                            {isComplete ? <CheckCircle size={20} /> : <Radio size={20} className="animate-pulse" />}
                            {isSearching && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--accent)] shadow-[0_0_18px_var(--accent)]" />}
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="text-sm font-semibold text-[var(--text-primary)]">
                                    {isComplete ? 'Deep research complete' : 'Deep research in progress'}
                                </div>
                                <span className="rounded-full border border-[rgba(var(--accent-rgb),0.22)] bg-[rgba(var(--accent-rgb),0.08)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                                    {activePhase}
                                </span>
                            </div>
                            <div className="mt-1 truncate text-sm text-[var(--text-secondary)]">
                                {query.replace(/^Researching:\s*/i, '')}
                            </div>
                        </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-[11px] text-[var(--text-tertiary)]">
                        <span className="inline-flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1">
                            <Timer size={12} /> {formattedElapsed}
                        </span>
                        <button
                            type="button"
                            onClick={() => setIsExpanded(value => !value)}
                            className="rounded-full border border-[var(--border)] bg-[var(--bg-primary)] p-1.5 text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
                            title={isExpanded ? 'Hide research details' : 'Show research details'}
                        >
                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        </button>
                    </div>
                </div>

                <div className="relative z-10 mt-4 grid grid-cols-4 gap-2">
                    {RESEARCH_PHASES.map((phase, index) => {
                        const Icon = phase.icon;
                        const isActive = index === activeIndex && isSearching;
                        const isDone = index < activeIndex || isComplete;
                        return (
                            <div
                                key={phase.id}
                                className={`rounded-xl border px-2.5 py-2 transition-all ${
                                    isActive
                                        ? 'border-[rgba(var(--accent-rgb),0.48)] bg-[rgba(var(--accent-rgb),0.12)] text-[var(--accent)]'
                                        : isDone
                                            ? 'border-green-500/25 bg-green-500/10 text-green-500'
                                            : 'border-[var(--border)] bg-[var(--bg-primary)] text-[var(--text-tertiary)]'
                                }`}
                            >
                                <div className="flex items-center gap-1.5">
                                    <Icon size={13} className={isActive ? 'animate-pulse' : ''} />
                                    <span className="text-[11px] font-medium">{phase.label}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="relative z-10 mt-4 grid grid-cols-3 gap-2 text-xs">
                    <Metric label="Queries" value={searchCount || searchSteps.length || 1} />
                    <Metric label="Sources" value={totalSources || 'finding'} />
                    <Metric label="Output" value={isComplete ? 'artifact ready' : 'report'} />
                </div>
            </div>

            <AnimatePresence initial={false}>
                {isExpanded && (
                    <motion.div
                        initial={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        transition={reduce ? { duration: 0.01 } : { duration: 0.22, ease: 'easeOut' }}
                        className="border-t border-[rgba(var(--accent-rgb),0.16)] bg-[var(--bg-primary)]"
                    >
                        <div className="space-y-2 p-4 pt-3">
                            <div className="flex items-center justify-between text-[11px] uppercase tracking-wide text-[var(--text-tertiary)]">
                                <span>Live investigation</span>
                                <span>{visibleSteps.length} recent events</span>
                            </div>
                            {visibleSteps.map((step, index) => (
                                <ResearchStepItem
                                    key={`${step.query || step.reason || index}-${index}`}
                                    step={step}
                                    isCurrent={isSearching && index === visibleSteps.length - 1}
                                />
                            ))}
                            {visibleSteps.length === 0 && (
                                <ResearchStepItem
                                    step={{ query, status: 'decomposing', reason: 'Preparing research plan' }}
                                    isCurrent={isSearching}
                                />
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </motion.div>
    );
}

function Metric({ label, value }) {
    return (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">{label}</div>
            <div className="mt-1 truncate font-mono text-[12px] text-[var(--text-primary)]">{value}</div>
        </div>
    );
}

function ResearchStepItem({ step, isCurrent }) {
    return (
        <div className="flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] p-2.5">
            <div className="mt-0.5">
                {isCurrent ? (
                    <Loader2 size={14} className="animate-spin text-[var(--accent)]" />
                ) : (
                    <CheckCircle size={14} className="text-green-500" />
                )}
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 text-sm text-[var(--text-primary)]">
                    <span className="truncate font-medium">{step.query || step.optimizedQuery || step.status || 'Research step'}</span>
                </div>
                {step.reason && (
                    <div className="mt-0.5 line-clamp-2 text-xs text-[var(--text-tertiary)]">{step.reason}</div>
                )}
            </div>
            {step.stepLabel && (
                <span className="shrink-0 rounded-full bg-[var(--bg-secondary)] px-2 py-0.5 font-mono text-[10px] text-[var(--text-tertiary)]">
                    {step.stepLabel}
                </span>
            )}
        </div>
    );
}

function formatElapsed(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = String(total % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
}

function SearchStepItem({ step, index, isLast, isCurrentlySearching }) {
    return (
        <div className={`
            flex items-start gap-2 py-1.5
            ${isCurrentlySearching ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)]'}
        `}>
            {/* Status icon */}
            <div className="mt-0.5">
                {isCurrentlySearching ? (
                    <Loader2 size={14} className="animate-spin text-blue-500" />
                ) : (
                    <CheckCircle size={14} className="text-green-500" />
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                    <Search size={12} className="text-[var(--text-tertiary)] shrink-0" />
                    <span className="text-sm truncate font-medium">
                        "{step.query || step.optimizedQuery}"
                    </span>
                </div>

                {step.sourcesFound !== undefined && (
                    <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                        Found {step.sourcesFound} sources
                    </div>
                )}

                {step.reason && !isCurrentlySearching && (
                    <div className="text-xs text-[var(--text-tertiary)] mt-0.5 italic">
                        {step.reason}
                    </div>
                )}
            </div>
        </div>
    );
}

export default SearchProgress;
