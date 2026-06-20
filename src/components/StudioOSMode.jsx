import { useCallback, useEffect, useState } from 'react';
import {
    Layers, FileText, BookOpen, Newspaper, Code, FolderOpen, Layout, Image,
    Key, RefreshCw, AlertCircle, Copy, ExternalLink
} from 'lucide-react';
import studioLogoLight from '../assets/studioos-logo-light.png';
import studioLogoDark from '../assets/studioos-logo-dark.png';

// ── StudioOS brand ──────────────────────────────────────────────────────────
const STUDIO_BLUE = '#3b82f6'; // StudioOS brand accent (theme-color)

// Genuine StudioOS API. Defaults to production; override (e.g. a local
// `vercel dev` instance) is persisted in localStorage.
const DEFAULT_API_BASE = 'https://studioos.dev';
const getApiBase = () =>
    (localStorage.getItem('studioos_api_base') || DEFAULT_API_BASE).replace(/\/+$/, '');

// Genuine StudioOS logo — theme-switched for contrast (see index.css).
function StudioLogo({ size = 32, className = '' }) {
    return (
        <>
            <img src={studioLogoLight} alt="StudioOS" width={size} height={size}
                className={`studioos-logo-light rounded-full ${className}`} />
            <img src={studioLogoDark} alt="StudioOS" width={size} height={size}
                className={`studioos-logo-dark rounded-full ${className}`} />
        </>
    );
}

// ── Content type config ────────────────────────────────────────────────────

const CONTENT_TYPES = [
    { id: 'wiki', label: 'Wiki', icon: FileText, color: '#3b82f6' },
    { id: 'blog', label: 'Blog', icon: Newspaper, color: '#f97316' },
    { id: 'journal', label: 'Journal', icon: BookOpen, color: '#10b981' },
    { id: 'devlog', label: 'Dev Log', icon: Code, color: '#8b5cf6' },
    { id: 'project', label: 'Projects', icon: FolderOpen, color: '#06b6d4' },
    { id: 'template', label: 'Templates', icon: Layout, color: '#f59e0b' },
    { id: 'gallery', label: 'Gallery', icon: Image, color: '#ec4899' },
];

// ── Helpers ────────────────────────────────────────────────────────────────

function relativeTime(iso) {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return 'just now';
    const m = Math.floor(ms / 60000);
    if (m < 2) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    return `${Math.floor(d / 30)}mo ago`;
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function StudioOSMode() {
    const [apiKey, setApiKey] = useState(() => localStorage.getItem('studioos_api_key') || '');
    const [apiBase, setApiBase] = useState(getApiBase);
    const [showKeyInput, setShowKeyInput] = useState(!apiKey);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [overview, setOverview] = useState(null);
    const [items, setItems] = useState([]);
    const [itemsLoading, setItemsLoading] = useState(false);
    const [activeTab, setActiveTab] = useState('overview');
    const [filterType, setFilterType] = useState('all');

    // API keys management
    const [apiKeys, setApiKeys] = useState([]);
    const [loadingKeys, setLoadingKeys] = useState(false);
    const [newKeyName, setNewKeyName] = useState('');
    const [creatingKey, setCreatingKey] = useState(false);
    const [createdKeySecret, setCreatedKeySecret] = useState(null);
    const [keyMsg, setKeyMsg] = useState('');

    // ── API helper ──
    // Prefers the Electron main-process bridge (no CORS). Falls back to a
    // direct fetch for non-Electron environments (e.g. running the Vite dev
    // server in a plain browser).
    const api = useCallback(async (path, opts = {}) => {
        const { method = 'GET', body = null } = opts;
        const useBridge = typeof window !== 'undefined'
            && window.electron?.studioos?.fetch;

        if (useBridge) {
            const result = await window.electron.studioos.fetch({
                apiBase, apiKey, path, method, body
            });
            if (!result.ok && (result.status === 401 || result.status === 403)) {
                throw new Error(result.error || `Auth failed (${result.status})`);
            }
            return {
                ok: result.ok,
                status: result.status,
                json: async () => result.body,
                error: result.error
            };
        }

        const res = await fetch(`${apiBase}/api${path}`, {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
                ...opts.headers,
            },
            body: body ? JSON.stringify(body) : undefined,
        });
        if (res.status === 401 || res.status === 403) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || `Auth failed (${res.status})`);
        }
        return {
            ok: res.ok,
            status: res.status,
            body: null,
            json: async () => res.json(),
            error: null
        };
    }, [apiKey, apiBase]);

    // ── Data loading ──
    const loadOverview = useCallback(async () => {
        if (!apiKey) return;
        setLoading(true);
        setError(null);
        try {
            const res = await api('/content/overview');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setOverview(data);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }, [api, apiKey]);

    const loadItems = useCallback(async (type = 'all') => {
        if (!apiKey) return;
        setItemsLoading(true);
        try {
            const typeParam = type === 'all' ? '' : `&type=${type}`;
            const res = await api(`/content/items?limit=50${typeParam}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setItems(data.items || []);
        } catch (e) {
            setError(e.message);
        } finally {
            setItemsLoading(false);
        }
    }, [api, apiKey]);

    const loadApiKeys = useCallback(async () => {
        if (!apiKey) return;
        setLoadingKeys(true);
        try {
            const res = await api('/studio/api-keys');
            if (res.ok) {
                const data = await res.json();
                setApiKeys(data.keys || []);
            }
        } finally {
            setLoadingKeys(false);
        }
    }, [api, apiKey]);

    useEffect(() => {
        if (apiKey) {
            void loadOverview();
        }
    }, [apiKey, loadOverview]);

    useEffect(() => {
        if (activeTab === 'content' && apiKey) {
            void loadItems(filterType);
        }
    }, [activeTab, filterType, apiKey, loadItems]);

    useEffect(() => {
        if (activeTab === 'keys' && apiKey) void loadApiKeys();
    }, [activeTab, apiKey, loadApiKeys]);

    const saveApiKey = () => {
        if (!apiKey.trim()) return;
        localStorage.setItem('studioos_api_key', apiKey.trim());
        const base = (apiBase.trim() || DEFAULT_API_BASE).replace(/\/+$/, '');
        localStorage.setItem('studioos_api_base', base);
        setApiBase(base);
        setShowKeyInput(false);
        void loadOverview();
    };

    // ── API key management ──
    async function handleCreateKey() {
        if (!newKeyName.trim()) { setKeyMsg('Name is required.'); return; }
        setCreatingKey(true);
        setKeyMsg('');
        setCreatedKeySecret(null);
        try {
            const res = await api('/studio/api-keys', {
                method: 'POST',
                body: JSON.stringify({ name: newKeyName.trim() }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed');
            setCreatedKeySecret(data.secret);
            setKeyMsg('Key created — copy it now, it won\'t be shown again.');
            setNewKeyName('');
            await loadApiKeys();
        } catch (e) {
            setKeyMsg(e.message);
        } finally {
            setCreatingKey(false);
        }
    }

    async function handleRevokeKey(id) {
        if (!window.confirm('Revoke this key?')) return;
        try {
            let res;
            if (typeof window !== 'undefined' && window.electron?.studioos?.fetch) {
                res = await window.electron.studioos.fetch({
                    apiBase, apiKey,
                    path: `/studio/api-keys/${id}/revoke`,
                    method: 'POST'
                });
            } else {
                res = await fetch(`${apiBase}/api/studio/api-keys/${id}/revoke`, {
                    method: 'POST',
                    headers: { Authorization: `Bearer ${apiKey}` },
                });
            }
            if (!res.ok) throw new Error(res.error || 'Failed');
            await loadApiKeys();
        } catch (e) {
            setKeyMsg(e.message);
        }
    }

    // ── Open an item in StudioOS (external browser) ──
    const openItem = useCallback((item) => {
        if (!item?.url) return;
        window.open(`${apiBase}${item.url}`, '_blank', 'noopener,noreferrer');
    }, [apiBase]);

    // ── Type filter helpers ──
    const filteredItems = filterType === 'all' ? items : items.filter(i => i.type === filterType);
    const typeColor = (type) => CONTENT_TYPES.find(t => t.id === type)?.color || '#94a3b8';
    const typeLabel = (type) => CONTENT_TYPES.find(t => t.id === type)?.label || type;
    const typeIcon = (type) => CONTENT_TYPES.find(t => t.id === type)?.icon || FileText;

    // ── Tabs ──
    const tabs = [
        { id: 'overview', label: 'Overview', icon: Layers },
        { id: 'content', label: 'Content', icon: FileText },
        { id: 'keys', label: 'API Keys', icon: Key },
    ];

    // ── API key prompt ──
    if (!apiKey || showKeyInput) {
        return (
            <div className="studioos-panel flex h-full flex-col items-center justify-center p-8">
                <div className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--bg-secondary)] p-6 shadow-lg">
                    <div className="mb-4 flex items-center gap-3">
                        <StudioLogo size={40} />
                        <div>
                            <h2 className="text-lg font-semibold text-[var(--text-primary)]">StudioOS</h2>
                            <p className="text-xs text-[var(--text-tertiary)]">Enter your StudioOS API key to connect</p>
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <input
                            type="password"
                            value={apiKey}
                            onChange={e => setApiKey(e.target.value)}
                            placeholder="studio_..."
                            className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none font-mono focus:border-[#3b82f6]"
                            onKeyDown={e => e.key === 'Enter' && saveApiKey()}
                        />
                        <button onClick={saveApiKey} className="rounded-lg px-4 py-2 text-sm font-medium text-white transition-colors" style={{ background: STUDIO_BLUE }}>
                            Connect
                        </button>
                    </div>
                    <button
                        onClick={() => window.open(apiBase, '_blank', 'noopener,noreferrer')}
                        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
                    >
                        <span>Open StudioOS</span>
                        <ExternalLink size={12} />
                    </button>
                    {apiKey && localStorage.getItem('studioos_api_key') && (
                        <button onClick={() => setShowKeyInput(false)} className="mt-2 text-xs text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]">Cancel</button>
                    )}
                    <p className="mt-3 text-[11px] text-[var(--text-tertiary)]">
                        Generate a key in StudioOS → Settings → API Keys.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="studioos-panel flex h-full flex-col bg-[var(--bg-primary)]">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-3">
                <div className="flex items-center gap-3">
                    <StudioLogo size={32} />
                    <div>
                        <h1 className="text-sm font-semibold text-[var(--text-primary)]">StudioOS</h1>
                        <p className="text-[11px] text-[var(--text-tertiary)]">Your creative workspace</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => { void loadOverview(); void loadItems(filterType); }} className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors" title="Refresh">
                        <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
                    </button>
                    <button onClick={() => setShowKeyInput(true)} className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors" title="Change API key">
                        <Key size={14} />
                    </button>
                </div>
            </div>

            {/* Tabs */}
            <div className="shrink-0 flex gap-0.5 overflow-x-auto border-b border-[var(--border)] px-3">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className="flex items-center gap-1.5 whitespace-nowrap px-3 py-2 text-xs font-medium border-b-2 -mb-px transition-colors border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                        style={activeTab === tab.id ? { borderColor: STUDIO_BLUE, color: STUDIO_BLUE } : undefined}
                    >
                        <tab.icon size={13} />
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Content */}
            <div className="flex-1 min-h-0 overflow-y-auto p-5">
                {error && (
                    <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3">
                        <AlertCircle size={15} className="text-red-400 shrink-0" />
                        <p className="text-sm text-red-400">{error}</p>
                        <button onClick={() => { void loadOverview(); void loadItems(filterType); }} className="ml-auto text-xs text-red-400 underline">Retry</button>
                    </div>
                )}

                {/* ── Overview ── */}
                {activeTab === 'overview' && overview && (
                    <div className="space-y-5">
                        {/* Summary cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                            {CONTENT_TYPES.map(ct => {
                                const count = overview.counts?.find(c => c.type === ct.id)?.count || 0;
                                return (
                                    <div key={ct.id} className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-3 text-center">
                                        <ct.icon size={18} className="mx-auto mb-1.5" style={{ color: ct.color }} />
                                        <div className="text-lg font-bold text-[var(--text-primary)]">{count}</div>
                                        <div className="text-[10px] text-[var(--text-tertiary)]">{ct.label}</div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Total */}
                        <div className="rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] p-4 text-center">
                            <div className="text-3xl font-bold text-[var(--text-primary)]">{overview.totalItems}</div>
                            <div className="text-xs text-[var(--text-tertiary)]">Total items</div>
                        </div>

                        {/* Recent items */}
                        {overview.recentItems?.length > 0 && (
                            <div>
                                <h3 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Recent</h3>
                                <div className="space-y-2">
                                    {overview.recentItems.slice(0, 10).map(item => {
                                        const Icon = typeIcon(item.type);
                                        return (
                                            <button key={item.id} onClick={() => openItem(item)} title="Open in StudioOS" className="group flex w-full items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3 text-left transition-colors hover:border-[#3b82f6]">
                                                <Icon size={16} style={{ color: typeColor(item.type) }} className="shrink-0" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="text-sm font-medium text-[var(--text-primary)] truncate">{item.title}</div>
                                                    {item.preview && <div className="text-xs text-[var(--text-tertiary)] truncate">{item.preview}</div>}
                                                </div>
                                                <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: `${typeColor(item.type)}18`, color: typeColor(item.type) }}>
                                                    {typeLabel(item.type)}
                                                </span>
                                                <span className="shrink-0 text-[10px] text-[var(--text-tertiary)]">{relativeTime(item.updatedAt)}</span>
                                                <ExternalLink size={13} className="shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100" />
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {overview.totalItems === 0 && (
                            <div className="flex flex-col items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-secondary)] py-16">
                                <div className="text-4xl mb-4">🎨</div>
                                <div className="text-sm font-semibold text-[var(--text-primary)] mb-2">Your StudioOS workspace is empty</div>
                                <div className="text-xs text-[var(--text-tertiary)]">Start creating content in StudioOS and it'll appear here.</div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── Content ── */}
                {activeTab === 'content' && (
                    <div>
                        {/* Type filter */}
                        <div className="mb-4 flex flex-wrap gap-2">
                            <button
                                onClick={() => setFilterType('all')}
                                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                    filterType === 'all'
                                        ? 'text-white'
                                        : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] border border-[var(--border)] hover:text-[var(--text-primary)]'
                                }`}
                                style={filterType === 'all' ? { background: STUDIO_BLUE } : undefined}
                            >
                                All ({items.length})
                            </button>
                            {CONTENT_TYPES.map(ct => {
                                const count = items.filter(i => i.type === ct.id).length;
                                return (
                                    <button
                                        key={ct.id}
                                        onClick={() => setFilterType(ct.id)}
                                        className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                                            filterType === ct.id
                                                ? 'text-white'
                                                : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)] border border-[var(--border)] hover:text-[var(--text-primary)]'
                                        }`}
                                        style={filterType === ct.id ? { background: ct.color } : {}}
                                    >
                                        <ct.icon size={11} />
                                        {ct.label} ({count})
                                    </button>
                                );
                            })}
                        </div>

                        {itemsLoading ? (
                            <div className="py-12 text-center text-xs text-[var(--text-tertiary)]">Loading…</div>
                        ) : (
                            <div className="space-y-2">
                                {filteredItems.map(item => {
                                    const Icon = typeIcon(item.type);
                                    return (
                                        <button key={item.id} onClick={() => openItem(item)} title="Open in StudioOS" className="group block w-full rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4 text-left transition-colors hover:border-[#3b82f6]">
                                            <div className="flex items-start gap-3">
                                                <Icon size={18} style={{ color: typeColor(item.type) }} className="shrink-0 mt-0.5" />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="text-sm font-medium text-[var(--text-primary)]">{item.title}</span>
                                                        <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ background: `${typeColor(item.type)}18`, color: typeColor(item.type) }}>
                                                            {typeLabel(item.type)}
                                                        </span>
                                                        {item.status && (
                                                            <span className="rounded-full bg-[var(--bg-tertiary)] px-2 py-0.5 text-[10px] text-[var(--text-tertiary)]">
                                                                {item.status}
                                                            </span>
                                                        )}
                                                        <ExternalLink size={13} className="ml-auto shrink-0 text-[var(--text-tertiary)] opacity-0 transition-opacity group-hover:opacity-100" />
                                                    </div>
                                                    {item.preview && <p className="text-xs text-[var(--text-tertiary)] line-clamp-2">{item.preview}</p>}
                                                    <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--text-tertiary)]">
                                                        <span>Updated {relativeTime(item.updatedAt)}</span>
                                                        {item.tags?.length > 0 && (
                                                            <div className="flex gap-1">
                                                                {item.tags.slice(0, 3).map(t => (
                                                                    <span key={t} className="rounded-full border border-[var(--border)] px-1.5 py-0.5">{t}</span>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                                {filteredItems.length === 0 && (
                                    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] py-12 text-center text-xs text-[var(--text-tertiary)]">
                                        {filterType === 'all' ? 'No content yet.' : `No ${typeLabel(filterType).toLowerCase()} items.`}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ── API Keys ── */}
                {activeTab === 'keys' && (
                    <div>
                        <h3 className="mb-2 text-sm font-semibold text-[var(--text-primary)]">API Keys</h3>
                        <p className="mb-4 text-xs text-[var(--text-tertiary)]">Manage API keys for programmatic access to your StudioOS data.</p>

                        {keyMsg && (
                            <div className={`mb-3 rounded-lg px-3 py-2 text-xs ${keyMsg.includes('Failed') || keyMsg.includes('required') ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>{keyMsg}</div>
                        )}

                        {createdKeySecret && (
                            <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
                                <div className="flex items-center gap-2 text-sm font-medium text-amber-400 mb-2">⚠️ Copy this key now — it won't be shown again</div>
                                <code className="block rounded-lg bg-[var(--bg-primary)] p-3 font-mono text-xs text-[var(--accent-cyan)] break-all border border-[var(--border)]">{createdKeySecret}</code>
                                <button onClick={() => { void navigator.clipboard.writeText(createdKeySecret); setCreatedKeySecret(null); }} className="mt-2 flex items-center gap-1 text-xs text-amber-400 hover:underline"><Copy size={11} />Copy</button>
                            </div>
                        )}

                        <div className="mb-4 flex gap-2">
                            <input className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[#3b82f6]" value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Key name…" />
                            <button onClick={() => void handleCreateKey()} disabled={creatingKey} className="rounded-lg px-4 py-1.5 text-xs font-medium text-white" style={{ background: STUDIO_BLUE }}>{creatingKey ? 'Creating…' : 'Generate'}</button>
                        </div>

                        {loadingKeys ? (
                            <div className="py-8 text-center text-xs text-[var(--text-tertiary)]">Loading…</div>
                        ) : (
                            <div className="space-y-2">
                                {apiKeys.map(key => {
                                    const revoked = !!key.revoked_at;
                                    const expired = key.expires_at && new Date(key.expires_at) < new Date();
                                    return (
                                        <div key={key.id} className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3" style={{ opacity: revoked || expired ? 0.5 : 1 }}>
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="text-sm font-medium text-[var(--text-primary)]">{key.name}</span>
                                                {revoked && <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">REVOKED</span>}
                                                {expired && <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-400">EXPIRED</span>}
                                            </div>
                                            <div className="flex gap-3 text-[10px] text-[var(--text-tertiary)]">
                                                <span>Scopes: {key.scopes?.join(', ')}</span>
                                                <span>Created {relativeTime(key.created_at)}</span>
                                                {key.last_used_at && <span>Last used {relativeTime(key.last_used_at)}</span>}
                                            </div>
                                            {!revoked && !expired && (
                                                <button onClick={() => void handleRevokeKey(key.id)} className="mt-2 text-[11px] text-red-400 hover:underline">Revoke</button>
                                            )}
                                        </div>
                                    );
                                })}
                                {apiKeys.length === 0 && <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] py-8 text-center text-xs text-[var(--text-tertiary)]">No API keys yet.</div>}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
