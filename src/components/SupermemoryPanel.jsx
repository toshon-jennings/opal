import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Activity,
    AlertCircle,
    CheckCircle2,
    Database,
    Folder,
    KeyRound,
    Loader2,
    Play,
    RefreshCw,
    Search,
    Square,
} from 'lucide-react';
import SupermemoryClient from '../lib/supermemory';
import './SupermemoryPanel.css';

const DEFAULT_CONFIG = {
    enabled: false,
    apiKey: '',
    provider: 'openrouter',
    providerKey: '',
    openrouterKey: '',
    modelBaseURL: 'https://openrouter.ai/api/v1',
    model: 'anthropic/claude-sonnet-4',
    dataDir: '',
    containerTag: 'perci_memory',
    binaryPath: '',
    port: 6768,
    baseURL: 'http://localhost:6768',
};

const MODEL_PROVIDER_OPTIONS = [
    { id: 'openrouter', label: 'OpenRouter', baseURL: 'https://openrouter.ai/api/v1', needsKey: true },
    { id: 'openai', label: 'OpenAI', baseURL: 'https://api.openai.com/v1', needsKey: true },
    { id: 'anthropic', label: 'Anthropic', baseURL: 'https://api.anthropic.com/v1', needsKey: true },
    { id: 'mistral', label: 'Mistral', baseURL: 'https://api.mistral.ai/v1', needsKey: true },
    { id: 'groq', label: 'Groq', baseURL: 'https://api.groq.com/openai/v1', needsKey: true },
    { id: 'gemini', label: 'Gemini', baseURL: '', needsKey: true },
    { id: 'ollama', label: 'Ollama', baseURL: 'http://localhost:11434/v1', needsKey: false },
    { id: 'lmstudio', label: 'LM Studio', baseURL: 'http://localhost:1234/v1', needsKey: false },
    { id: 'jan', label: 'Jan', baseURL: 'http://localhost:1337/v1', needsKey: false },
];

function providerMeta(provider) {
    return MODEL_PROVIDER_OPTIONS.find(option => option.id === provider) || MODEL_PROVIDER_OPTIONS[0];
}

function resultItems(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.results)) return payload.results;
    if (Array.isArray(payload?.documents)) return payload.documents;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.data?.results)) return payload.data.results;
    return [];
}

function resultText(item) {
    return item?.content || item?.text || item?.document?.content || item?.title || item?.id || 'Memory result';
}

function shortPath(value) {
    if (!value) return 'Not set';
    const home = typeof window !== 'undefined' ? window?.process?.env?.HOME || '' : '';
    return home && value.startsWith(home) ? `~${value.slice(home.length)}` : value;
}

export default function SupermemoryPanel({ onBackendChange = null }) {
    const [config, setConfig] = useState(DEFAULT_CONFIG);
    const [status, setStatus] = useState(null);
    const [progress, setProgress] = useState(null);
    const [message, setMessage] = useState(null);
    const [busy, setBusy] = useState('');
    const [query, setQuery] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searchError, setSearchError] = useState('');
    const [searching, setSearching] = useState(false);
    const pollRef = useRef(null);

    const hasBridge = Boolean(window.electron?.supermemoryStatus);
    const state = status?.state || 'idle';
    const running = Boolean(status?.running);
    const statusLabel = running ? 'Running' : state === 'port-conflict' ? 'Port conflict' : state === 'not-installed' ? 'Not installed' : 'Stopped';
    const selectedProvider = providerMeta(config.provider || 'openrouter');
    const hasProviderKey = Boolean(config.providerKey || config.openrouterKey || status?.hasProviderKey);
    const providerCredentialLabel = selectedProvider.needsKey
        ? hasProviderKey
            ? `Uses Perci's saved ${selectedProvider.label} key`
            : `Add a ${selectedProvider.label} key in Settings > Models`
        : `Uses ${selectedProvider.label} local endpoint`;

    const client = useMemo(() => (
        new SupermemoryClient(config.baseURL || `http://localhost:${config.port || 6768}`, config.apiKey)
    ), [config.apiKey, config.baseURL, config.port]);

    const loadConfig = useCallback(async () => {
        if (!window.electron?.supermemoryConfig) return;
        const next = await window.electron.supermemoryConfig();
        if (next && !next.error) {
            setConfig(prev => ({ ...prev, ...next }));
        }
    }, []);

    const loadStatus = useCallback(async () => {
        if (!window.electron?.supermemoryStatus) return;
        const next = await window.electron.supermemoryStatus();
        setStatus(next || null);
        if (next?.apiKey && !config.apiKey) {
            setConfig(prev => ({ ...prev, apiKey: next.apiKey }));
        }
    }, [config.apiKey]);

    useEffect(() => {
        void loadConfig();
        void loadStatus();
        return () => {
            if (pollRef.current) clearInterval(pollRef.current);
        };
    }, [loadConfig, loadStatus]);

    const saveConfig = useCallback(async (patch) => {
        const next = { ...config, ...patch };
        setConfig(next);
        if (!window.electron?.supermemoryConfig) return next;
        const safePatch = { ...patch };
        delete safePatch.providerKey;
        delete safePatch.openrouterKey;
        const saved = await window.electron.supermemoryConfig(safePatch);
        if (saved && !saved.error) {
            setConfig(prev => ({ ...prev, ...saved }));
            if (Object.prototype.hasOwnProperty.call(patch, 'enabled')) {
                const backend = saved.enabled ? 'supermemory' : 'memu';
                onBackendChange?.(backend);
                window.dispatchEvent(new CustomEvent('perci-memory-backend-change', { detail: { backend } }));
            }
        }
        return saved || next;
    }, [config, onBackendChange]);

    const pollProgress = useCallback(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = setInterval(async () => {
            try {
                const nextProgress = await window.electron?.supermemoryProgress?.();
                setProgress(nextProgress || null);
                const nextStatus = await window.electron?.supermemoryStatus?.();
                setStatus(nextStatus || null);
                if (nextProgress?.done || nextStatus?.running || nextProgress?.error) {
                    clearInterval(pollRef.current);
                    pollRef.current = null;
                    setBusy('');
                }
            } catch (err) {
                setMessage({ text: err.message, error: true });
                clearInterval(pollRef.current);
                pollRef.current = null;
                setBusy('');
            }
        }, 1000);
    }, []);

    const start = useCallback(async () => {
        if (!window.electron?.supermemoryStart) return;
        setBusy('start');
        setMessage(null);
        setProgress({ step: 0, label: 'Starting Supermemory' });
        await saveConfig(config);
        const result = await window.electron.supermemoryStart();
        if (!result?.ok && result?.error) {
            setMessage({ text: result.error, error: true });
        } else {
            setMessage({ text: 'Supermemory is running.', error: false });
        }
        await loadStatus();
        pollProgress();
        setBusy('');
    }, [config, loadStatus, pollProgress, saveConfig]);

    const stop = useCallback(async () => {
        if (!window.electron?.supermemoryStop) return;
        setBusy('stop');
        setMessage(null);
        const result = await window.electron.supermemoryStop();
        if (!result?.ok && result?.error) setMessage({ text: result.error, error: true });
        await loadStatus();
        setBusy('');
    }, [loadStatus]);

    const restart = useCallback(async () => {
        if (!window.electron?.supermemoryRestart) return;
        setBusy('restart');
        setMessage(null);
        await saveConfig(config);
        const result = await window.electron.supermemoryRestart();
        if (!result?.ok && result?.error) {
            setMessage({ text: result.error, error: true });
        } else {
            setMessage({ text: 'Supermemory is running.', error: false });
        }
        await loadStatus();
        pollProgress();
        setBusy('');
    }, [config, loadStatus, pollProgress, saveConfig]);

    const runSearch = useCallback(async (event) => {
        event?.preventDefault?.();
        if (!query.trim()) return;
        setSearching(true);
        setSearchError('');
        try {
            const payload = await client.search(query.trim(), config.containerTag || 'perci_memory');
            setSearchResults(resultItems(payload));
        } catch (err) {
            setSearchError(err.message || 'Search failed');
            setSearchResults([]);
        } finally {
            setSearching(false);
        }
    }, [client, config.containerTag, query]);

    if (!hasBridge) {
        return (
            <div className="supermemory-panel">
                <div className="supermemory-empty">
                    <Database size={22} />
                    <h2>Supermemory requires the desktop app</h2>
                    <p>Open Perci from Electron to manage the local binary.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="supermemory-panel">
            <header className="supermemory-header">
                <div>
                    <p className="supermemory-kicker">
                        <Database size={14} />
                        Memory backend
                    </p>
                    <h1>Supermemory</h1>
                    <p>Self-hosted binary on localhost:{config.port || 6768} using your Perci model provider.</p>
                </div>
                <div className={`supermemory-status-pill ${running ? 'is-running' : state === 'port-conflict' ? 'is-error' : ''}`}>
                    {running ? <CheckCircle2 size={15} /> : <AlertCircle size={15} />}
                    {statusLabel}
                </div>
            </header>

            <section className="supermemory-grid">
                <article className="supermemory-card supermemory-status-card">
                    <div className="supermemory-card-head">
                        <h2>Status</h2>
                        <button type="button" onClick={loadStatus} className="supermemory-icon-btn" title="Refresh status">
                            <RefreshCw size={15} />
                        </button>
                    </div>
                    <div className="supermemory-metrics">
                        <div>
                            <span>Model</span>
                            <strong>{config.model || status?.model || 'Not set'}</strong>
                        </div>
                        <div>
                            <span>Binary</span>
                            <strong>{status?.version || (status?.binaryFound ? 'Installed' : 'Missing')}</strong>
                        </div>
                        <div>
                            <span>Stored items</span>
                            <strong>{status?.memoryCount ?? '—'}</strong>
                        </div>
                    </div>
                    <div className="supermemory-detail-list">
                        <span><Folder size={13} /> {shortPath(config.dataDir || status?.dataDir)}</span>
                        <span><KeyRound size={13} /> {providerCredentialLabel}</span>
                        <span><KeyRound size={13} /> {config.apiKey ? 'Local instance key captured' : 'Local instance key auto-generates on first boot'}</span>
                        <span><Activity size={13} /> {progress?.label || status?.health?.endpoint || 'Idle'}</span>
                    </div>
                    {(message || status?.error || progress?.error) && (
                        <p className={`supermemory-notice ${message && !message.error && !status?.error && !progress?.error ? 'is-success' : 'is-error'}`}>
                            {message?.text || status?.error || progress?.error}
                        </p>
                    )}
                    <div className="supermemory-actions">
                        <button type="button" onClick={start} disabled={Boolean(busy) || running} className="supermemory-primary-btn">
                            {busy === 'start' ? <Loader2 size={15} className="animate-spin" /> : <Play size={15} />}
                            Start
                        </button>
                        <button type="button" onClick={stop} disabled={Boolean(busy) || !running} className="supermemory-secondary-btn">
                            {busy === 'stop' ? <Loader2 size={15} className="animate-spin" /> : <Square size={14} />}
                            Stop
                        </button>
                        <button type="button" onClick={restart} disabled={Boolean(busy)} className="supermemory-secondary-btn">
                            {busy === 'restart' ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />}
                            Restart
                        </button>
                    </div>
                </article>

                <article className="supermemory-card">
                    <div className="supermemory-card-head">
                        <h2>Backend Settings</h2>
                        <span>{config.enabled ? 'Active' : 'Available'}</span>
                    </div>
                    <div className="supermemory-backend-choice" aria-label="Active memory backend">
                        <button
                            type="button"
                            className={config.enabled ? 'is-selected' : ''}
                            onClick={() => saveConfig({ enabled: true })}
                        >
                            <strong>Supermemory</strong>
                            <span>Local binary backend</span>
                        </button>
                        <button
                            type="button"
                            className={!config.enabled ? 'is-selected' : ''}
                            onClick={() => saveConfig({ enabled: false })}
                        >
                            <strong>memU Docker</strong>
                            <span>memU Docker stack</span>
                        </button>
                    </div>
                    <div className="supermemory-form-grid">
                        <div className="supermemory-key-note">
                            <span>Provider key</span>
                            <strong>{providerCredentialLabel}</strong>
                            <p>Supermemory reads the key already stored in Perci&apos;s Models settings; its local instance key is generated automatically.</p>
                        </div>
                        <label>
                            <span>Model provider</span>
                            <select
                                value={config.provider || 'openrouter'}
                                onChange={(event) => {
                                    const nextProvider = event.target.value;
                                    const nextProviderMeta = providerMeta(nextProvider);
                                    const patch = {
                                        provider: nextProvider,
                                        modelBaseURL: nextProviderMeta.baseURL || config.modelBaseURL || '',
                                    };
                                    setConfig(prev => ({ ...prev, ...patch }));
                                    void saveConfig(patch);
                                }}
                            >
                                {MODEL_PROVIDER_OPTIONS.map(option => (
                                    <option key={option.id} value={option.id}>{option.label}</option>
                                ))}
                            </select>
                        </label>
                        <label>
                            <span>Model</span>
                            <input
                                value={config.model || ''}
                                onChange={event => setConfig(prev => ({ ...prev, model: event.target.value }))}
                                onBlur={() => saveConfig({ model: config.model || '' })}
                                placeholder="anthropic/claude-sonnet-4"
                                spellCheck={false}
                            />
                        </label>
                        <label className="is-wide">
                            <span>Model API base URL</span>
                            <input
                                value={config.modelBaseURL || ''}
                                onChange={event => setConfig(prev => ({ ...prev, modelBaseURL: event.target.value }))}
                                onBlur={() => saveConfig({ modelBaseURL: config.modelBaseURL || selectedProvider.baseURL || '' })}
                                placeholder={selectedProvider.baseURL || 'Provider endpoint'}
                                spellCheck={false}
                            />
                        </label>
                        <label>
                            <span>Port</span>
                            <input
                                type="number"
                                min="1024"
                                max="65535"
                                value={config.port || 6768}
                                onChange={event => setConfig(prev => ({ ...prev, port: event.target.value }))}
                                onBlur={() => saveConfig({ port: config.port || 6768 })}
                                spellCheck={false}
                            />
                        </label>
                        <label>
                            <span>Container tag</span>
                            <input
                                value={config.containerTag || ''}
                                onChange={event => setConfig(prev => ({ ...prev, containerTag: event.target.value }))}
                                onBlur={() => saveConfig({ containerTag: config.containerTag || 'perci_memory' })}
                                placeholder="perci_memory"
                                spellCheck={false}
                            />
                        </label>
                        <label className="is-wide">
                            <span>Data directory</span>
                            <input
                                value={config.dataDir || ''}
                                onChange={event => setConfig(prev => ({ ...prev, dataDir: event.target.value }))}
                                onBlur={() => saveConfig({ dataDir: config.dataDir || '' })}
                                spellCheck={false}
                            />
                        </label>
                        <label className="is-wide">
                            <span>Binary path</span>
                            <input
                                value={config.binaryPath || ''}
                                onChange={event => setConfig(prev => ({ ...prev, binaryPath: event.target.value }))}
                                onBlur={() => saveConfig({ binaryPath: config.binaryPath || '' })}
                                placeholder="Auto-detect"
                                spellCheck={false}
                            />
                        </label>
                    </div>
                </article>

                <article className="supermemory-card supermemory-search-card">
                    <div className="supermemory-card-head">
                        <h2>Quick Search</h2>
                        <span>{config.containerTag || 'perci_memory'}</span>
                    </div>
                    <form className="supermemory-search" onSubmit={runSearch}>
                        <Search size={15} />
                        <input
                            value={query}
                            onChange={event => setQuery(event.target.value)}
                            placeholder="Search memories"
                        />
                        <button type="submit" disabled={searching || !query.trim()}>
                            {searching ? <Loader2 size={14} className="animate-spin" /> : 'Search'}
                        </button>
                    </form>
                    {searchError && <p className="supermemory-error">{searchError}</p>}
                    <div className="supermemory-results">
                        {searchResults.length > 0 ? searchResults.map((item, index) => (
                            <article key={item?.id || item?.documentId || index} className="supermemory-result">
                                <p>{resultText(item)}</p>
                                {(item?.score || item?.similarity) && (
                                    <span>{Number(item.score || item.similarity).toFixed(3)}</span>
                                )}
                            </article>
                        )) : (
                            <p className="supermemory-empty-line">
                                {query ? 'No results loaded.' : 'Search results appear here.'}
                            </p>
                        )}
                    </div>
                </article>
            </section>
        </div>
    );
}
