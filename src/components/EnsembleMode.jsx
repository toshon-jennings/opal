import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
    Play, Square, Plus, X, ChevronDown, Check, Copy, Loader2, AlertCircle,
    Sparkles, Users, Scale, Settings2, GitMerge, FileText, FolderOpen, Search,
} from 'lucide-react';
import { useChat } from '../context/ChatContext';
import { useTheme } from '../context/ThemeContext';
import { readJsonStorage, writeStringStorage, serializeJson } from '../lib/persistentStore';
import ensembleBgDark from '../assets/ensemble-bg-dark.jpeg';
import ensembleBgLight from '../assets/ensemble-bg-light.jpeg';
import {
    runEnsemble,
    createStreamModel,
    buildContextBlock,
    modelKey,
    responseLabel,
    DEFAULT_ENSEMBLE_PROMPTS,
    MAX_PANEL_MODELS,
    ENSEMBLE_CONFIG_KEY,
} from '../lib/ensemble';

const PROVIDER_LABELS = {
    openrouter: 'OpenRouter', anthropic: 'Anthropic', mistral: 'Mistral', groq: 'Groq',
    openai: 'OpenAI', gemini: 'Gemini', ollama: 'Ollama', lmstudio: 'LM Studio', jan: 'Jan',
};
const providerLabel = (p) => PROVIDER_LABELS[p] || p;

const toModel = (provider, m) => ({ provider, modelId: m.id, name: m.name });

// Text-like files offered for context attachment — binaries are skipped so the
// panel never receives garbled bytes. `listFiles` already strips node_modules/.git/dist.
const TEXT_EXT = new Set([
    'js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs', 'json', 'md', 'mdx', 'txt', 'css', 'scss',
    'less', 'html', 'htm', 'vue', 'svelte', 'astro', 'py', 'rb', 'go', 'rs', 'java',
    'kt', 'c', 'h', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'yml', 'yaml',
    'toml', 'ini', 'env', 'sql', 'xml', 'csv', 'graphql', 'prisma',
]);
const KNOWN_TEXT_NAMES = new Set(['dockerfile', 'makefile', 'readme', 'license', '.gitignore', '.env']);

const isTextFile = (relPath) => {
    const name = relPath.split('/').pop().toLowerCase();
    const ext = name.includes('.') ? name.split('.').pop() : '';
    return TEXT_EXT.has(ext) || KNOWN_TEXT_NAMES.has(name);
};

const baseName = (p) => p.split('/').pop();
// Rough token estimate for the budget hint (~4 chars/token).
const estimateTokens = (chars) => Math.ceil(chars / 4);
// Soft ceiling — warn (don't block) when attached context grows large.
const CONTEXT_WARN_CHARS = 120_000;

// Markdown renderer for streamed model text — escapes by default (no raw HTML).
const MD_COMPONENTS = {
    p: ({ children }) => <p className="mb-2 leading-6 last:mb-0">{children}</p>,
    ul: ({ children }) => <ul className="mb-2 list-disc pl-5">{children}</ul>,
    ol: ({ children }) => <ol className="mb-2 list-decimal pl-5">{children}</ol>,
    li: ({ children }) => <li className="mb-1">{children}</li>,
    h1: ({ children }) => <h1 className="mb-2 mt-3 text-base font-semibold">{children}</h1>,
    h2: ({ children }) => <h2 className="mb-2 mt-3 text-sm font-semibold">{children}</h2>,
    h3: ({ children }) => <h3 className="mb-1 mt-2 text-sm font-semibold">{children}</h3>,
    code: ({ inline, children }) => inline
        ? <code className="rounded bg-[var(--bg-tertiary)] px-1 py-0.5 font-mono text-[0.85em]">{children}</code>
        : <code className="font-mono text-[0.85em]">{children}</code>,
    pre: ({ children }) => <pre className="mb-2 overflow-x-auto rounded-lg bg-[var(--bg-tertiary)] p-3 text-[0.85em]">{children}</pre>,
    a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-[var(--accent)] underline">{children}</a>,
    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
};

function Markdown({ children }) {
    return <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>{children || ''}</ReactMarkdown>;
}

// Provider-grouped model dropdown. `mode` 'single' picks one model; 'multi'
// toggles models in/out of a Set of keys (capped at MAX_PANEL_MODELS).
function ModelMenu({ availableModels, mode, value, selectedKeys, atCap, onPick, label, icon: Icon, placeholder = 'Select model' }) {
    const [open, setOpen] = useState(false);
    const entries = useMemo(
        () => Object.entries(availableModels || {}).filter(([, list]) => Array.isArray(list) && list.length > 0),
        [availableModels],
    );
    const triggerText = mode === 'single'
        ? (value?.name || placeholder)
        : placeholder;

    return (
        <div className="relative">
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
                title={label}
            >
                {Icon && <Icon size={13} className="text-[var(--text-tertiary)]" />}
                <span className="max-w-[160px] truncate">{triggerText}</span>
                <ChevronDown size={13} className={`text-[var(--text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute left-0 top-full z-20 mt-2 max-h-80 w-72 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg">
                        {entries.length === 0 ? (
                            <div className="px-4 py-6 text-center text-xs text-[var(--text-tertiary)]">No models configured. Add API keys in Settings.</div>
                        ) : entries.map(([provider, list]) => (
                            <div key={provider} className="border-b border-[var(--border)] last:border-b-0">
                                <div className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">{providerLabel(provider)}</div>
                                {list.map((m) => {
                                    const key = `${provider}::${m.id}`;
                                    const selected = mode === 'single' ? value && modelKey(value) === key : selectedKeys?.has(key);
                                    const disabled = mode === 'multi' && !selected && atCap;
                                    return (
                                        <button
                                            key={m.id}
                                            disabled={disabled}
                                            onClick={() => { onPick(provider, m); if (mode === 'single') setOpen(false); }}
                                            className={`flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${selected ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                                        >
                                            <span className="truncate">{m.name}</span>
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
    );
}

// Folder-scoped file picker for grounding context. Pick a project folder, then
// toggle which (text) files to feed the panel. Mirrors ModelMenu's dropdown shell.
function ContextPicker({ folderName, folderList, selected, onPickFolder, onToggle, loading }) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        const list = q ? folderList.filter((p) => p.toLowerCase().includes(q)) : folderList;
        return list.slice(0, 500);
    }, [folderList, query]);

    return (
        <div className="relative">
            <button
                onClick={() => setOpen((o) => !o)}
                className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-hover)]"
                title="Attach project files as context"
            >
                <Plus size={13} className="text-[var(--text-tertiary)]" />
                <span>Add files</span>
                <ChevronDown size={13} className={`text-[var(--text-tertiary)] transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute left-0 top-full z-20 mt-2 w-80 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] shadow-lg">
                        <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2">
                            <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--text-tertiary)]">
                                <FolderOpen size={12} className="shrink-0" />
                                <span className="truncate" title={folderName || ''}>{folderName ? baseName(folderName) : 'No folder selected'}</span>
                            </span>
                            <button onClick={onPickFolder} className="shrink-0 text-[11px] font-medium text-[var(--accent)] hover:underline">
                                {folderName ? 'Change' : 'Choose…'}
                            </button>
                        </div>
                        {!folderName ? (
                            <div className="px-4 py-6 text-center text-xs text-[var(--text-tertiary)]">Choose a project folder to attach files from.</div>
                        ) : loading ? (
                            <div className="flex items-center justify-center gap-2 px-4 py-6 text-xs text-[var(--text-tertiary)]"><Loader2 size={13} className="animate-spin" /> Reading folder…</div>
                        ) : (
                            <>
                                <div className="flex items-center gap-1.5 border-b border-[var(--border)] px-3 py-1.5">
                                    <Search size={12} className="text-[var(--text-tertiary)]" />
                                    <input
                                        value={query}
                                        onChange={(e) => setQuery(e.target.value)}
                                        placeholder="Filter files…"
                                        className="w-full bg-transparent text-xs text-[var(--text-primary)] outline-none placeholder:text-[var(--text-tertiary)]"
                                    />
                                </div>
                                <div className="max-h-72 overflow-y-auto py-1">
                                    {filtered.length === 0 ? (
                                        <div className="px-4 py-6 text-center text-xs text-[var(--text-tertiary)]">No matching files.</div>
                                    ) : filtered.map((p) => {
                                        const on = selected.has(p);
                                        return (
                                            <button
                                                key={p}
                                                onClick={() => onToggle(p)}
                                                className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors ${on ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'text-[var(--text-primary)] hover:bg-[var(--bg-hover)]'}`}
                                            >
                                                <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${on ? 'border-[var(--accent)] bg-[var(--accent)] text-white' : 'border-[var(--border)]'}`}>
                                                    {on && <Check size={10} />}
                                                </span>
                                                <span className="truncate" title={p}>{p}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

const STAGE_DOT = {
    idle: 'bg-[var(--text-tertiary)]/40',
    streaming: 'animate-pulse bg-amber-400',
    done: 'bg-emerald-500',
    error: 'bg-red-500',
};

function emptyTrace() {
    return { round: 0, totalRounds: 1, panel: {}, judge: { status: 'idle', text: '' }, synth: { status: 'idle', text: '' } };
}

// Pick a sensible default judge: prefer a Claude model, else fall back to the
// caller-provided seed (the user's selected chat model).
function preferredJudge(availableModels, seed) {
    const anthropic = availableModels?.anthropic || [];
    const claude = anthropic.find((m) => /opus|sonnet/i.test(m.id)) || anthropic[0];
    if (claude) return toModel('anthropic', claude);
    return seed;
}

export default function EnsembleMode() {
    const { availableModels, apiKeys, lmStudioUrl, janUrl, selectedProvider, selectedModel } = useChat();
    const { isDarkMode } = useTheme();

    // ── Config (persisted) ────────────────────────────────────────────────────
    const seedModel = useMemo(() => {
        const m = availableModels?.[selectedProvider]?.find((x) => x.id === selectedModel);
        return m ? toModel(selectedProvider, m) : null;
    }, [availableModels, selectedProvider, selectedModel]);

    const [panel, setPanel] = useState([]);
    const [judge, setJudge] = useState(null);
    const [synth, setSynth] = useState(null); // null = same as judge
    const [rounds, setRounds] = useState(1);
    const [anonymise, setAnonymise] = useState(true);
    const [prompts, setPrompts] = useState(DEFAULT_ENSEMBLE_PROMPTS);
    const [showConfig, setShowConfig] = useState(false);
    const [showPrompts, setShowPrompts] = useState(false);

    // ── Grounding context (attached project files) ────────────────────────────
    const [contextFolder, setContextFolder] = useState(null);
    const [contextFiles, setContextFiles] = useState([]); // [{ path, content }]
    const [folderList, setFolderList] = useState([]);      // text-like relative paths in folder
    const [loadingFolder, setLoadingFolder] = useState(false);

    const loadFolderList = useCallback(async (folder) => {
        if (!folder || !window.electron?.listFiles) return [];
        setLoadingFolder(true);
        try {
            const all = await window.electron.listFiles(folder);
            const list = (all || []).filter(isTextFile).sort();
            setFolderList(list);
            return list;
        } catch (err) {
            console.error('Ensemble: failed to list folder', err);
            setFolderList([]);
            return [];
        } finally {
            setLoadingFolder(false);
        }
    }, []);

    const readContextFiles = useCallback(async (folder, paths) => {
        if (!folder || !window.electron?.readFile) return [];
        const results = await Promise.all((paths || []).map(async (p) => {
            try {
                const content = await window.electron.readFile(`${folder}/${p}`);
                return { path: p, content: typeof content === 'string' ? content : '' };
            } catch (err) {
                console.error('Ensemble: failed to read', p, err);
                return null;
            }
        }));
        return results.filter(Boolean);
    }, []);

    const pickContextFolder = useCallback(async () => {
        if (!window.electron?.selectDirectory) return;
        let folder = null;
        try { folder = await window.electron.selectDirectory(); } catch (err) { console.error(err); }
        if (!folder) return;
        setContextFolder(folder);
        setContextFiles([]); // selection is folder-relative — reset when the root changes
        await loadFolderList(folder);
    }, [loadFolderList]);

    const toggleContextFile = useCallback(async (relPath) => {
        if (contextFiles.some((f) => f.path === relPath)) {
            setContextFiles((prev) => prev.filter((f) => f.path !== relPath));
            return;
        }
        const [file] = await readContextFiles(contextFolder, [relPath]);
        if (file) setContextFiles((prev) => (prev.some((f) => f.path === file.path) ? prev : [...prev, file]));
    }, [contextFiles, contextFolder, readContextFiles]);

    const removeContextFile = (relPath) => setContextFiles((prev) => prev.filter((f) => f.path !== relPath));

    const contextSelected = useMemo(() => new Set(contextFiles.map((f) => f.path)), [contextFiles]);
    const contextChars = useMemo(() => contextFiles.reduce((n, f) => n + f.content.length, 0), [contextFiles]);

    const hydratedRef = useRef(false);

    // Load persisted config once, seeding panel/judge from the current model.
    useEffect(() => {
        if (hydratedRef.current) return;
        hydratedRef.current = true;
        const saved = readJsonStorage(ENSEMBLE_CONFIG_KEY, null);
        if (saved && typeof saved === 'object') {
            setPanel(Array.isArray(saved.panel) ? saved.panel : []);
            setJudge(saved.judge || null);
            setSynth(saved.synth || null);
            setRounds(Number(saved.rounds) || 1);
            setAnonymise(saved.anonymise !== false);
            setPrompts({ ...DEFAULT_ENSEMBLE_PROMPTS, ...(saved.prompts || {}) });
            // Re-read attached files from disk so edits are reflected (content isn't persisted).
            if (saved.contextFolder && Array.isArray(saved.contextPaths) && saved.contextPaths.length) {
                setContextFolder(saved.contextFolder);
                loadFolderList(saved.contextFolder);
                readContextFiles(saved.contextFolder, saved.contextPaths).then(setContextFiles);
            }
        } else {
            setPanel(seedModel ? [seedModel] : []);
            setJudge(preferredJudge(availableModels, seedModel));
        }
    }, [availableModels, seedModel]);

    // Persist config whenever it changes (after hydration).
    useEffect(() => {
        if (!hydratedRef.current) return;
        writeStringStorage(ENSEMBLE_CONFIG_KEY, serializeJson({
            panel, judge, synth, rounds, anonymise, prompts,
            contextFolder, contextPaths: contextFiles.map((f) => f.path),
        }));
    }, [panel, judge, synth, rounds, anonymise, prompts, contextFolder, contextFiles]);

    // ── Run state (streamed via a ref + rAF to avoid per-token re-renders) ──────
    const [prompt, setPrompt] = useState('');
    const [running, setRunning] = useState(false);
    const [error, setError] = useState('');
    const [answer, setAnswer] = useState(''); // last completed final answer
    const [copied, setCopied] = useState(false);

    const traceRef = useRef(emptyTrace());
    const [, setTick] = useState(0);
    const rafRef = useRef(0);
    const abortRef = useRef(null);

    const scheduleRender = useCallback(() => {
        if (rafRef.current) return;
        rafRef.current = requestAnimationFrame(() => { rafRef.current = 0; setTick((t) => t + 1); });
    }, []);

    useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); abortRef.current?.abort(); }, []);

    const handleEvent = useCallback((e) => {
        const t = traceRef.current;
        switch (e.type) {
            case 'round:start':
                t.round = e.round; t.totalRounds = e.totalRounds;
                t.panel = {}; t.judge = { status: 'idle', text: '' }; t.synth = { status: 'idle', text: '' };
                break;
            case 'panel:start': t.panel[e.key] = { status: 'streaming', text: '' }; break;
            case 'panel:token': t.panel[e.key] = { status: 'streaming', text: (t.panel[e.key]?.text || '') + e.token }; break;
            case 'panel:done': t.panel[e.key] = { status: 'done', text: e.text }; break;
            case 'panel:error': t.panel[e.key] = { status: 'error', text: '', error: e.error }; break;
            case 'judge:start': t.judge = { status: 'streaming', text: '' }; break;
            case 'judge:token': t.judge = { status: 'streaming', text: t.judge.text + e.token }; break;
            case 'judge:done': t.judge = { status: 'done', text: e.text }; break;
            case 'synth:start': t.synth = { status: 'streaming', text: '' }; break;
            case 'synth:token': t.synth = { status: 'streaming', text: t.synth.text + e.token }; break;
            case 'synth:done': t.synth = { status: 'done', text: e.text }; break;
            default: break;
        }
        scheduleRender();
    }, [scheduleRender]);

    // ── Panel/judge/synth editing ───────────────────────────────────────────
    const panelKeys = useMemo(() => new Set(panel.map(modelKey)), [panel]);
    const togglePanel = (provider, m) => {
        const key = `${provider}::${m.id}`;
        setPanel((prev) => {
            if (prev.some((x) => modelKey(x) === key)) return prev.filter((x) => modelKey(x) !== key);
            if (prev.length >= MAX_PANEL_MODELS) return prev;
            return [...prev, toModel(provider, m)];
        });
    };
    const removePanel = (m) => setPanel((prev) => prev.filter((x) => modelKey(x) !== modelKey(m)));

    const canRun = prompt.trim() && panel.length > 0 && judge && !running;

    const run = async () => {
        if (!canRun) return;
        traceRef.current = emptyTrace();
        setError('');
        setAnswer('');
        setRunning(true);
        scheduleRender();
        const controller = new AbortController();
        abortRef.current = controller;
        try {
            const streamModel = createStreamModel({ apiKeys, lmStudioUrl, janUrl });
            const context = buildContextBlock(contextFiles);
            const result = await runEnsemble(
                { prompt, panel, judge, synth, rounds, anonymise, prompts, context },
                { streamModel, signal: controller.signal, onEvent: handleEvent },
            );
            setAnswer(result.answer || '');
        } catch (err) {
            if (err?.name !== 'AbortError') setError(err?.message || 'Ensemble run failed');
        } finally {
            setRunning(false);
            abortRef.current = null;
        }
    };

    const cancel = () => abortRef.current?.abort();

    const copyAnswer = () => {
        const text = answer || traceRef.current.synth.text;
        if (!text) return;
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    const trace = traceRef.current;
    const synthText = answer || trace.synth.text;
    const judgeState = trace.judge;
    const panelEntries = panel.map((m) => ({ model: m, key: modelKey(m), state: trace.panel[modelKey(m)] || { status: 'idle', text: '' } }));

    return (
        <div className="flex h-full min-h-0 w-full flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            {/* Header */}
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--bg-secondary)]/30 px-4">
                <div className="flex items-center gap-2">
                    <GitMerge size={16} className="text-[var(--accent)]" />
                    <span className="text-sm font-semibold">Ensemble</span>
                    <span className="text-[11px] text-[var(--text-tertiary)]">panel → judge → synthesis</span>
                </div>
                <button
                    onClick={() => setShowConfig((s) => !s)}
                    className={`flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${showConfig ? 'bg-[var(--accent)]/10 text-[var(--accent)]' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'}`}
                >
                    <Settings2 size={14} /> Config
                </button>
            </div>

            {/* Config + composer */}
            <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-secondary)]/20 p-4">
                {/* Panel models */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]"><Users size={12} /> Panel</span>
                    {panel.map((m) => (
                        <span key={modelKey(m)} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs">
                            <span className="font-medium">{m.name}</span>
                            <span className="text-[var(--text-tertiary)]">{providerLabel(m.provider)}</span>
                            <button onClick={() => removePanel(m)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X size={13} /></button>
                        </span>
                    ))}
                    <ModelMenu
                        availableModels={availableModels}
                        mode="multi"
                        selectedKeys={panelKeys}
                        atCap={panel.length >= MAX_PANEL_MODELS}
                        onPick={togglePanel}
                        label="Add panel model"
                        icon={Plus}
                        placeholder="Add model"
                    />
                    <span className="text-[11px] text-[var(--text-tertiary)]">{panel.length}/{MAX_PANEL_MODELS}</span>
                </div>

                {/* Context files — grounds the panel, judge and synthesis in your project */}
                <div className="mb-3 flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]"><FileText size={12} /> Context</span>
                    {contextFiles.map((f) => (
                        <span key={f.path} className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs" title={f.path}>
                            <FileText size={12} className="text-[var(--text-tertiary)]" />
                            <span className="max-w-[160px] truncate font-medium">{baseName(f.path)}</span>
                            <button onClick={() => removeContextFile(f.path)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"><X size={13} /></button>
                        </span>
                    ))}
                    <ContextPicker
                        folderName={contextFolder}
                        folderList={folderList}
                        selected={contextSelected}
                        onPickFolder={pickContextFolder}
                        onToggle={toggleContextFile}
                        loading={loadingFolder}
                    />
                    {contextFiles.length > 0
                        ? (
                            <span className={`text-[11px] ${contextChars > CONTEXT_WARN_CHARS ? 'text-amber-500' : 'text-[var(--text-tertiary)]'}`}>
                                {contextFiles.length} file{contextFiles.length > 1 ? 's' : ''} · ~{estimateTokens(contextChars).toLocaleString()} tokens
                            </span>
                        )
                        : <span className="text-[11px] text-[var(--text-tertiary)]">optional — attach project files to ground the panel</span>}
                </div>

                {showConfig && (
                    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]/50 p-3">
                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]"><Scale size={12} /> Judge</span>
                            <ModelMenu availableModels={availableModels} mode="single" value={judge} onPick={(p, m) => setJudge(toModel(p, m))} label="Judge model" placeholder="Select judge" />
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]"><Sparkles size={12} /> Synthesis</span>
                            <ModelMenu availableModels={availableModels} mode="single" value={synth} onPick={(p, m) => setSynth(toModel(p, m))} label="Synthesis model" placeholder="Same as judge" />
                            {synth && <button onClick={() => setSynth(null)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" title="Reset to judge model"><X size={13} /></button>}
                        </div>
                        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                            Rounds
                            <select value={rounds} onChange={(e) => setRounds(Number(e.target.value))} className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-xs">
                                {[1, 2, 3].map((n) => <option key={n} value={n}>{n}</option>)}
                            </select>
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-xs text-[var(--text-secondary)]">
                            <input type="checkbox" checked={anonymise} onChange={(e) => setAnonymise(e.target.checked)} />
                            Anonymise panel for judge
                        </label>
                        <button onClick={() => setShowPrompts((s) => !s)} className="text-xs font-medium text-[var(--accent)] hover:underline">
                            {showPrompts ? 'Hide prompts' : 'Edit prompts'}
                        </button>
                    </div>
                )}

                {showConfig && showPrompts && (
                    <div className="mb-3 grid grid-cols-1 gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)]/50 p-3 md:grid-cols-2">
                        {[
                            ['panelistSystem', 'Panelist system'],
                            ['judge', 'Judge'],
                            ['synth', 'Synthesis'],
                            ['refine', 'Refine (rounds 2+)'],
                        ].map(([key, label]) => (
                            <label key={key} className="flex flex-col gap-1 text-xs">
                                <span className="font-semibold text-[var(--text-secondary)]">{label}</span>
                                <textarea
                                    value={prompts[key]}
                                    onChange={(e) => setPrompts((p) => ({ ...p, [key]: e.target.value }))}
                                    className="h-28 resize-y rounded-md border border-[var(--border)] bg-[var(--bg-primary)] p-2 font-mono text-[11px] leading-5 text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                                />
                            </label>
                        ))}
                        <button onClick={() => setPrompts(DEFAULT_ENSEMBLE_PROMPTS)} className="justify-self-start text-xs font-medium text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:underline">
                            Reset prompts to default
                        </button>
                    </div>
                )}

                {/* Composer */}
                <div className="flex items-end gap-2">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); } }}
                        placeholder="Ask a question to fuse across the panel… (⌘/Ctrl+Enter to run)"
                        className="min-h-[52px] max-h-[160px] flex-1 resize-none rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-3.5 py-2.5 text-sm leading-6 text-[var(--text-primary)] outline-none transition-all placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]"
                    />
                    <button
                        onClick={running ? cancel : run}
                        disabled={!running && !canRun}
                        className="flex h-[52px] items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-medium text-white shadow-md transition-colors hover:bg-[var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {running ? <Square size={16} /> : <Play size={16} />}
                        {running ? 'Cancel' : 'Run'}
                    </button>
                </div>
                {error && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-red-500"><AlertCircle size={14} /> {error}</div>
                )}
            </div>

            {/* Results */}
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {panel.length === 0 ? (
                    <div className="relative flex h-full flex-col items-center justify-center gap-2 overflow-hidden text-center text-[var(--text-tertiary)]">
                        <img
                            src={isDarkMode ? ensembleBgDark : ensembleBgLight}
                            alt=""
                            aria-hidden="true"
                            className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-[0.16] saturate-[0.7] blur-[0.5px]"
                        />
                        <GitMerge size={28} className="relative z-10" />
                        <p className="relative z-10 text-sm">Add at least one panel model, then ask a question.</p>
                    </div>
                ) : (
                    <div className="mx-auto flex max-w-4xl flex-col gap-4">
                        {/* Stage 1: Panel */}
                        <section>
                            <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                                <Users size={12} /> Panel{trace.totalRounds > 1 && trace.round ? ` · round ${trace.round}/${trace.totalRounds}` : ''}
                            </div>
                            <div className="flex gap-3 overflow-x-auto pb-1">
                                {panelEntries.map(({ model, key, state }, i) => (
                                    <div key={key} className="flex min-h-[120px] w-72 shrink-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/30">
                                        <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2">
                                            <span className={`h-2 w-2 shrink-0 rounded-full ${STAGE_DOT[state.status]}`} />
                                            {anonymise && <span className="rounded bg-[var(--bg-tertiary)] px-1.5 py-0.5 text-[10px] font-bold">{responseLabel(i)}</span>}
                                            <div className="min-w-0">
                                                <div className="truncate text-xs font-semibold">{model.name}</div>
                                                <div className="truncate text-[10px] text-[var(--text-tertiary)]">{providerLabel(model.provider)}</div>
                                            </div>
                                        </div>
                                        <div className="min-h-0 flex-1 overflow-y-auto p-3 text-xs text-[var(--text-secondary)]">
                                            {state.status === 'error'
                                                ? <span className="text-red-500">{state.error}</span>
                                                : state.text
                                                    ? <Markdown>{state.text}</Markdown>
                                                    : <span className="text-[var(--text-tertiary)]">{state.status === 'streaming' ? 'Thinking…' : 'Idle'}</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>

                        {/* Stage 2: Judge */}
                        {(judgeState.text || judgeState.status !== 'idle') && (
                            <section className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)]/30">
                                <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                                    <span className={`h-2 w-2 rounded-full ${STAGE_DOT[judgeState.status]}`} />
                                    <Scale size={12} /> Judge deliberation
                                    {judge && <span className="ml-1 normal-case text-[10px] text-[var(--text-tertiary)]/80">· {judge.name}</span>}
                                </div>
                                <div className="max-h-72 overflow-y-auto p-3 text-xs text-[var(--text-secondary)]">
                                    {judgeState.text ? <Markdown>{judgeState.text}</Markdown> : <span className="text-[var(--text-tertiary)]">Waiting for panel…</span>}
                                </div>
                            </section>
                        )}

                        {/* Stage 3: Final answer */}
                        {(synthText || trace.synth.status !== 'idle') && (
                            <section className="rounded-xl border-2 border-[var(--accent)]/40 bg-[var(--bg-secondary)]/40">
                                <div className="flex items-center justify-between border-b border-[var(--border)] px-3 py-2">
                                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--accent)]">
                                        <span className={`h-2 w-2 rounded-full ${STAGE_DOT[trace.synth.status]}`} />
                                        <Sparkles size={12} /> Final answer
                                    </div>
                                    {synthText && (
                                        <button onClick={copyAnswer} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]">
                                            {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
                                        </button>
                                    )}
                                </div>
                                <div className="overflow-y-auto p-4 text-sm text-[var(--text-primary)]">
                                    {synthText
                                        ? <Markdown>{synthText}</Markdown>
                                        : <span className="flex items-center gap-2 text-[var(--text-tertiary)]"><Loader2 size={14} className="animate-spin" /> Synthesising…</span>}
                                </div>
                            </section>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
