import React, { useState } from 'react';
import { Search, ChevronDown, ChevronUp, CheckCircle, Loader2, Globe } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ChatGPT-style collapsible search progress component
 * Shows "Searching the web..." with expandable progress details
 */
export function SearchProgress({
    isSearching,
    searchSteps = [],
    totalSources = 0,
    currentQuery = '',
    onComplete
}) {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!isSearching && searchSteps.length === 0) return null;

    const isComplete = !isSearching && searchSteps.length > 0;

    return (
        <div className="search-progress-container my-3">
            {/* Main collapsible button */}
            <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full transition-all duration-300 ease-out hover:shadow-md hover:scale-[1.02] cursor-pointer select-none"
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
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: 'easeOut' }}
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
