import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Plus, X, Play, Loader2, Code, Monitor, Columns2, AlertCircle, Check, ChevronDown, ArrowUpRight } from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useBuild } from '../context/BuildContext';
import { useTheme } from '../context/ThemeContext';
import { LLMFactory } from '../lib/llm/clients';
import { generatePreviewHTML } from '../utils/preview-generator';
import { getPreviewSandbox } from '../lib/previewSecurity';
import { buildCodeGenSystemPrompt, parseGeneratedFiles, PROVIDERS_REQUIRING_API_KEYS } from '../lib/buildGeneration';

const MAX_MODELS = 4;
const PROVIDER_LABELS = {
    openrouter: 'OpenRouter', anthropic: 'Anthropic', mistral: 'Mistral', groq: 'Groq',
    openai: 'OpenAI', gemini: 'Gemini', ollama: 'Ollama', lmstudio: 'LM Studio', jan: 'Jan'
};

const keyOf = (m) => `${m.provider}::${m.modelId}`;

function CompareColumn({ model, result, isDarkMode, onRemove, onUse }) {
    const [view, setView] = useState('preview');
    const files = result?.files || {};
    const filePaths = Object.keys(files);
    const [activeFile, setActiveFile] = useState(null);
    const currentFile = activeFile && files[activeFile] ? activeFile : (filePaths.includes('src/App.tsx') ? 'src/App.tsx' : filePaths[0]);

    const status = result?.status || 'idle';

    return (
        <div className="flex h-full min-w-[340px] flex-1 flex-col overflow-hidden border-r border-[var(--border)] last:border-r-0">
            <div className="flex h-11 shrink-0 items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--bg-secondary)]/40 px-3">
                <div className="flex min-w-0 items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${status === 'generating' ? 'animate-pulse bg-amber-400' : status === 'done' ? 'bg-emerald-500' : status === 'error' ? 'bg-red-500' : 'bg-[var(--text-tertiary)]/50'}`} />
                    <div className="min-w-0">
                        <div className="truncate text-xs font-semibold text-[var(--text-primary)]">{model.name}</div>
                        <div className="truncate text-[10px] text-[var(--text-tertiary)]">{PROVIDER_LABELS[model.provider] || model.provider}</div>
                    </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                    {status === 'done' && (
                        <button
                            onClick={() => onUse(files)}
                            className="flex items-center gap-1 rounded-md bg-[var(--accent)]/10 px-2 py-1 text-[11px] font-medium text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/20"
                            title="Apply this output to the Build session"
                        >
                            <ArrowUpRight size={13} />
                            Use
                        </button>
                    )}
                    {status === 'done' && (
                        <div className="flex rounded-md border border-[var(--border)] bg-[var(--bg-primary)] p-0.5">
                            <button
                                onClick={() => setView('preview')}
                                className={`rounded p-1 ${view === 'preview' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                                title="Preview"
                            >
                                <Monitor size={13} />
                            </button>
                            <button
                                onClick={() => setView('code')}
                                className={`rounded p-1 ${view === 'code' ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                                title="Code"
                            >
                                <Code size={13} />
                            </button>
                        </div>
                    )}
                    <button
                        onClick={onRemove}
                        className="rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        title="Remove model"
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden bg-[var(--bg-tertiary)]">
                {status === 'generating' && (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--text-tertiary)]">
                        <Loader2 size={22} className="animate-spin text-[var(--accent)]" />
                        <span className="text-xs">Generating…</span>
                    </div>
                )}
                {status === 'error' && (
                    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                        <AlertCircle size={22} className="text-red-500" />
                        <span className="max-w-[260px] text-xs leading-5 text-[var(--text-secondary)]">{result.error}</span>
                    </div>
                )}
                {status === 'idle' && (
                    <div className="flex h-full items-center justify-center p-6 text-center text-xs text-[var(--text-tertiary)]">
                        Run a prompt to generate output for this model.
                    </div>
                )}
                {status === 'done' && view === 'preview' && (
                    <iframe
                        className="h-full w-full border-none bg-[var(--bg-primary)]"
                        srcDoc={result.previewHTML}
                        sandbox={getPreviewSandbox({ scripts: true, forms: true })}
                        referrerPolicy="no-referrer"
                        title={`Preview ${model.name}`}
                    />
                )}
                {status === 'done' && view === 'code' && (
                    <div className="flex h-full flex-col bg-[var(--bg-primary)]">
                        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-[var(--border)] px-2 py-1.5">
                            {filePaths.map(path => (
                                <button
                                    key={path}
                                    onClick={() => setActiveFile(path)}
                                    className={`shrink-0 rounded px-2 py-1 font-mono text-[10px] ${path === currentFile ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'}`}
                                >
                                    {path.replace('src/', '')}
                                </button>
                            ))}
                        </div>
                        <pre className="min-h-0 flex-1 overflow-auto p-3 text-[11px] leading-5 text-[var(--text-primary)]">
                            <code className="font-mono">{files[currentFile] || ''}</code>
                        </pre>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function BuildCompare({ onClose, initialPrompt = '' }) {
    const { availableModels, apiKeys, lmStudioUrl, janUrl, selectedProvider, selectedModel } = useChat();
    const { updateBuildFiles, setActiveFile, addBuildMessage } = useBuild();
    const { isDarkMode } = useTheme();

    const [prompt, setPrompt] = useState(initialPrompt);
    const [models, setModels] = useState(() => {
        const seed = availableModels?.[selectedProvider]?.find(m => m.id === selectedModel);
        return seed ? [{ provider: selectedProvider, modelId: seed.id, name: seed.name }] : [];
    });
    const [results, setResults] = useState({});
    const [pickerOpen, setPickerOpen] = useState(false);
    const abortRefs = useRef({});

    const isRunning = useMemo(() => Object.values(results).some(r => r?.status === 'generating'), [results]);

    const providerEntries = useMemo(
        () => Object.entries(availableModels || {}).filter(([, list]) => Array.isArray(list) && list.length > 0),
        [availableModels]
    );

    const toggleModel = (provider, model) => {
        const k = `${provider}::${model.id}`;
        setModels(prev => {
            if (prev.some(m => keyOf(m) === k)) return prev.filter(m => keyOf(m) !== k);
            if (prev.length >= MAX_MODELS) return prev;
            return [...prev, { provider, modelId: model.id, name: model.name }];
        });
    };

    const removeModel = (m) => {
        const k = keyOf(m);
        abortRefs.current[k]?.abort();
        delete abortRefs.current[k];
        setModels(prev => prev.filter(x => keyOf(x) !== k));
        setResults(prev => {
            const next = { ...prev };
            delete next[k];
            return next;
        });
    };

    const generateOne = async (m) => {
        const k = keyOf(m);
        const controller = new AbortController();
        abortRefs.current[k] = controller;
        setResults(prev => ({ ...prev, [k]: { status: 'generating' } }));
        let full = '';
        try {
            if (PROVIDERS_REQUIRING_API_KEYS.has(m.provider) && !apiKeys[m.provider]) {
                throw new Error(`Add a ${PROVIDER_LABELS[m.provider] || m.provider} API key in Settings.`);
            }
            const client = LLMFactory.getClient(m.provider, apiKeys[m.provider], { lmStudioUrl, janUrl });
            const systemPrompt = buildCodeGenSystemPrompt({ userMessage: prompt, existingFiles: [] });
            await client.streamChat(
                [{ role: 'user', content: systemPrompt }],
                (chunk) => { full += chunk; },
                m.modelId,
                { signal: controller.signal }
            );
            const files = parseGeneratedFiles(full);
            const previewHTML = generatePreviewHTML(files, { isDarkMode });
            setResults(prev => ({ ...prev, [k]: { status: 'done', files, previewHTML } }));
        } catch (err) {
            if (err?.name === 'AbortError') {
                setResults(prev => ({ ...prev, [k]: { status: 'idle' } }));
            } else {
                const detail = full ? `${err?.message || 'Generation failed'} — the model may not have returned valid JSON.` : (err?.message || 'Generation failed');
                setResults(prev => ({ ...prev, [k]: { status: 'error', error: detail } }));
            }
        } finally {
            if (abortRefs.current[k] === controller) delete abortRefs.current[k];
        }
    };

    const runComparison = () => {
        if (!prompt.trim() || models.length === 0 || isRunning) return;
        models.forEach(generateOne);
    };

    const cancelAll = () => {
        Object.values(abortRefs.current).forEach(c => c?.abort());
    };

    const useOutput = (model, files) => {
        if (!files || Object.keys(files).length === 0) return;
        updateBuildFiles(files);
        if (files['src/App.tsx']) setActiveFile('src/App.tsx');
        addBuildMessage({
            role: 'assistant',
            content: `Applied output from ${model.name} (${PROVIDER_LABELS[model.provider] || model.provider}).`,
            files
        });
        onClose();
    };

    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            {/* Header */}
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)]/30 px-4">
                <div className="flex items-center gap-3">
                    <button
                        onClick={onClose}
                        className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                    >
                        <ArrowLeft size={15} />
                        Back to Build
                    </button>
                    <div className="flex items-center gap-2">
                        <Columns2 size={15} className="text-[var(--accent)]" />
                        <span className="text-sm font-semibold">Compare models</span>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-secondary)]/20 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    {models.map(m => (
                        <span key={keyOf(m)} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs">
                            <span className="font-medium">{m.name}</span>
                            <span className="text-[var(--text-tertiary)]">{PROVIDER_LABELS[m.provider] || m.provider}</span>
                            <button onClick={() => removeModel(m)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                                <X size={13} />
                            </button>
                        </span>
                    ))}
                    <div className="relative">
                        <button
                            onClick={() => setPickerOpen(o => !o)}
                            disabled={models.length >= MAX_MODELS}
                            className="flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Plus size={13} />
                            Add model
                            <ChevronDown size={13} className={`transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {pickerOpen && (
                            <>
                                <div className="fixed inset-0 z-10" onClick={() => setPickerOpen(false)} />
                                <div className="absolute left-0 top-full z-20 mt-2 max-h-80 w-72 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg">
                                    {providerEntries.length === 0 ? (
                                        <div className="px-4 py-6 text-center text-xs text-[var(--text-tertiary)]">No models configured.</div>
                                    ) : providerEntries.map(([provider, list]) => (
                                        <div key={provider} className="border-b border-[var(--border)] last:border-b-0">
                                            <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                                                {PROVIDER_LABELS[provider] || provider}
                                            </div>
                                            {list.map(model => {
                                                const selected = models.some(m => keyOf(m) === `${provider}::${model.id}`);
                                                const atCap = !selected && models.length >= MAX_MODELS;
                                                return (
                                                    <button
                                                        key={model.id}
                                                        onClick={() => toggleModel(provider, model)}
                                                        disabled={atCap}
                                                        className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${selected ? 'bg-[var(--accent)]/8 text-[var(--accent)]' : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                                                    >
                                                        <span className="truncate">{model.name}</span>
                                                        {selected && <Check size={14} className="shrink-0" />}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                    <span className="text-[11px] text-[var(--text-tertiary)]">{models.length}/{MAX_MODELS} models</span>
                </div>
                <div className="flex items-end gap-2">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); runComparison(); } }}
                        placeholder="Describe the app or component to generate across all selected models…"
                        className="min-h-[52px] max-h-[160px] flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm leading-6 text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                    />
                    <button
                        onClick={isRunning ? cancelAll : runComparison}
                        disabled={!isRunning && (!prompt.trim() || models.length === 0)}
                        className="flex h-[52px] items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-medium text-white shadow-md transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {isRunning ? <X size={16} /> : <Play size={16} />}
                        {isRunning ? 'Cancel' : 'Run'}
                    </button>
                </div>
            </div>

            {/* Results */}
            <div className="min-h-0 flex-1 overflow-x-auto">
                {models.length === 0 ? (
                    <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-[var(--text-tertiary)]">
                        <Columns2 size={28} />
                        <p className="text-sm">Add at least one model to compare.</p>
                    </div>
                ) : (
                    <div className="flex h-full min-w-full">
                        {models.map(m => (
                            <CompareColumn
                                key={keyOf(m)}
                                model={m}
                                result={results[keyOf(m)]}
                                isDarkMode={isDarkMode}
                                onRemove={() => removeModel(m)}
                                onUse={(files) => useOutput(m, files)}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
