import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Monitor } from 'lucide-react';

const PROVIDER_LABELS = {
    openrouter: 'OpenRouter',
    anthropic: 'Anthropic',
    mistral: 'Mistral',
    groq: 'Groq',
    openai: 'OpenAI',
    gemini: 'Gemini',
    ollama: 'Ollama',
    lmstudio: 'LM Studio'
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
    panelClassName = 'absolute bottom-full right-0 mb-2 max-h-80 overflow-y-auto z-20',
    positionMode = 'absolute'
}) {
    const [isOpen, setIsOpen] = useState(false);
    const [expandedProvider, setExpandedProvider] = useState(null);
    const [dropdownStyle, setDropdownStyle] = useState({});
    const buttonRef = useRef(null);

    const providerEntries = useMemo(
        () => Object.entries(availableModels).filter(([, models]) => Array.isArray(models) && models.length > 0),
        [availableModels]
    );

    const currentModelName = availableModels[selectedProvider]?.find(model => model.id === selectedModel)?.name || 'Select model';

    useEffect(() => {
        if (!isOpen) return;
        const hasSelectedProvider = providerEntries.some(([provider]) => provider == selectedProvider);
        setExpandedProvider(hasSelectedProvider ? selectedProvider : (providerEntries[0]?.[0] || null));
    }, [isOpen, providerEntries, selectedProvider]);

    const toggleOpen = () => {
        const nextOpen = !isOpen;
        if (nextOpen && positionMode === 'fixed' && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            const spaceAbove = rect.top;
            const dropHeight = 320;
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
                        className={`${dropdownWidthClassName} bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl shadow-lg ${panelClassName}`}
                        style={positionMode === 'fixed' ? dropdownStyle : undefined}
                    >
                        {providerEntries.map(([provider, models]) => {
                            const isExpanded = expandedProvider === provider;
                            return (
                                <div key={provider} className="border-b border-[var(--border)] last:border-b-0">
                                    <button
                                        type="button"
                                        onClick={() => handleProviderClick(provider)}
                                        className={`w-full px-3 py-2.5 flex items-center justify-between gap-3 text-left transition-colors ${selectedProvider === provider ? 'bg-[var(--accent)]/6 text-[var(--text-primary)]' : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                                    >
                                        <div className="min-w-0">
                                            <div className="text-sm font-medium">{getProviderLabel(provider)}</div>
                                            <div className="text-xs text-[var(--text-tertiary)]">{models.length} models</div>
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
                        })}
                    </div>
                </>
            )}
        </div>
    );
}
