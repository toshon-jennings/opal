import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Bot, CheckCircle2, Download, Edit3, HelpCircle, KeyRound, RefreshCw,
    Search, Settings, Sparkles, Trash2, Upload, X
} from 'lucide-react';
import { parseIdeaBrowserBar } from '../lib/barsIdeaBrowser';
import './BarsMode.css';

const IDEAS_KEY = 'perci_bars_ideas:v1';
const SETTINGS_KEY = 'perci_bars_ai_settings:v1';
const STATUS_OPTIONS = ['Inbox', 'New', 'Exploring', 'Building', 'Launched', 'Archived'];
const STATUS_ALIASES = {
    Shaping: 'Exploring',
    Shipped: 'Launched',
    Parked: 'Archived',
};
const API_PROVIDERS = [
    { id: 'openai', name: 'OpenAI', placeholder: 'sk-...' },
    { id: 'anthropic', name: 'Anthropic', placeholder: 'sk-ant-...' },
    { id: 'google', name: 'Google AI', placeholder: 'AIza...' },
    { id: 'groq', name: 'Groq', placeholder: 'gsk_...' },
    { id: 'openrouter', name: 'OpenRouter', placeholder: 'sk-or-...' },
];
const emptyForm = { title: '', notes: '', category: '', status: 'New', impact: '3', effort: '3', next: '', tags: '' };

function safeJson(value, fallback) {
    try {
        return JSON.parse(value || '') ?? fallback;
    } catch {
        return fallback;
    }
}

function normalizeIdea(idea = {}) {
    const now = new Date().toISOString();
    const incomingStatus = STATUS_ALIASES[idea.status] || idea.status;
    const status = STATUS_OPTIONS.includes(incomingStatus) ? incomingStatus : 'New';
    return {
        id: typeof idea.id === 'string' && idea.id ? idea.id : crypto.randomUUID(),
        kind: idea.kind || (status === 'Inbox' ? 'Thought' : 'Idea'),
        title: String(idea.title || 'Untitled').trim() || 'Untitled',
        notes: String(idea.notes || ''),
        category: String(idea.category || ''),
        status,
        impact: String(idea.impact || '3'),
        effort: String(idea.effort || '3'),
        next: String(idea.next || ''),
        tags: Array.isArray(idea.tags) ? idea.tags.map(String).filter(Boolean) : [],
        createdAt: idea.createdAt || now,
        updatedAt: idea.updatedAt || now,
    };
}

function loadIdeas() {
    return safeJson(localStorage.getItem(IDEAS_KEY), []).map(normalizeIdea);
}

function loadSettings() {
    const saved = safeJson(localStorage.getItem(SETTINGS_KEY), {});
    return { providerId: saved.providerId || '', model: saved.model || '' };
}

function scoreIdea(idea) {
    if (idea.status === 'Inbox') return 0;
    return Number(idea.impact) * 2 - Number(idea.effort) + (idea.status === 'Building' ? 2 : 0);
}

function relativeTime(value) {
    const days = Math.floor((Date.now() - new Date(value).getTime()) / 86400000);
    if (!Number.isFinite(days) || days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 30) return `${days}d ago`;
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

function formatDate(value) {
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));
}

function normalizeTags(value) {
    return String(value || '').split(',').map(tag => tag.trim()).filter(Boolean);
}

function countStatus(ideas, status) {
    return ideas.filter(idea => idea.status === status).length;
}

function captureStreak(ideas) {
    const days = new Set(ideas.map(idea => new Date(idea.createdAt).toDateString()));
    const cursor = new Date();
    let streak = 0;
    if (!days.has(cursor.toDateString())) cursor.setDate(cursor.getDate() - 1);
    while (days.has(cursor.toDateString())) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
}

function dots(value) {
    const count = Math.max(0, Math.min(5, Number(value) || 0));
    return '●'.repeat(count) + '○'.repeat(5 - count);
}

function providerLabel(provider) {
    if (!provider) return 'No provider';
    if (provider.kind === 'local') return `${provider.name} - local`;
    return provider.configured ? `${provider.name} - cloud` : `${provider.name} - add key`;
}

export default function BarsMode() {
    const initialIdeas = useMemo(() => loadIdeas(), []);
    const initialSettings = useMemo(() => loadSettings(), []);
    const [ideas, setIdeas] = useState(initialIdeas);
    const [activeId, setActiveId] = useState(initialIdeas[0]?.id || null);
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [sortKey, setSortKey] = useState('score');
    const [form, setForm] = useState(emptyForm);
    const [editingId, setEditingId] = useState('');
    const [quickText, setQuickText] = useState('');
    const [providers, setProviders] = useState([]);
    const [aiStatus, setAiStatus] = useState('Detecting providers');
    const [keyStatus, setKeyStatus] = useState({});
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [guideOpen, setGuideOpen] = useState(false);
    const [settingsMessage, setSettingsMessage] = useState('');
    const [keyDraft, setKeyDraft] = useState({});
    const [providerId, setProviderId] = useState(initialSettings.providerId);
    const [savedModel, setSavedModel] = useState(initialSettings.model);
    const [modelSearch, setModelSearch] = useState('');
    const [modelChoice, setModelChoice] = useState(initialSettings.model);
    const [customModel, setCustomModel] = useState('');
    const [question, setQuestion] = useState('');
    const [answer, setAnswer] = useState('');
    const [asking, setAsking] = useState(false);
    const [saveState, setSaveState] = useState('Saved locally');
    const importRef = useRef(null);
    const writeupRef = useRef(null);
    const titleInputRef = useRef(null);
    const saveStateTimerRef = useRef(null);

    const flashSaveState = useCallback((message) => {
        setSaveState(message);
        window.clearTimeout(saveStateTimerRef.current);
        saveStateTimerRef.current = window.setTimeout(() => setSaveState('Saved locally'), 2400);
    }, []);

    useEffect(() => () => window.clearTimeout(saveStateTimerRef.current), []);

    useEffect(() => {
        localStorage.setItem(IDEAS_KEY, JSON.stringify(ideas));
    }, [ideas]);

    useEffect(() => {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ providerId, model: modelChoice === '__custom' ? customModel : modelChoice }));
    }, [providerId, modelChoice, customModel]);

    const activeIdea = useMemo(() => ideas.find(idea => idea.id === activeId) || ideas[0] || null, [ideas, activeId]);
    const visibleProviders = useMemo(() => providers.filter(item => item.available || item.kind === 'cloud'), [providers]);
    const provider = useMemo(() => visibleProviders.find(item => item.id === providerId) || null, [visibleProviders, providerId]);
    const inboxCount = useMemo(() => countStatus(ideas, 'Inbox'), [ideas]);
    const buildingCount = useMemo(() => countStatus(ideas, 'Building'), [ideas]);
    const streak = useMemo(() => captureStreak(ideas), [ideas]);

    const filteredIdeas = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return ideas.filter(idea => {
            const haystack = [idea.title, idea.notes, idea.category, idea.next, idea.tags.join(' ')].join(' ').toLowerCase();
            return (!needle || haystack.includes(needle)) && (statusFilter === 'all' || idea.status === statusFilter);
        }).sort((a, b) => {
            if (sortKey === 'updated') return new Date(b.updatedAt) - new Date(a.updatedAt);
            if (sortKey === 'created') return new Date(b.createdAt) - new Date(a.createdAt);
            return scoreIdea(b) - scoreIdea(a);
        });
    }, [ideas, query, sortKey, statusFilter]);

    const modelOptions = useMemo(() => {
        const models = Array.isArray(provider?.models) ? provider.models : [];
        const ids = models.map(model => typeof model === 'string' ? model : model.id).filter(Boolean);
        const list = ids.length ? ids : [provider?.defaultModel].filter(Boolean);
        const needle = modelSearch.trim().toLowerCase();
        return needle ? list.filter(model => model.toLowerCase().includes(needle)) : list;
    }, [modelSearch, provider]);

    const selectedModel = modelChoice === '__custom' ? customModel.trim() : modelChoice;

    const detectProviders = useCallback(async () => {
        if (!window.electron?.detectBarsProviders) {
            setProviders([]);
            setAiStatus('Perci desktop is required for Bars AI');
            return;
        }
        setAiStatus('Detecting providers');
        try {
            const result = await window.electron.detectBarsProviders();
            const nextProviders = result.providers || [];
            const nextVisible = nextProviders.filter(item => item.available || item.kind === 'cloud');
            const statusMap = {};
            for (const item of result.keyStatus?.providers || []) statusMap[item.id] = item.configured;
            setProviders(nextProviders);
            setKeyStatus(statusMap);
            setProviderId(prev => prev && nextVisible.some(item => item.id === prev)
                ? prev
                : (result.selectedId && nextVisible.some(item => item.id === result.selectedId))
                    ? result.selectedId
                    : nextVisible.find(item => item.available)?.id || nextVisible[0]?.id || '');
            setAiStatus(nextVisible.some(item => item.available)
                ? nextVisible.filter(item => item.available).map(item => item.name).join(' + ')
                : 'Start LM Studio, Jan, or Ollama, or add a cloud key');
        } catch (err) {
            setProviders([]);
            setAiStatus(err?.message || 'Provider detection failed');
        }
    }, []);

    useEffect(() => { void detectProviders(); }, [detectProviders]);

    useEffect(() => {
        if (!provider) return;
        const available = (provider.models || []).map(model => typeof model === 'string' ? model : model.id).filter(Boolean);
        const fallback = provider.defaultModel || available[0] || '';
        const candidate = savedModel || modelChoice || fallback;
        if (provider.kind === 'cloud' && candidate && !available.includes(candidate)) {
            setModelChoice('__custom');
            setCustomModel(candidate);
        } else {
            setModelChoice(available.includes(candidate) ? candidate : fallback);
            setCustomModel('');
        }
        setSavedModel('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [provider?.id]);

    const patchForm = (field, value) => setForm(prev => ({ ...prev, [field]: value }));
    const resetForm = () => { setForm(emptyForm); setEditingId(''); };

    const saveIdea = (event) => {
        event.preventDefault();
        const title = form.title.trim();
        if (!title) return;
        const now = new Date().toISOString();
        const payload = normalizeIdea({ ...form, title, kind: form.status === 'Inbox' ? 'Thought' : 'Idea', tags: normalizeTags(form.tags), updatedAt: now });
        if (editingId) {
            setIdeas(list => list.map(idea => idea.id === editingId ? { ...idea, ...payload, id: editingId, createdAt: idea.createdAt } : idea));
            setActiveId(editingId);
        } else {
            const created = { ...payload, id: crypto.randomUUID(), createdAt: now };
            setIdeas(list => [created, ...list]);
            setActiveId(created.id);
        }
        resetForm();
        flashSaveState('Saved locally');
    };

    const quickCapture = (event) => {
        event.preventDefault();
        const text = quickText.trim();
        if (!text) return;
        const now = new Date().toISOString();
        const importedIdea = parseIdeaBrowserBar(text);
        const idea = normalizeIdea(importedIdea ? {
            ...importedIdea,
            id: crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
        } : {
            id: crypto.randomUUID(),
            kind: 'Thought',
            title: text.length > 70 ? `${text.slice(0, 67)}...` : text,
            notes: text,
            category: 'Quick thought',
            status: 'Inbox',
            impact: '1',
            effort: '1',
            tags: ['quick'],
            createdAt: now,
            updatedAt: now,
        });
        setIdeas(list => [idea, ...list]);
        setActiveId(idea.id);
        setQuickText('');
        flashSaveState(importedIdea ? 'IdeaBrowser idea saved' : 'Saved locally');
    };

    const editIdea = (idea, overrides = {}) => {
        if (!idea) return;
        const nextIdea = { ...idea, ...overrides };
        setEditingId(nextIdea.id);
        setForm({
            title: nextIdea.title,
            notes: nextIdea.notes,
            category: nextIdea.category,
            status: nextIdea.status,
            impact: nextIdea.impact,
            effort: nextIdea.effort,
            next: nextIdea.next,
            tags: nextIdea.tags.join(', '),
        });
        if (writeupRef.current) writeupRef.current.open = true;
        window.setTimeout(() => titleInputRef.current?.focus(), 0);
    };

    const deleteIdea = (id) => {
        setIdeas(list => {
            const next = list.filter(idea => idea.id !== id);
            if (activeId === id) setActiveId(next[0]?.id || null);
            return next;
        });
        if (editingId === id) resetForm();
        flashSaveState('Saved locally');
    };

    const promoteIdea = (idea) => {
        if (!idea) return;
        editIdea(idea, {
            kind: 'Idea',
            status: 'New',
            impact: idea.impact === '1' ? '3' : idea.impact,
            effort: idea.effort === '1' ? '3' : idea.effort,
        });
    };

    const exportIdeas = () => {
        const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), ideas }, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `perci-bars-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(url), 1500);
        flashSaveState(`Exported ${ideas.length} ${ideas.length === 1 ? 'bar' : 'bars'} ✓`);
    };

    const importIdeas = async (event) => {
        const file = event.target.files?.[0];
        if (!file) return;
        try {
            const imported = safeJson(await file.text(), null);
            const incoming = Array.isArray(imported) ? imported : imported?.ideas;
            if (!Array.isArray(incoming)) throw new Error('No ideas array found');
            setIdeas(list => {
                const byId = new Map(list.map(idea => [idea.id, idea]));
                incoming.map(normalizeIdea).forEach(idea => byId.set(idea.id, idea));
                const next = Array.from(byId.values()).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
                setActiveId(next[0]?.id || null);
                return next;
            });
            flashSaveState(`Imported ${incoming.length} ${incoming.length === 1 ? 'bar' : 'bars'} ✓`);
        } catch (err) {
            setAiStatus(err?.message || 'Import failed');
        } finally {
            event.target.value = '';
        }
    };

    const saveKeys = async (event) => {
        event.preventDefault();
        if (!window.electron?.saveBarsApiKeys) return;
        try {
            const status = await window.electron.saveBarsApiKeys(keyDraft);
            const statusMap = {};
            for (const item of status.providers || []) statusMap[item.id] = item.configured;
            setKeyStatus(statusMap);
            setKeyDraft({});
            setSettingsMessage('Saved securely');
            await detectProviders();
        } catch (err) {
            setSettingsMessage(err?.message || 'Could not save keys');
        }
    };

    const clearKeys = async () => {
        if (!window.electron?.clearBarsApiKeys) return;
        try {
            const status = await window.electron.clearBarsApiKeys();
            const statusMap = {};
            for (const item of status.providers || []) statusMap[item.id] = item.configured;
            setKeyStatus(statusMap);
            setSettingsMessage('Cleared Bars cloud keys');
            await detectProviders();
        } catch (err) {
            setSettingsMessage(err?.message || 'Could not clear keys');
        }
    };

    const askBars = async (event) => {
        event.preventDefault();
        if (!window.electron?.askBars || !question.trim() || !provider) return;
        setAsking(true);
        setAnswer('Thinking...');
        try {
            const result = await window.electron.askBars({ providerId: provider.id, model: selectedModel || provider.defaultModel, question: question.trim(), ideas });
            setAnswer(result.answer || 'No response text returned.');
        } catch (err) {
            setAnswer(err?.message || 'AI request failed.');
        } finally {
            setAsking(false);
        }
    };

    return (
        <div className="bars-root">
            <div className="bars-topbar">
                <div>
                    <p className="bars-label">The notebook</p>
                    <h1>BARS<span className="bars-cursor-block" aria-hidden="true" /></h1>
                    <p className="bars-tagline">Catch every line before it fades.</p>
                </div>
                <div className="bars-actions">
                    <button type="button" className="bars-icon-btn" onClick={() => setGuideOpen(true)} title="Bars guide"><HelpCircle size={17} /></button>
                    <button type="button" className="bars-icon-btn" onClick={exportIdeas} title="Export Bars"><Download size={17} /></button>
                    <button type="button" className="bars-icon-btn" onClick={() => importRef.current?.click()} title="Import Bars"><Upload size={17} /></button>
                    <input ref={importRef} className="bars-hidden-input" type="file" accept="application/json,.json" onChange={importIdeas} />
                    <button type="button" className="bars-icon-btn" onClick={() => setSettingsOpen(true)} title="Bars settings"><Settings size={17} /></button>
                </div>
            </div>

            <form className="bars-capture" onSubmit={quickCapture}>
                <span className="bars-rec-dot" aria-hidden="true" />
                <div className="bars-capture-field">
                    <textarea
                        value={quickText}
                        onChange={event => setQuickText(event.target.value)}
                        onKeyDown={event => {
                            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') quickCapture(event);
                        }}
                        placeholder="Drop a bar - a line, a thought, an IdeaBrowser link..."
                        rows={1}
                    />
                </div>
                <button type="submit">Catch it</button>
                <p className="bars-capture-hint"><span className="bars-kbd">⌘↵</span> to catch it · {inboxCount} in the inbox · {saveState}</p>
            </form>

            <div className="bars-stats" aria-label="Bars stats">
                <span><strong>{ideas.length}</strong> bars in the book</span>
                <span><strong>{inboxCount}</strong> in the inbox</span>
                <span><strong>{buildingCount}</strong> in the works</span>
                <span><strong>{streak}</strong> day streak</span>
            </div>

            <section className="bars-ai-panel" aria-label="Ask your bars">
                <div className="bars-section-head">
                    <div><h2>Ask your bars</h2><p className="bars-ai-status">{aiStatus}</p></div>
                    <div className="bars-ai-provider-controls">
                        <select value={providerId} onChange={event => { setProviderId(event.target.value); setModelSearch(''); }}>
                            {visibleProviders.length ? visibleProviders.map(item => <option key={item.id} value={item.id}>{providerLabel(item)}</option>) : <option value="">No AI provider configured</option>}
                        </select>
                        <input value={modelSearch} onChange={event => setModelSearch(event.target.value)} placeholder="Search models" />
                        <select value={modelChoice} onChange={event => setModelChoice(event.target.value)}>
                            {modelOptions.map(model => <option key={model} value={model}>{model}</option>)}
                            {provider?.kind === 'cloud' && <option value="__custom">Custom model...</option>}
                        </select>
                        {modelChoice === '__custom' && <input value={customModel} onChange={event => setCustomModel(event.target.value)} placeholder="provider/model-id" />}
                        <button type="button" className="bars-icon-btn" onClick={detectProviders} title="Refresh providers"><RefreshCw size={15} /></button>
                    </div>
                </div>
                <form className="bars-ai-controls" onSubmit={askBars}>
                    <textarea value={question} onChange={event => setQuestion(event.target.value)} placeholder="Ask about patterns, next moves, or what is worth building." rows={2} />
                    <button type="submit" className="bars-primary" disabled={!provider || !selectedModel || !question.trim() || asking}><Bot size={15} /> {asking ? 'Thinking...' : 'Ask'}</button>
                </form>
                <div className="bars-answer">{answer}</div>
            </section>

            <div className="bars-main">
                <aside className="bars-list-panel">
                    <div className="bars-filter-row">
                        <label className="bars-search"><Search size={14} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search bars" /></label>
                        <select value={sortKey} onChange={event => setSortKey(event.target.value)} title="Sort bars">
                            <option value="score">Hottest first</option>
                            <option value="updated">Recently updated</option>
                            <option value="created">Recently caught</option>
                        </select>
                    </div>
                    <div className="bars-chip-row">
                        {['all', ...STATUS_OPTIONS].map(status => (
                            <button key={status} type="button" className={statusFilter === status ? 'is-active' : ''} onClick={() => setStatusFilter(status)}>
                                {status === 'all' ? 'All' : status}
                            </button>
                        ))}
                    </div>
                    <div className="bars-list">
                        {filteredIdeas.length ? filteredIdeas.map(idea => (
                            <button key={idea.id} type="button" className={'bars-card' + (idea.id === activeIdea?.id ? ' is-active' : '')} onClick={() => setActiveId(idea.id)}>
                                <span className="bars-card-head"><strong>{idea.title}</strong><em>{idea.status === 'Inbox' ? 'Inbox' : `Heat ${scoreIdea(idea)}`}</em></span>
                                {idea.notes !== idea.title && <span className="bars-card-notes">{idea.notes || 'No notes yet.'}</span>}
                                <span className="bars-card-meta"><span className="bars-status-pill" data-status={idea.status}>{idea.status}</span><span>{idea.category || idea.kind || 'Uncategorized'}</span><span>{relativeTime(idea.updatedAt)}</span></span>
                                {idea.tags.length > 0 && <span className="bars-tag-row">{idea.tags.slice(0, 3).map(tag => <span key={tag}>#{tag}</span>)}</span>}
                            </button>
                        )) : <div className="bars-empty">No bars match this view.</div>}
                    </div>
                </aside>

                <section className="bars-detail-panel">
                    <div className="bars-section-head">
                        <div className="bars-detail-title">
                            <h2>On the page</h2>
                            <span className="bars-detail-score">{activeIdea ? activeIdea.status === 'Inbox' ? 'Inbox' : `Heat ${scoreIdea(activeIdea)}` : '—'}</span>
                        </div>
                        <div className="bars-detail-actions">
                            {activeIdea?.status === 'Inbox' && <button type="button" onClick={() => promoteIdea(activeIdea)}><Sparkles size={14} /> Turn into idea</button>}
                            {activeIdea && (
                                <>
                                    <button type="button" onClick={() => editIdea(activeIdea)}><Edit3 size={14} /> Edit</button>
                                    <button type="button" className="is-danger" onClick={() => deleteIdea(activeIdea.id)}><Trash2 size={14} /></button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="bars-detail-scroll">
                        {activeIdea ? (
                            <div className="bars-detail">
                                <h3>{activeIdea.title}</h3>
                                {activeIdea.notes !== activeIdea.title && <p>{activeIdea.notes || 'No notes yet.'}</p>}
                                <dl>
                                    <dt>Status</dt><dd>{activeIdea.status}</dd>
                                    {activeIdea.status === 'Inbox' ? (
                                        <><dt>Captured</dt><dd>{formatDate(activeIdea.createdAt)}</dd></>
                                    ) : (
                                        <>
                                            <dt>Category</dt><dd>{activeIdea.category || activeIdea.kind || 'Uncategorized'}</dd>
                                            <dt>Impact</dt><dd className="bars-dots">{dots(activeIdea.impact)}</dd>
                                            <dt>Effort</dt><dd className="bars-dots">{dots(activeIdea.effort)}</dd>
                                            <dt>Next</dt><dd>{activeIdea.next || 'No next action set.'}</dd>
                                        </>
                                    )}
                                    <dt>Tags</dt><dd>{activeIdea.tags.map(tag => `#${tag}`).join(' ') || 'None'}</dd>
                                </dl>
                            </div>
                        ) : <div className="bars-empty">Capture or import a bar to start.</div>}

                        <details ref={writeupRef} className="bars-writeup">
                            <summary>{editingId ? 'Edit details' : 'Write one up properly'}</summary>
                            <form className="bars-form" onSubmit={saveIdea}>
                                <label>
                                    <span>Title</span>
                                    <input ref={titleInputRef} value={form.title} onChange={event => patchForm('title', event.target.value)} placeholder="Voice note summary, feature, business idea..." required />
                                </label>
                                <label>
                                    <span>Why it matters</span>
                                    <textarea value={form.notes} onChange={event => patchForm('notes', event.target.value)} placeholder="Problem, audience, rough solution, links, objections..." rows={5} />
                                </label>
                                <div className="bars-form-grid">
                                    <label>
                                        <span>Category</span>
                                        <input value={form.category} onChange={event => patchForm('category', event.target.value)} placeholder="Product" />
                                    </label>
                                    <label>
                                        <span>Status</span>
                                        <select value={form.status} onChange={event => patchForm('status', event.target.value)}>
                                            {STATUS_OPTIONS.map(status => <option key={status} value={status}>{status}</option>)}
                                        </select>
                                    </label>
                                    <label>
                                        <span>Impact</span>
                                        <input type="range" min="1" max="5" value={form.impact} onChange={event => patchForm('impact', event.target.value)} />
                                    </label>
                                    <label>
                                        <span>Effort</span>
                                        <input type="range" min="1" max="5" value={form.effort} onChange={event => patchForm('effort', event.target.value)} />
                                    </label>
                                </div>
                                <label>
                                    <span>Next action</span>
                                    <input value={form.next} onChange={event => patchForm('next', event.target.value)} placeholder="Validate with 3 users, build sketch, price it..." />
                                </label>
                                <label>
                                    <span>Tags</span>
                                    <input value={form.tags} onChange={event => patchForm('tags', event.target.value)} placeholder="mobile, ai, weekend" />
                                </label>
                                <div className="bars-form-actions">
                                    <button type="submit" className="bars-primary"><CheckCircle2 size={15} /> {editingId ? 'Save changes' : 'Save it'}</button>
                                    <button type="button" onClick={resetForm}>Clear</button>
                                </div>
                            </form>
                        </details>
                    </div>
                </section>

            </div>

            {guideOpen && (
                <div className="bars-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setGuideOpen(false); }}>
                    <div className="bars-modal bars-guide-modal" role="dialog" aria-modal="true" aria-label="Bars guide">
                        <div className="bars-section-head">
                            <div><p className="bars-label">Field manual</p><h2>How to run the book</h2></div>
                            <button type="button" className="bars-icon-btn" onClick={() => setGuideOpen(false)} title="Close guide"><X size={16} /></button>
                        </div>
                        <div className="bars-guide-hero">
                            <p>BARS is not storage. BARS is a pressure system for raw lines, half-ideas, links, and hunches until one of them is worth building.</p>
                        </div>
                        <div className="bars-guide-grid">
                            <section>
                                <span>01</span>
                                <h3>Catch first</h3>
                                <p>Drop the messy sentence before it gets polite. A bar can be a line, a URL, an IdeaBrowser email, or the ugly version of a better thought.</p>
                            </section>
                            <section>
                                <span>02</span>
                                <h3>Shape later</h3>
                                <p>Inbox is for sparks. Turn into idea when it has a title, stakes, tags, impact, effort, and one next move.</p>
                            </section>
                            <section>
                                <span>03</span>
                                <h3>Sort by heat</h3>
                                <p>Impact minus effort keeps the loudest note from winning by volume. Hot bars rise because they might move.</p>
                            </section>
                            <section>
                                <span>04</span>
                                <h3>Ask the book</h3>
                                <p>Use Ask your bars when the notebook gets crowded. Patterns, repeats, dead ends, and next actions are easier to see from above.</p>
                            </section>
                        </div>
                        <div className="bars-guide-rules">
                            <p className="bars-label">House rules</p>
                            <ul>
                                <li>Capture tiny. Rewrite only when the thought earns it.</li>
                                <li>Every real idea needs a next action, not just a nicer paragraph.</li>
                                <li>Archive what stops pulling. The book should feel alive.</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}

            {settingsOpen && (
                <div className="bars-modal-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setSettingsOpen(false); }}>
                    <div className="bars-modal" role="dialog" aria-modal="true" aria-label="Bars settings">
                        <div className="bars-section-head">
                            <div><p className="bars-label">Settings</p><h2>Bars API keys</h2></div>
                            <button type="button" className="bars-icon-btn" onClick={() => setSettingsOpen(false)} title="Close settings"><X size={16} /></button>
                        </div>
                        <form className="bars-key-form" onSubmit={saveKeys}>
                            {API_PROVIDERS.map(item => (
                                <label key={item.id}>
                                    <span><KeyRound size={13} />{item.name}<em>{keyStatus[item.id] ? 'Configured' : 'Not set'}</em></span>
                                    <input
                                        type="password"
                                        value={keyDraft[item.id] || ''}
                                        onChange={event => setKeyDraft(prev => ({ ...prev, [item.id]: event.target.value }))}
                                        placeholder={keyStatus[item.id] ? 'Saved securely - enter a new key to replace' : item.placeholder}
                                        autoComplete="off"
                                    />
                                </label>
                            ))}
                            <p className="bars-settings-note">Keys are stored through Opal/Electron secure app data. They are not exported with Bars and are not shared with standalone Bars.</p>
                            <div className="bars-modal-actions">
                                <button type="button" onClick={clearKeys}>Clear keys</button>
                                <span>{settingsMessage}</span>
                                <button type="submit" className="bars-primary">Save keys</button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
