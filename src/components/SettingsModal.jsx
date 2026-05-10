import React, { useState, useEffect } from 'react';
import { X, Key, Globe, RefreshCw, ChevronDown, Check, Wifi, WifiOff, User, ScrollText, Search } from 'lucide-react';
import { useChat } from '../context/ChatContext';

// Collapsible section wrapper
function Section({ title, icon: Icon, defaultOpen = true, children }) {
    const [open, setOpen] = useState(defaultOpen);
    return (
        <div className="border-t border-[var(--border)] pt-4">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center justify-between gap-2 text-left group mb-3"
            >
                <span className="flex items-center gap-2 text-sm font-semibold text-[var(--text-primary)]">
                    {Icon && <Icon size={15} className="text-[var(--accent)]" />}
                    {title}
                </span>
                <ChevronDown
                    size={16}
                    className={`text-[var(--text-tertiary)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>
            {open && <div className="space-y-3">{children}</div>}
        </div>
    );
}

export function SettingsModal({ isOpen, onClose }) {
    const {
        apiKeys,
        updateApiKey,
        selectedProvider,
        selectedModel,
        updateProvider,
        updateModel,
        availableModels,
        isLoadingModels,
        refreshModels,
        userName,
        setUserName,
        customInstructions,
        setCustomInstructions
    } = useChat();

    const [modelSearch, setModelSearch] = useState('');
    const [editingName, setEditingName] = useState('');
    const [editingInstructions, setEditingInstructions] = useState('');

    useEffect(() => {
        if (isOpen) {
            setEditingName(userName || '');
            setEditingInstructions(customInstructions || '');
            setModelSearch('');
        }
    }, [isOpen, userName, customInstructions]);

    if (!isOpen) return null;

    const providers = [
        { id: 'openrouter', name: 'OpenRouter', needsKey: true, color: 'violet', badge: 'Recommended' },
        { id: 'anthropic',  name: 'Anthropic',  needsKey: true, color: 'amber'  },
        { id: 'mistral',    name: 'Mistral',    needsKey: true, color: 'sky'    },
        { id: 'groq',       name: 'Groq',       needsKey: true, color: 'orange' },
        { id: 'openai',     name: 'OpenAI',     needsKey: true, color: 'green'  },
        { id: 'gemini',     name: 'Gemini',     needsKey: true, color: 'blue'   },
        { id: 'ollama',     name: 'Ollama',     needsKey: false, color: 'purple', local: true },
        { id: 'lmstudio',  name: 'LM Studio',  needsKey: false, color: 'pink',   local: true },
    ];

    const currentProviderModels = availableModels[selectedProvider] || [];
    const selectedModelObj = currentProviderModels.find(m => m.id === selectedModel);

    const filteredModels = modelSearch.trim()
        ? currentProviderModels.filter(m =>
            m.name.toLowerCase().includes(modelSearch.toLowerCase()) ||
            m.id.toLowerCase().includes(modelSearch.toLowerCase())
          )
        : currentProviderModels;

    const handleSaveName = () => {
        if (editingName.trim() !== userName) setUserName(editingName.trim());
    };

    const handleSaveInstructions = () => {
        if (editingInstructions !== customInstructions) setCustomInstructions(editingInstructions);
    };

    const handleClose = () => {
        handleSaveName();
        handleSaveInstructions();
        onClose();
    };

    return (
        <div
            className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50"
            onClick={handleClose}
        >
            <div
                className="bg-[var(--bg-primary)] w-full max-w-3xl rounded-2xl border border-[var(--border)] flex flex-col"
                style={{ maxHeight: '90vh' }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex-shrink-0 px-6 py-5 border-b border-[var(--border)] bg-[var(--bg-secondary)] rounded-t-2xl flex items-center justify-between">
                    <div>
                        <h2 className="text-xl font-semibold text-[var(--text-primary)]">Settings</h2>
                        <p className="text-sm text-[var(--text-tertiary)] mt-0.5">Manage your profile and preferences</p>
                    </div>
                    <button
                        onClick={handleClose}
                        className="p-1.5 hover:bg-[var(--bg-hover)] rounded-md transition-colors text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                    >
                        <X size={20} />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-0">

                    {/* Profile */}
                    <Section title="Profile" icon={User} defaultOpen={true}>
                        <input
                            type="text"
                            value={editingName}
                            onChange={e => setEditingName(e.target.value)}
                            onBlur={handleSaveName}
                            onKeyDown={e => { if (e.key === 'Enter') { handleSaveName(); e.target.blur(); } }}
                            className="w-full px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] focus:ring-2 ring-[var(--accent)] outline-none transition-all text-[var(--text-primary)] placeholder:text-[var(--text-secondary)]"
                            placeholder="Enter your name..."
                        />
                        <p className="text-xs text-[var(--text-tertiary)]">
                            Used in greetings and referenced by AI models.
                        </p>
                    </Section>

                    {/* Custom Instructions */}
                    <Section title="Custom Instructions" icon={ScrollText} defaultOpen={false}>
                        <textarea
                            value={editingInstructions}
                            onChange={e => setEditingInstructions(e.target.value)}
                            onBlur={handleSaveInstructions}
                            className="min-h-[120px] w-full resize-y px-4 py-3 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] focus:ring-2 ring-[var(--accent)] outline-none transition-all text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] leading-relaxed text-sm"
                            placeholder="Tell Opal how to respond, what to prioritize, what to avoid..."
                        />
                        <p className="text-xs text-[var(--text-tertiary)]">
                            Reviewed before every response. Saved locally.
                        </p>
                    </Section>

                    {/* Provider & Model */}
                    <Section title="Model Selection" icon={Globe} defaultOpen={true}>
                        <div className="flex justify-end -mt-1 mb-1">
                            <button
                                onClick={refreshModels}
                                disabled={isLoadingModels}
                                className="flex items-center gap-1 text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                            >
                                <RefreshCw size={13} className={isLoadingModels ? 'animate-spin' : ''} />
                                Refresh
                            </button>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5 mb-6">
                            {providers.map(provider => {
                                const models = availableModels[provider.id] || [];
                                const isAvailable = provider.needsKey ? !!apiKeys[provider.id] : models.length > 0;
                                const isSelected = selectedProvider === provider.id;
                                return (
                                    <button
                                        key={provider.id}
                                        onClick={() => isAvailable && updateProvider(provider.id)}
                                        disabled={!isAvailable}
                                        className={`p-3.5 rounded-lg border transition-colors relative ${
                                            isSelected
                                                ? 'border-[var(--accent)] bg-[var(--accent)]/5'
                                                : 'border-[var(--border)] hover:border-[var(--accent)]/30'
                                        } ${!isAvailable ? 'opacity-50 cursor-not-allowed' : ''}`}
                                    >
                                        {provider.badge && (
                                            <span className="absolute top-1.5 left-1/2 -translate-x-1/2 text-[9px] font-semibold tracking-wide uppercase text-violet-400 bg-violet-500/10 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                                {provider.badge}
                                            </span>
                                        )}
                                        <div className={`flex flex-col items-center gap-2 ${provider.badge ? 'mt-4' : ''}`}>
                                            <div className={`w-9 h-9 rounded-full bg-${provider.color}-500/20 flex items-center justify-center`}>
                                                {provider.local
                                                    ? (isAvailable ? <Wifi size={18} className={`text-${provider.color}-500`} /> : <WifiOff size={18} className="text-gray-500" />)
                                                    : <Globe size={18} className={isAvailable ? `text-${provider.color}-500` : 'text-gray-500'} />
                                                }
                                            </div>
                                            <span className="font-medium text-sm text-[var(--text-primary)]">{provider.name}</span>
                                            {isSelected && (
                                                <div className="absolute top-2 right-2 w-4 h-4 bg-[var(--accent)] rounded-full flex items-center justify-center">
                                                    <Check size={10} className="text-white" />
                                                </div>
                                            )}
                                            {provider.local && (
                                                <span className="text-xs text-[var(--text-tertiary)]">
                                                    {isAvailable ? `${models.length} models` : 'Offline'}
                                                </span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Expanded Model List */}
                        <div className={`transition-all duration-300 ${selectedProvider ? 'opacity-100' : 'opacity-50 pointer-events-none'}`}>
                            {currentProviderModels.length > 0 ? (
                                <div className="space-y-2">
                                    {currentProviderModels.length > 8 && (
                                        <div className="relative mb-2">
                                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] pointer-events-none" />
                                            <input
                                                type="text"
                                                value={modelSearch}
                                                onChange={e => setModelSearch(e.target.value)}
                                                placeholder={`Search ${currentProviderModels.length} models...`}
                                                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-[var(--border)] bg-[var(--bg-tertiary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
                                            />
                                        </div>
                                    )}

                                    {selectedModelObj && (
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--accent)]/10 border border-[var(--accent)]/30 mb-2">
                                            <Check size={14} className="text-[var(--accent)] flex-shrink-0" />
                                            <span className="text-sm font-medium text-[var(--text-primary)] truncate">{selectedModelObj.name}</span>
                                            {selectedModelObj.contextWindow && (
                                                <span className="ml-auto flex-shrink-0 text-xs text-[var(--text-tertiary)]">
                                                    {(selectedModelObj.contextWindow / 1000).toFixed(0)}K ctx
                                                </span>
                                            )}
                                        </div>
                                    )}

                                    <div className="border border-[var(--border)] rounded-xl overflow-hidden" style={{ maxHeight: '220px', overflowY: 'auto' }}>
                                        {filteredModels.length === 0 ? (
                                            <div className="px-4 py-8 text-center text-sm text-[var(--text-tertiary)]">
                                                No models match "{modelSearch}"
                                            </div>
                                        ) : filteredModels.map(model => (
                                            <button
                                                key={model.id}
                                                onClick={() => updateModel(model.id)}
                                                className={`w-full px-4 py-2.5 text-left flex items-center justify-between gap-3 transition-colors hover:bg-[var(--bg-hover)] ${
                                                    model.id === selectedModel ? 'bg-[var(--accent)]/8' : ''
                                                }`}
                                            >
                                                <div className="min-w-0">
                                                    <div className="text-sm font-medium text-[var(--text-primary)] truncate">{model.name}</div>
                                                    {model.contextWindow && (
                                                        <div className="text-xs text-[var(--text-tertiary)]">
                                                            {(model.contextWindow / 1000).toFixed(0)}K tokens
                                                        </div>
                                                    )}
                                                </div>
                                                {model.id === selectedModel && (
                                                    <Check size={15} className="flex-shrink-0 text-[var(--accent)]" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            ) : (
                                <div className="px-4 py-8 rounded-xl border border-dashed border-[var(--border)] text-center">
                                    <p className="text-sm text-[var(--text-secondary)]">
                                        {selectedProvider === 'ollama' || selectedProvider === 'lmstudio'
                                            ? `Start ${selectedProvider === 'ollama' ? 'Ollama' : 'LM Studio'} to see available models`
                                            : 'Add an API key to see available models'
                                        }
                                    </p>
                                </div>
                            )}
                        </div>
                    </Section>
                    {/* API Keys */}
                    <Section title="API Keys" icon={Key} defaultOpen={false}>
                        {[
                            { id: 'openrouter', label: 'OpenRouter' },
                            { id: 'anthropic',  label: 'Anthropic (Claude)' },
                            { id: 'mistral',    label: 'Mistral' },
                            { id: 'openai',     label: 'OpenAI' },
                            { id: 'groq',       label: 'Groq' },
                            { id: 'gemini',     label: 'Gemini' },
                            { id: 'tavily',     label: 'Tavily (Web Search)' },
                        ].map(({ id, label }) => (
                            <div key={id} className="space-y-1.5">
                                <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide">
                                    {label}
                                </label>
                                <div className="relative">
                                    <input
                                        type="password"
                                        value={apiKeys[id] || ''}
                                        onChange={e => updateApiKey(id, e.target.value)}
                                        className={`w-full px-4 py-2.5 rounded-xl border transition-all outline-none text-sm text-[var(--text-primary)] placeholder:text-[var(--text-secondary)] ${
                                            apiKeys[id]
                                                ? 'border-[var(--accent)]/40 bg-[var(--accent)]/5 focus:ring-2 ring-[var(--accent)]'
                                                : 'border-[var(--border)] bg-[var(--bg-tertiary)] focus:ring-2 ring-[var(--accent)]'
                                        }`}
                                        placeholder={`${label} API key`}
                                    />
                                    {apiKeys[id] && (
                                        <div className="absolute right-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-emerald-400" title="Key set" />
                                    )}
                                </div>
                            </div>
                        ))}
                    </Section>

                    {/* Bottom padding */}
                    <div className="h-4" />
                </div>

                {/* Footer */}
                <div className="flex-shrink-0 px-6 py-4 border-t border-[var(--border)] flex justify-end rounded-b-2xl">
                    <button
                        onClick={handleClose}
                        className="px-5 py-2.5 bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-white rounded-lg font-medium transition-colors text-sm"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
}