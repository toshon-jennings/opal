import React, { useState, useEffect, useCallback } from 'react';
import { Cpu, Plus, Trash2, Check, RefreshCw, Server, AlertCircle } from 'lucide-react';

// Parses OpenClaw's "provider/model-id" primary-model string.
function parsePrimary(primary) {
    if (!primary || typeof primary !== 'string') return { provider: null, id: null };
    const idx = primary.indexOf('/');
    if (idx === -1) return { provider: null, id: primary };
    return { provider: primary.slice(0, idx), id: primary.slice(idx + 1) };
}

// Native replacement for the busy OpenClaw dashboard's model settings.
// Reads/writes ~/.openclaw/openclaw.json directly via the Electron bridge and
// applies changes with a gateway restart (the same flow Perci's Settings uses).
export function OpenClawModelsPanel() {
    const [config, setConfig] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [addProvider, setAddProvider] = useState('');
    const [newId, setNewId] = useState('');
    const [newName, setNewName] = useState('');
    const [dirty, setDirty] = useState(false);
    const [applying, setApplying] = useState(false);
    const [status, setStatus] = useState('');

    const load = useCallback(async () => {
        if (!window.electron?.readOpenClawConfig) {
            setError('not-electron');
            setLoading(false);
            return;
        }
        setLoading(true);
        try {
            const cfg = await window.electron.readOpenClawConfig();
            if (cfg && !cfg.error) {
                setConfig(cfg);
                setError(null);
                const provs = Object.keys(cfg.models?.providers || {});
                setAddProvider(prev => prev || provs[0] || '');
            } else {
                setError(cfg?.error || 'Failed to load OpenClaw config');
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const persist = async (next) => {
        setConfig(next);
        setDirty(true);
        try {
            const res = await window.electron.writeOpenClawConfig(next);
            if (!res?.ok) setStatus('Could not save config.');
        } catch (err) {
            setStatus('Save failed: ' + err.message);
        }
    };

    const providers = config?.models?.providers || {};
    const providerIds = Object.keys(providers);
    const primary = config?.agents?.defaults?.model?.primary;
    const active = parsePrimary(primary);

    const setActive = (provider, id) => {
        const next = structuredClone(config);
        next.agents = next.agents || {};
        next.agents.defaults = next.agents.defaults || {};
        next.agents.defaults.model = next.agents.defaults.model || {};
        next.agents.defaults.model.primary = `${provider}/${id}`;
        persist(next);
    };

    const addModel = () => {
        const id = newId.trim();
        if (!id || !addProvider) return;
        const next = structuredClone(config);
        const prov = next.models?.providers?.[addProvider];
        if (!prov) return;
        prov.models = prov.models || [];
        if (prov.models.some(m => m.id === id)) {
            setStatus('That model is already in this provider.');
            return;
        }
        prov.models.push({
            id,
            name: newName.trim() || id,
            input: ['text'],
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }
        });
        persist(next);
        setNewId('');
        setNewName('');
        setStatus('');
    };

    const removeModel = (provider, id) => {
        const next = structuredClone(config);
        const prov = next.models?.providers?.[provider];
        if (!prov) return;
        prov.models = (prov.models || []).filter(m => m.id !== id);
        persist(next);
    };

    const applyRestart = async () => {
        if (!window.electron?.restartOpenClawGateway) return;
        setApplying(true);
        setStatus('Restarting gateway…');
        try {
            const res = await window.electron.restartOpenClawGateway();
            if (res?.ok) {
                setDirty(false);
                setStatus('Applied — gateway restarted.');
                setTimeout(() => setStatus(''), 3000);
            } else {
                setStatus('Restart failed: ' + (res?.error || 'unknown error'));
            }
        } catch (err) {
            setStatus('Restart failed: ' + err.message);
        } finally {
            setApplying(false);
        }
    };

    if (loading) {
        return (
            <div className="flex-1 min-h-0 flex items-center justify-center text-sm text-[var(--text-tertiary)]">
                <RefreshCw size={15} className="animate-spin mr-2" /> Loading models…
            </div>
        );
    }

    if (error === 'not-electron') {
        return (
            <div className="flex-1 min-h-0 flex items-center justify-center p-8 text-center">
                <p className="text-sm text-[var(--text-secondary)] max-w-sm">
                    Model management is only available in the Perci desktop app.
                </p>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 min-h-0 flex items-center justify-center p-8">
                <div className="max-w-md text-center">
                    <div className="mx-auto mb-4 w-12 h-12 rounded-xl border border-red-500/30 bg-red-500/10 flex items-center justify-center">
                        <AlertCircle size={22} className="text-red-400" />
                    </div>
                    <h2 className="text-base font-semibold text-[var(--text-primary)]">Couldn't load OpenClaw config</h2>
                    <p className="mt-2 text-sm text-[var(--text-secondary)]">{error}</p>
                    <button
                        onClick={load}
                        className="mt-4 inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-[var(--border)] text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                        <RefreshCw size={14} /> Retry
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 min-h-0 overflow-y-auto bg-[var(--bg-primary)]">
            <div className="max-w-2xl mx-auto p-6 space-y-5">

                {/* Header + apply banner */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Cpu size={18} className="text-[var(--accent)]" />
                        <h2 className="text-base font-semibold text-[var(--text-primary)]">OpenClaw models</h2>
                    </div>
                    {dirty && (
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-[var(--accent)] font-medium">{status || 'Restart to apply'}</span>
                            <button
                                onClick={applyRestart}
                                disabled={applying}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-xs font-semibold hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                            >
                                <RefreshCw size={12} className={applying ? 'animate-spin' : ''} />
                                Apply
                            </button>
                        </div>
                    )}
                </div>
                {!dirty && status && <p className="text-xs text-[var(--accent)] -mt-2">{status}</p>}

                {/* Active model */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-xs text-[var(--text-secondary)] mb-0.5">Agents use</div>
                        {active.id ? (
                            <>
                                <div className="text-sm font-semibold text-[var(--text-primary)] truncate">{active.id}</div>
                                <div className="text-xs text-[var(--text-tertiary)]">{active.provider || 'unknown provider'}</div>
                            </>
                        ) : (
                            <div className="text-sm text-[var(--text-tertiary)]">No default model set</div>
                        )}
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1.5 text-xs text-emerald-500">
                        <Check size={13} /> Active
                    </span>
                </div>

                {/* Add a model */}
                <div className="rounded-xl border-2 border-[var(--accent)]/40 bg-[var(--bg-primary)] p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <Plus size={16} className="text-[var(--accent)]" />
                        <span className="text-sm font-semibold text-[var(--text-primary)]">Add a model</span>
                    </div>
                    {providerIds.length === 0 ? (
                        <p className="text-xs text-[var(--text-tertiary)]">
                            No providers are configured in OpenClaw yet. Run <code className="font-mono">openclaw configure</code> first.
                        </p>
                    ) : (
                        <div className="space-y-2.5">
                            <label className="block">
                                <span className="text-xs text-[var(--text-secondary)]">Provider</span>
                                <select
                                    value={addProvider}
                                    onChange={e => setAddProvider(e.target.value)}
                                    className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                                >
                                    {providerIds.map(pid => (
                                        <option key={pid} value={pid}>{pid}</option>
                                    ))}
                                </select>
                            </label>
                            <label className="block">
                                <span className="text-xs text-[var(--text-secondary)]">Model id <span className="text-[var(--text-tertiary)]">(type it exactly)</span></span>
                                <input
                                    type="text"
                                    value={newId}
                                    onChange={e => setNewId(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') addModel(); }}
                                    placeholder="e.g. anthropic/claude-opus-4-8"
                                    className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] text-sm font-mono text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
                                />
                            </label>
                            <label className="block">
                                <span className="text-xs text-[var(--text-secondary)]">Display name <span className="text-[var(--text-tertiary)]">(optional)</span></span>
                                <input
                                    type="text"
                                    value={newName}
                                    onChange={e => setNewName(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') addModel(); }}
                                    placeholder="e.g. Claude Opus 4.8"
                                    className="mt-1 w-full px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
                                />
                            </label>
                            <button
                                onClick={addModel}
                                disabled={!newId.trim()}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                            >
                                <Plus size={15} /> Add to {addProvider}
                            </button>
                        </div>
                    )}
                </div>

                {/* Your models */}
                <div>
                    <div className="text-xs text-[var(--text-secondary)] mb-2 ml-0.5">Your models</div>
                    <div className="space-y-4">
                        {providerIds.map(pid => {
                            const models = providers[pid].models || [];
                            return (
                                <div key={pid}>
                                    <div className="flex items-center gap-1.5 mb-1.5 ml-0.5">
                                        <Server size={12} className="text-[var(--text-tertiary)]" />
                                        <span className="text-xs font-medium text-[var(--text-secondary)]">{pid}</span>
                                        <span className="text-xs text-[var(--text-tertiary)]">· {models.length}</span>
                                    </div>
                                    <div className="rounded-xl border border-[var(--border)] overflow-hidden">
                                        {models.length === 0 ? (
                                            <div className="px-4 py-3 text-xs text-[var(--text-tertiary)]">No models</div>
                                        ) : models.map(m => {
                                            const isActive = active.provider === pid && active.id === m.id;
                                            return (
                                                <div
                                                    key={m.id}
                                                    className={`flex items-center gap-2 border-b border-[var(--border)] last:border-b-0 ${isActive ? 'bg-[var(--accent)]/8' : ''}`}
                                                >
                                                    <button
                                                        onClick={() => setActive(pid, m.id)}
                                                        className="flex-1 min-w-0 px-3 py-2.5 text-left flex items-center gap-2.5 hover:bg-[var(--bg-hover)] transition-colors"
                                                        title="Use this model"
                                                    >
                                                        <span className={`shrink-0 w-4 h-4 rounded-full border flex items-center justify-center ${isActive ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--border)]'}`}>
                                                            {isActive && <Check size={10} className="text-white" />}
                                                        </span>
                                                        <span className="min-w-0">
                                                            <span className="block text-sm text-[var(--text-primary)] truncate">{m.name || m.id}</span>
                                                            {m.name && m.name !== m.id && (
                                                                <span className="block text-xs font-mono text-[var(--text-tertiary)] truncate">{m.id}</span>
                                                            )}
                                                        </span>
                                                    </button>
                                                    <button
                                                        onClick={() => removeModel(pid, m.id)}
                                                        disabled={isActive}
                                                        title={isActive ? 'Pick another model before removing the active one' : 'Remove model'}
                                                        className="shrink-0 px-3 py-2.5 text-[var(--text-tertiary)] hover:text-red-400 disabled:opacity-30 disabled:hover:text-[var(--text-tertiary)] transition-colors"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">
                    Changes are written to <code className="font-mono">~/.openclaw/openclaw.json</code>. Click Apply to restart the gateway so they take effect.
                </p>
            </div>
        </div>
    );
}

export default OpenClawModelsPanel;
