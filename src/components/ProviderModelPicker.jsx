import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Monitor, Search, X } from 'lucide-react';

const PROVIDER_LABELS = {
    openrouter: 'OpenRouter',
    anthropic: 'Anthropic',
    mistral: 'Mistral',
    groq: 'Groq',
    openai: 'OpenAI',
    gemini: 'Gemini',
    ollama: 'Ollama',
    lmstudio: 'LM Studio',
    jan: 'Jan'
};

function getProviderLabel(provider) {
    return PROVIDER_LABELS[provider] || provider;
}

export function ProviderModelPicker({
    selectedProvider,
    selectedModel,
    availableModels,
    updateProvider,
    updateModel,
    showIcon = false,
    buttonClassName = '',
    labelClassName = 'text-sm',
    iconSize = 13,
    title = 'Select model',
    dropdownWidthClassName = 'w-72',
    overlayClassName = 'fixed inset-0 z-10',
    panelClassName = 'absolute bottom-full right-0 mb-2 z-20',
    positionMode = 'absolute'
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedProvider, setExpandedProvider] = useState(null);
    const [dropdownStyle, setDropdownStyle] = useState({});
    const [searchQuery, setSearchQuery] = useState('');
    const buttonRef = useRef(null);
    const searchRef = useRef(null);

    const providerEntries = useMemo(
        () => Object.entries(availableModels).filter(([, models]) => Array.isArray(models) && models.length > 0),
        [availableModels]
    );

    const currentModelName = availableModels[selectedProvider]?.find(model => model.id === selectedModel)?.name || 'Select model';

    // Filtered entries based on search query
    const filteredEntries = useMemo(() => {
        const q = searchQuery.trim().toLowerCase();
        if (!q) return providerEntries;
        return providerEntries
            .map(([provider, models]) => {
                const providerLabel = getProviderLabel(provider).toLowerCase();
                const matchingModels = models.filter(
                    m => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || providerLabel.includes(q)
                );
                return [provider, matchingModels];
            })
            .filter(([, models]) => models.length > 0);
    }, [providerEntries, searchQuery]);

    const isSearching = searchQuery.trim().length > 0;

    useEffect(() => {
        if (!isOpen) {
            setSearchQuery('');
            return;
        }
        const hasSelectedProvider = providerEntries.some(([provider]) => provider == selectedProvider);
        setExpandedProvider(hasSelectedProvider ? selectedProvider : (providerEntries[0]?.[0] || null));
        // Focus search on open
        setTimeout(() => searchRef.current?.focus(), 50);
    }, [isOpen, providerEntries, selectedProvider]);

    // When searching, auto-expand all matching providers
    useEffect(() => {
        if (isSearching && filteredEntries.length > 0) {
            // Expand first matching provider automatically; user can still click to collapse
            setExpandedProvider(filteredEntries[0][0]);
        } else if (!isSearching) {
            const hasSelectedProvider = providerEntries.some(([provider]) => provider == selectedProvider);
            setExpandedProvider(hasSelectedProvider ? selectedProvider : (providerEntries[0]?.[0] || null));
        }
    }, [isSearching, filteredEntries]);

    const toggleOpen = () => {
        const nextOpen = !isOpen;
        if (nextOpen && positionMode === 'fixed' && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const spaceAbove = rect.top;
            const dropHeight = 360;
            if (spaceAbove >= dropHeight) {
                setDropdownStyle({
                    bottom: window.innerHeight - rect.top + 8,
                    right: window.innerWidth - rect.right
                });
            } else {
                setDropdownStyle({
                    top: rect.bottom + 8,
                    right: window.innerWidth - rect.right
                });
            }
        }
        setIsOpen(nextOpen);
    };

    const handleProviderClick = (provider) => {
        setExpandedProvider(current => current === provider ? null : provider);
        if (selectedProvider !== provider) {
            updateProvider(provider);
        }
    };

    const handleModelClick = (provider, modelId) => {
        if (selectedProvider !== provider) {
            updateProvider(provider);
        }
        updateModel(modelId);
        setIsOpen(false);
    };

    return (
        <div className="relative">
            <button
                ref={buttonRef}
                type="button"
                onClick={toggleOpen}
                className={buttonClassName}
                title={title}
            >
                {showIcon && <Monitor size={iconSize} className="shrink-0" />}
                <span className={labelClassName}>{currentModelName}</span>
                <ChevronDown size={iconSize} className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
                <>
                    <div className={overlayClassName} onClick={() => setIsOpen(false)} />
                    <div
                        className={`${dropdownWidthClassName} bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl shadow-lg flex flex-col ${panelClassName}`}
                        style={positionMode === 'fixed' ? { ...dropdownStyle, maxHeight: '360px' } : { maxHeight: '360px' }}
                    >
                        {/* Search box */}
                        <div className="flex items-center gap-2 px-3 py-2 border-b border-[var(--border)] shrink-0">
                            <Search size={13} className="shrink-0 text-[var(--text-tertiary)]" />
                            <input
                                ref={searchRef}
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search models…"
                                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none min-w-0"
                                onClick={e => e.stopPropagation()}
                            />
                            {isSearching && (
                                <button
                                    type="button"
                                    onClick={() => setSearchQuery('')}
                                    className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                                >
                                    <X size={13} />
                                </button>
                            )}
                        </div>

                        {/* Provider/model list */}
                        <div className="overflow-y-auto flex-1">
                            {filteredEntries.length === 0 ? (
                                <div className="px-4 py-6 text-center text-sm text-[var(--text-tertiary)]">
                                    No models match "{searchQuery}"
                                </div>
                            ) : (
                                filteredEntries.map(([provider, models]) => {
                                    const isExpanded = isSearching || expandedProvider === provider;
                                    return (
                                        <div key={provider} className="border-b border-[var(--border)] last:border-b-0">
                                            <button
                                                type="button"
                                                onClick={() => handleProviderClick(provider)}
                                                className={`w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${selectedProvider === provider ? 'bg-[var(--accent)]/6 text-[var(--text-primary)]' : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                                            >
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium">{getProviderLabel(provider)}</div>
                                                    <div className="text-xs text-[var(--text-tertiary)]">
                                                        {isSearching
                                                            ? `${models.length} of ${availableModels[provider]?.length ?? models.length} models`
                                                            : `${models.length} models`}
                                                    </div>
                                                </div>
                                                <ChevronDown size={14} className={`shrink-0 text-[var(--text-tertiary)] transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                            </button>
                                            {isExpanded && (
                                                <div className="border-t border-[var(--border)] bg-[var(--bg-secondary)]/50">
                                                    {models.map(model => (
                                                        <button
                                                            type="button"
                                                            key={model.id}
                                                            onClick={() => handleModelClick(provider, model.id)}
                                                            className={`w-full px-4 py-2.5 text-left flex items-center justify-between gap-3 transition-colors ${model.id === selectedModel ? 'bg-[var(--accent)]/8 text-[var(--accent)]' : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                                                        >
                                                            <div className="min-w-0">
                                                                <div className="font-medium text-sm truncate">{model.name}</div>
                                                                {model.contextWindow && (
                                                                    <div className="text-xs text-[var(--text-tertiary)]">
                                                                        {(model.contextWindow / 1000).toFixed(0)}K tokens
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {model.id === selectedModel && <Check size={15} className="shrink-0" />}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}

