import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Plus, Search, Edit3, Trash2, Copy, Eye, EyeOff, ExternalLink,
    Download, Upload, Lock, Unlock, Shield, ShieldOff, FileSpreadsheet, X, BookOpen,
} from 'lucide-react';
import billboardLogo from '../assets/billboard-logo.svg';
import './BillboardMode.css';

// ── localStorage keys ────────────────────────────────────────────
const CONCERNS_KEY   = 'perci_concerns:v1';
const SETTINGS_KEY   = 'perci_concerns_settings:v1';
const ENCRYPT_KEY    = 'perci_concerns_encrypted:v1';

// ── Categories ───────────────────────────────────────────────────
const CATEGORIES = [
    'AI / ML', 'Infrastructure', 'Hosting', 'Auth', 'Storage',
    'Analytics', 'DevTools', 'Communication', 'Finance', 'Other',
];

const BILLING_CYCLES = ['monthly', 'annual', 'one-time', 'usage-based', 'free'];
const STATUSES       = ['active', 'paused', 'cancelled'];
const SORT_OPTIONS   = [
    { value: 'name-asc',     label: 'Name A→Z' },
    { value: 'name-desc',    label: 'Name Z→A' },
    { value: 'cost-desc',    label: 'Cost ↓' },
    { value: 'cost-asc',     label: 'Cost ↑' },
    { value: 'created-desc', label: 'Newest' },
    { value: 'created-asc',  label: 'Oldest' },
    { value: 'billing-asc',  label: 'Next billing' },
];

// ── Starter data ─────────────────────────────────────────────────
const STARTER = [{
    id: crypto.randomUUID(),
    name: 'fal.ai',
    category: 'AI / ML',
    url: 'https://fal.ai',
    purpose: 'Image generation API — needs manual top-ups',
    apiKey: '',
    monthlyCost: 0,
    billingCycle: 'usage-based',
    nextBillingDate: '',
    notes: 'Serverless GPU inference. Keep balance topped up.',
    tags: ['api', 'ai', 'image-gen'],
    status: 'active',
    createdAt: new Date().toISOString().slice(0, 10),
    updatedAt: new Date().toISOString().slice(0, 10),
}];

// ── Encryption helpers (AES-GCM via Web Crypto) ──────────────────
async function deriveKey(password) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'],
    );
    // Fixed salt for localStorage — acceptable for a personal local tool.
    const salt = enc.encode('perci-concerns-v1-salt');
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt'],
    );
}

async function encryptData(data, password) {
    const key = await deriveKey(password);
    const enc = new TextEncoder();
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const ct  = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(data)),
    );
    return JSON.stringify({
        iv:   Array.from(iv),
        data: Array.from(new Uint8Array(ct)),
    });
}

async function decryptData(blob, password) {
    const key     = await deriveKey(password);
    const { iv, data } = JSON.parse(blob);
    const pt = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(iv) }, key, new Uint8Array(data),
    );
    return JSON.parse(new TextDecoder().decode(pt));
}

// ── Persistence helpers ──────────────────────────────────────────
function loadConcerns() {
    try {
        const raw = localStorage.getItem(CONCERNS_KEY);
        if (!raw) return STARTER;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) && parsed.length > 0 ? parsed : STARTER;
    } catch { return STARTER; }
}

// Keeps the localStorage keys identical so user's existing Concerns data is seamlessly preserved as Bill Board data.
function saveConcerns(concerns) {
    localStorage.setItem(CONCERNS_KEY, JSON.stringify(concerns));
}

function loadSettings() {
    try {
        const raw = localStorage.getItem(SETTINGS_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

// Keeps settings key identical for seamless migration
function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

// ── Format helpers ───────────────────────────────────────────────
function formatCost(n) {
    if (!n && n !== 0) return '—';
    return new Intl.NumberFormat('en-US', {
        style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2,
    }).format(n);
}

function maskKey(key) {
    if (!key) return '';
    if (key.length <= 8) return '••••••••';
    return '••••••••' + key.slice(-4);
}

// Helper to determine billing countdown
function daysUntil(dateStr) {
    if (!dateStr) return null;
    const diff = (new Date(dateStr) - new Date()) / 86_400_000;
    return Math.ceil(diff);
}

function parseTags(str) {
    return str.split(',').map(t => t.trim().toLowerCase()).filter(Boolean);
}

// ── Blank item ───────────────────────────────────────────────────
function blankService() {
    const today = new Date().toISOString().slice(0, 10);
    return {
        id: crypto.randomUUID(),
        name: '', category: CATEGORIES[0], url: '', purpose: '',
        apiKey: '', monthlyCost: 0, billingCycle: 'monthly',
        nextBillingDate: '', notes: '', tags: [], status: 'active',
        createdAt: today, updatedAt: today,
    };
}

// ══════════════════════════════════════════════════════════════════
// Component
// ══════════════════════════════════════════════════════════════════

export default function BillboardMode() {
    // ── State ────────────────────────────────────────────────────
    const [concerns, setConcerns] = useState(loadConcerns);
    const [settings, setSettings] = useState(loadSettings);
    const [search, setSearch]     = useState('');
    const [sort, setSort]         = useState(() => loadSettings().sort || 'name-asc');
    const [filterCat, setFilterCat]     = useState('all');
    const [filterStatus, setFilterStatus] = useState('all');

    // Modal state
    const [editing, setEditing]    = useState(null);   // service object or null
    const [formData, setFormData]  = useState(null);
    const [tagsInput, setTagsInput] = useState('');

    // Key reveal state (set of service IDs with revealed keys)
    const [revealedKeys, setRevealedKeys] = useState(new Set());

    // Toast
    const [toast, setToast]      = useState(null);
    const toastTimer             = useRef(null);

    // Encryption
    const [isEncrypted, setIsEncrypted]       = useState(() => !!localStorage.getItem(ENCRYPT_KEY));
    const [showEncryptDialog, setShowEncryptDialog] = useState(false);
    const [encryptPassword, setEncryptPassword] = useState('');
    const [encryptConfirm, setEncryptConfirm]   = useState('');
    const [encryptAction, setEncryptAction]     = useState('setup'); // 'setup' | 'unlock' | 'remove'

    // Guide Modal state (defaults to true if user hasn't seen the guide yet)
    const [showGuideModal, setShowGuideModal]   = useState(() => !loadSettings().hasSeenGuide);

    // File input ref for import
    const importRef = useRef(null);

    // ── Persist ──────────────────────────────────────────────────
    useEffect(() => { saveConcerns(concerns); }, [concerns]);
    useEffect(() => {
        setSettings(prev => {
            const next = { ...prev, sort };
            saveSettings(next);
            return next;
        });
    }, [sort]);

    const closeGuideModal = useCallback(() => {
        setShowGuideModal(false);
        setSettings(prev => {
            const next = { ...prev, hasSeenGuide: true };
            saveSettings(next);
            return next;
        });
    }, []);

    // ── Toast helper ─────────────────────────────────────────────
    const showToast = useCallback((msg) => {
        clearTimeout(toastTimer.current);
        setToast(msg);
        toastTimer.current = setTimeout(() => setToast(null), 2000);
    }, []);

    // ── CRUD ─────────────────────────────────────────────────────
    const openAdd = useCallback(() => {
        const c = blankService();
        setEditing(c);
        setFormData({ ...c });
        setTagsInput('');
    }, []);

    const openEdit = useCallback((concern) => {
        setEditing(concern);
        setFormData({ ...concern });
        setTagsInput(concern.tags.join(', '));
    }, []);

    const closeModal = useCallback(() => {
        setEditing(null);
        setFormData(null);
    }, []);

    const saveConcern = useCallback(() => {
        if (!formData || !formData.name.trim()) return;
        const updated = {
            ...formData,
            name: formData.name.trim(),
            tags: parseTags(tagsInput),
            updatedAt: new Date().toISOString().slice(0, 10),
        };
        setConcerns(prev => {
            const idx = prev.findIndex(c => c.id === updated.id);
            if (idx >= 0) {
                const next = [...prev];
                next[idx] = updated;
                return next;
            }
            return [...prev, updated];
        });
        closeModal();
        showToast('Saved');
    }, [formData, tagsInput, closeModal, showToast]);

    const deleteConcern = useCallback((id) => {
        setConcerns(prev => prev.filter(c => c.id !== id));
        showToast('Deleted');
    }, [showToast]);

    // ── Key actions ──────────────────────────────────────────────
    const toggleReveal = useCallback((id) => {
        setRevealedKeys(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    }, []);

    const copyKey = useCallback(async (key) => {
        try {
            await navigator.clipboard.writeText(key);
            showToast('Copied to clipboard');
        } catch {
            showToast('Copy failed');
        }
    }, [showToast]);

    // ── Encryption ───────────────────────────────────────────────
    const handleSetupEncryption = useCallback(async () => {
        if (!encryptPassword || encryptPassword !== encryptConfirm) {
            showToast('Passwords don\'t match');
            return;
        }
        try {
            const blob = await encryptData(concerns, encryptPassword);
            localStorage.setItem(ENCRYPT_KEY, blob);
            setIsEncrypted(true);
            setShowEncryptDialog(false);
            setEncryptPassword('');
            setEncryptConfirm('');
            showToast('Encryption enabled');
        } catch {
            showToast('Encryption failed');
        }
    }, [encryptPassword, encryptConfirm, concerns, showToast]);

    const handleRemoveEncryption = useCallback(() => {
        localStorage.removeItem(ENCRYPT_KEY);
        setIsEncrypted(false);
        setShowEncryptDialog(false);
        setEncryptPassword('');
        showToast('Encryption removed');
    }, [showToast]);

    // ── Export/Import ────────────────────────────────────────────
    const exportJSON = useCallback(() => {
        const blob = new Blob([JSON.stringify(concerns, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `billboard-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Exported JSON');
    }, [concerns, showToast]);

    const exportCSV = useCallback(() => {
        const headers = ['Name', 'Category', 'Status', 'Monthly Cost', 'Billing Cycle', 'Purpose', 'URL', 'Next Billing', 'Tags', 'Notes'];
        const rows = concerns.map(c => [
            c.name, c.category, c.status, c.monthlyCost, c.billingCycle,
            c.purpose, c.url, c.nextBillingDate, c.tags.join('; '), c.notes,
        ].map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','));
        const csv = [headers.join(','), ...rows].join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href = url;
        a.download = `billboard-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        showToast('Exported CSV');
    }, [concerns, showToast]);

    const handleImport = useCallback((e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                if (Array.isArray(data) && data.length > 0 && data[0].id && data[0].name) {
                    setConcerns(data);
                    showToast(`Imported ${data.length} services`);
                } else {
                    showToast('Invalid JSON format');
                }
            } catch {
                showToast('Failed to parse JSON');
            }
        };
        reader.readAsText(file);
        // Reset so the same file can be re-imported
        e.target.value = '';
    }, [showToast]);

    // ── Form updater ─────────────────────────────────────────────
    const updateField = useCallback((field, value) => {
        setFormData(prev => prev ? { ...prev, [field]: value } : prev);
    }, []);

    // ── Filtering, searching, sorting ────────────────────────────
    const filtered = useMemo(() => {
        let result = concerns;

        // Search
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(c =>
                c.name.toLowerCase().includes(q) ||
                c.category.toLowerCase().includes(q) ||
                c.purpose.toLowerCase().includes(q) ||
                c.tags.some(t => t.includes(q)) ||
                c.notes.toLowerCase().includes(q)
            );
        }

        // Category filter
        if (filterCat !== 'all') {
            result = result.filter(c => c.category === filterCat);
        }

        // Status filter
        if (filterStatus !== 'all') {
            result = result.filter(c => c.status === filterStatus);
        }

        // Sort
        const sorted = [...result];
        switch (sort) {
            case 'name-asc':     sorted.sort((a, b) => a.name.localeCompare(b.name)); break;
            case 'name-desc':    sorted.sort((a, b) => b.name.localeCompare(a.name)); break;
            case 'cost-desc':    sorted.sort((a, b) => (b.monthlyCost || 0) - (a.monthlyCost || 0)); break;
            case 'cost-asc':     sorted.sort((a, b) => (a.monthlyCost || 0) - (b.monthlyCost || 0)); break;
            case 'created-desc': sorted.sort((a, b) => b.createdAt.localeCompare(a.createdAt)); break;
            case 'created-asc':  sorted.sort((a, b) => a.createdAt.localeCompare(b.createdAt)); break;
            case 'billing-asc':  sorted.sort((a, b) => {
                const da = a.nextBillingDate || '9999'; const db = b.nextBillingDate || '9999';
                return da.localeCompare(db);
            }); break;
            default: break;
        }
        return sorted;
    }, [concerns, search, sort, filterCat, filterStatus]);

    // ── Stats ────────────────────────────────────────────────────
    const stats = useMemo(() => {
        const active = concerns.filter(c => c.status === 'active');
        const monthly = active.reduce((sum, c) => {
            if (c.billingCycle === 'annual') return sum + (c.monthlyCost || 0) / 12;
            if (c.billingCycle === 'free' || c.billingCycle === 'one-time') return sum;
            return sum + (c.monthlyCost || 0);
        }, 0);
        const categories = new Set(concerns.map(c => c.category)).size;
        const upcoming = concerns.filter(c => {
            const d = daysUntil(c.nextBillingDate);
            return d !== null && d >= 0 && d <= 7;
        }).length;
        return { total: concerns.length, active: active.length, monthly, categories, upcoming };
    }, [concerns]);

    // ── Render ────────────────────────────────────────────────────
    return (
        <div className="concerns-root">
            {/* Header */}
            <div className="cn-header">
                <img src={billboardLogo} className="cn-header-logo" alt="Bill Board" />
                <span className="cn-title">Bill Board</span>
                <input
                    className="cn-search"
                    type="search"
                    placeholder="Search services, tags, notes…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                />
                <div className="cn-header-actions">
                    <select className="cn-filter-select" value={filterCat} onChange={e => setFilterCat(e.target.value)} title="Filter by category">
                        <option value="all">All categories</option>
                        {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select className="cn-filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)} title="Filter by status">
                        <option value="all">All statuses</option>
                        {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                    </select>
                    <select className="cn-sort-select" value={sort} onChange={e => setSort(e.target.value)} title="Sort">
                        {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button className="cn-btn" onClick={() => setShowGuideModal(true)} title="Show Guide Modal">
                        <BookOpen size={14} /> Guide
                    </button>
                    <button className="cn-btn cn-btn-accent" onClick={openAdd} title="Add service">
                        <Plus size={14} /> Add
                    </button>
                </div>
            </div>

            {/* Stats bar */}
            <div className="cn-stats">
                <div className="cn-stat">
                    <span className="cn-stat-value">{formatCost(stats.monthly)}</span>
                    <span className="cn-stat-label">Monthly</span>
                </div>
                <div className="cn-stat">
                    <span className="cn-stat-value">{stats.active}</span>
                    <span className="cn-stat-label">Active</span>
                </div>
                <div className="cn-stat">
                    <span className="cn-stat-value">{stats.total}</span>
                    <span className="cn-stat-label">Total</span>
                </div>
                <div className="cn-stat">
                    <span className="cn-stat-value">{stats.categories}</span>
                    <span className="cn-stat-label">Categories</span>
                </div>
                {stats.upcoming > 0 && (
                    <div className="cn-stat">
                        <span className="cn-stat-value" style={{ color: 'var(--cn-amber)' }}>{stats.upcoming}</span>
                        <span className="cn-stat-label">Due this week</span>
                    </div>
                )}
            </div>

            {/* Card grid */}
            <div className="cn-body">
                {filtered.length === 0 ? (
                    <div className="cn-empty">
                        <img src={billboardLogo} className="cn-empty-logo" alt="Bill Board Logo" />
                        <div className="cn-empty-text">
                            {search || filterCat !== 'all' || filterStatus !== 'all'
                                ? 'No services match your filters.'
                                : 'No services tracked yet. Click "Add" to track your first service or subscription.'}
                        </div>
                        {!search && filterCat === 'all' && filterStatus === 'all' && (
                            <button className="cn-btn cn-btn-accent" onClick={openAdd}>
                                <Plus size={14} /> Add your first service
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="cn-grid">
                        {filtered.map(concern => (
                            <ServiceCard
                                key={concern.id}
                                concern={concern}
                                revealed={revealedKeys.has(concern.id)}
                                onToggleReveal={() => toggleReveal(concern.id)}
                                onCopyKey={() => copyKey(concern.apiKey)}
                                onEdit={() => openEdit(concern)}
                                onDelete={() => deleteConcern(concern.id)}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Footer */}
            <div className="cn-footer">
                <button className="cn-footer-btn" onClick={exportJSON} title="Export JSON backup">
                    <Download size={12} /> JSON
                </button>
                <button className="cn-footer-btn" onClick={exportCSV} title="Export CSV for spreadsheet / taxes">
                    <FileSpreadsheet size={12} /> CSV
                </button>
                <button className="cn-footer-btn" onClick={() => importRef.current?.click()} title="Import JSON backup">
                    <Upload size={12} /> Import
                </button>
                <input ref={importRef} type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
                <div className="cn-footer-spacer" />
                <button
                    className="cn-footer-btn"
                    onClick={() => {
                        setEncryptAction(isEncrypted ? 'remove' : 'setup');
                        setEncryptPassword('');
                        setEncryptConfirm('');
                        setShowEncryptDialog(true);
                    }}
                    title={isEncrypted ? 'Encryption enabled' : 'Enable encryption'}
                >
                    {isEncrypted
                        ? <><Shield size={12} /> <span className="cn-encrypt-badge">Encrypted</span></>
                        : <><ShieldOff size={12} /> Encrypt</>
                    }
                </button>
            </div>

            {/* Edit/Add modal */}
            {editing && formData && (
                <div className="cn-dialog" onClick={closeModal}>
                    <div className="cn-dialog-panel" onClick={e => e.stopPropagation()}>
                        <div className="cn-dialog-title">
                            {concerns.some(c => c.id === editing.id) ? 'Edit Service' : 'Add Service'}
                        </div>

                        <div className="cn-form-group">
                            <label className="cn-form-label">Service name *</label>
                            <input className="cn-form-input" value={formData.name} onChange={e => updateField('name', e.target.value)} placeholder="e.g. fal.ai" autoFocus />
                        </div>

                        <div className="cn-form-row">
                            <div className="cn-form-group">
                                <label className="cn-form-label">Category</label>
                                <select className="cn-form-input" value={formData.category} onChange={e => updateField('category', e.target.value)}>
                                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                            </div>
                            <div className="cn-form-group">
                                <label className="cn-form-label">Status</label>
                                <select className="cn-form-input" value={formData.status} onChange={e => updateField('status', e.target.value)}>
                                    {STATUSES.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="cn-form-group">
                            <label className="cn-form-label">Purpose</label>
                            <input className="cn-form-input" value={formData.purpose} onChange={e => updateField('purpose', e.target.value)} placeholder="What do you use it for?" />
                        </div>

                        <div className="cn-form-group">
                            <label className="cn-form-label">URL</label>
                            <input className="cn-form-input" type="url" value={formData.url} onChange={e => updateField('url', e.target.value)} placeholder="https://…" />
                        </div>

                        <div className="cn-form-group">
                            <label className="cn-form-label">API Key</label>
                            <input className="cn-form-input" value={formData.apiKey} onChange={e => updateField('apiKey', e.target.value)} placeholder="Paste key here (stored locally)" style={{ fontFamily: "'SF Mono', 'Fira Code', monospace" }} />
                        </div>

                        <div className="cn-form-row">
                            <div className="cn-form-group">
                                <label className="cn-form-label">Cost ($)</label>
                                <input className="cn-form-input" type="number" min="0" step="0.01" value={formData.monthlyCost || ''} onChange={e => updateField('monthlyCost', parseFloat(e.target.value) || 0)} placeholder="0.00" />
                            </div>
                            <div className="cn-form-group">
                                <label className="cn-form-label">Billing cycle</label>
                                <select className="cn-form-input" value={formData.billingCycle} onChange={e => updateField('billingCycle', e.target.value)}>
                                    {BILLING_CYCLES.map(b => <option key={b} value={b}>{b.charAt(0).toUpperCase() + b.slice(1)}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="cn-form-group">
                            <label className="cn-form-label">Next billing date</label>
                            <input className="cn-form-input" type="date" value={formData.nextBillingDate} onChange={e => updateField('nextBillingDate', e.target.value)} />
                        </div>

                        <div className="cn-form-group">
                            <label className="cn-form-label">Tags (comma-separated)</label>
                            <input className="cn-form-input" value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="api, ai, image-gen" />
                        </div>

                        <div className="cn-form-group">
                            <label className="cn-form-label">Notes</label>
                            <textarea className="cn-form-input" value={formData.notes} onChange={e => updateField('notes', e.target.value)} placeholder="Anything else to remember…" rows={3} />
                        </div>

                        <div className="cn-dialog-footer">
                            <button className="cn-btn" onClick={closeModal}>Cancel</button>
                            <button className="cn-btn cn-btn-accent" onClick={saveConcern} disabled={!formData.name.trim()}>
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Encryption dialog */}
            {showEncryptDialog && (
                <div className="cn-dialog" onClick={() => setShowEncryptDialog(false)}>
                    <div className="cn-dialog-panel" onClick={e => e.stopPropagation()}>
                        <div className="cn-dialog-title">
                            {encryptAction === 'setup' ? 'Enable Encryption' : 'Remove Encryption'}
                        </div>

                        {encryptAction === 'setup' ? (
                            <>
                                <p className="cn-encryption-info">
                                    Set a master password to encrypt your API keys in localStorage using AES-256-GCM.
                                    You'll need this password if you ever clear your browser data and re-import.
                                </p>
                                <div className="cn-form-group">
                                    <label className="cn-form-label">Password</label>
                                    <input className="cn-form-input" type="password" value={encryptPassword} onChange={e => setEncryptPassword(e.target.value)} placeholder="Master password" autoFocus />
                                </div>
                                <div className="cn-form-group">
                                    <label className="cn-form-label">Confirm password</label>
                                    <input className="cn-form-input" type="password" value={encryptConfirm} onChange={e => setEncryptConfirm(e.target.value)} placeholder="Confirm" />
                                </div>
                                <div className="cn-dialog-footer">
                                    <button className="cn-btn" onClick={() => setShowEncryptDialog(false)}>Cancel</button>
                                    <button className="cn-btn cn-btn-accent" onClick={handleSetupEncryption} disabled={!encryptPassword || encryptPassword !== encryptConfirm}>
                                        <Lock size={14} /> Enable
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <p className="cn-encryption-info">
                                    This will remove the encrypted backup from localStorage. Your Bill Board data will remain but API keys will only be stored in plain text.
                                </p>
                                <div className="cn-dialog-footer">
                                    <button className="cn-btn" onClick={() => setShowEncryptDialog(false)}>Cancel</button>
                                    <button className="cn-btn" style={{ color: 'var(--cn-red)' }} onClick={handleRemoveEncryption}>
                                        <Unlock size={14} /> Remove Encryption
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Toast */}
            {toast && (
                <div className="cn-toast">{toast}</div>
            )}

            {/* Guide Modal */}
            {showGuideModal && (
                <div className="cn-dialog" onClick={closeGuideModal}>
                    <div className="cn-dialog-panel" style={{ maxWidth: '580px' }} onClick={e => e.stopPropagation()}>
                        <button className="cn-guide-close" onClick={closeGuideModal} title="Close guide">
                            <X size={14} />
                        </button>
                        
                        <div className="cn-guide-hero">
                            <img src={billboardLogo} className="cn-guide-hero-logo" alt="Bill Board Logo" />
                            <div className="cn-guide-header-text">
                                <span className="cn-guide-tag">Quick Start</span>
                                <h3 className="cn-guide-title">Why you need Bill Board</h3>
                            </div>
                        </div>
                        
                        <p className="cn-guide-intro" style={{ marginBottom: '22px' }}>
                            Managing APIs, keys, and subscriptions is a headache. Bill Board keeps your digital inventory organized, secure, and ready for action.
                        </p>
                        
                        <div className="cn-guide-steps-modal" style={{ display: 'flex', flexDirection: 'column', gap: '20px', borderTop: '1px solid var(--cn-border)', paddingTop: '20px' }}>
                            <div className="cn-guide-step">
                                <span className="cn-guide-step-num">1</span>
                                <div className="cn-guide-step-content">
                                    <strong>Stop Subscription Drain</strong>
                                    <p>Log fal.ai, Supabase, Cloudflare, etc. Keep track of what you pay for and prevent surprise billing renewals.</p>
                                </div>
                            </div>
                            <div className="cn-guide-step">
                                <span className="cn-guide-step-num">2</span>
                                <div className="cn-guide-step-content">
                                    <strong>AI Agent-Aware Vault</strong>
                                    <p>AI agents in Perci can securely read this local file (under optional AES-256 encryption) to authorize API calls automatically.</p>
                                </div>
                            </div>
                            <div className="cn-guide-step">
                                <span className="cn-guide-step-num">3</span>
                                <div className="cn-guide-step-content">
                                    <strong>Tax-Time Accounting</strong>
                                    <p>Export your full active stack as a clean JSON or CSV file in one click for business write-offs and tax records.</p>
                                </div>
                            </div>
                        </div>

                        <div className="cn-dialog-footer" style={{ marginTop: '24px' }}>
                            <button className="cn-btn cn-btn-accent" onClick={closeGuideModal}>
                                Get Started
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Service Card ──────────────────────────────────────────────────

function ServiceCard({ concern, revealed, onToggleReveal, onCopyKey, onEdit, onDelete }) {
    const days = daysUntil(concern.nextBillingDate);
    const billingLabel = concern.billingCycle === 'annual'
        ? `${formatCost(concern.monthlyCost)}/yr`
        : concern.billingCycle === 'free' ? 'Free'
        : concern.billingCycle === 'one-time' ? `${formatCost(concern.monthlyCost)} once`
        : concern.billingCycle === 'usage-based' ? 'Usage-based'
        : `${formatCost(concern.monthlyCost)}/mo`;

    return (
        <div className={`cn-card cn-card-${concern.status}`}>
            {/* Industrial corner bolts */}
            <div className="cn-bolt tl" />
            <div className="cn-bolt tr" />
            <div className="cn-bolt bl" />
            <div className="cn-bolt br" />

            <div className="cn-card-head">
                <div className="cn-card-name">{concern.name}</div>
                <div className={`cn-card-cost${!concern.monthlyCost ? ' zero' : ''}`}>
                    {billingLabel}
                </div>
            </div>

            {concern.purpose && (
                <div className="cn-card-purpose">{concern.purpose}</div>
            )}

            <div className="cn-card-meta">
                <span className="cn-pill">{concern.category}</span>
                <span className={`cn-status-badge ${concern.status}`}>
                    {concern.status}
                </span>
                {concern.url && (
                    <a className="cn-url-link" href={concern.url} target="_blank" rel="noopener noreferrer" title={concern.url}>
                        <ExternalLink size={10} />
                        {new URL(concern.url).hostname.replace('www.', '')}
                    </a>
                )}
            </div>

            {concern.apiKey && (
                <div className="cn-key-row">
                    <span className={`cn-key-value${revealed ? ' revealed' : ''}`}>
                        {revealed ? concern.apiKey : maskKey(concern.apiKey)}
                    </span>
                    <button className="cn-key-btn" onClick={onToggleReveal} title={revealed ? 'Hide key' : 'Reveal key'}>
                        {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                    <button className="cn-key-btn" onClick={onCopyKey} title="Copy key">
                        <Copy size={13} />
                    </button>
                </div>
            )}

            {concern.tags.length > 0 && (
                <div className="cn-tags">
                    {concern.tags.map(t => <span key={t} className="cn-tag">{t}</span>)}
                </div>
            )}

            {concern.notes && (
                <div className="cn-notes-row">{concern.notes}</div>
            )}

            <div className="cn-billing-info">
                {concern.billingCycle !== 'free' && concern.billingCycle !== 'one-time' && days !== null && (
                    <span className={days <= 3 ? 'cn-next-billing' : ''}>
                        {days < 0 ? 'Past due' : days === 0 ? 'Due today' : `Due in ${days}d`}
                    </span>
                )}
                <div className="cn-barcode" title="System Billing Barcode" />
            </div>

            <div className="cn-card-actions">
                <button className="cn-card-action" onClick={onEdit}>
                    <Edit3 size={12} /> Edit
                </button>
                <button className="cn-card-action destructive" onClick={onDelete}>
                    <Trash2 size={12} /> Delete
                </button>
            </div>
        </div>
    );
}
