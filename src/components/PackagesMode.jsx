import React, { useCallback, useEffect, useState } from 'react';
import {
    AlertCircle,
    AlertTriangle,
    Check,
    CheckCircle2,
    Copy,
    ExternalLink,
    HelpCircle,
    Loader2,
    Package,
    Plus,
    RefreshCw,
    Terminal,
    Trash2,
} from 'lucide-react';

function RegistryBadge({ type }) {
    const badges = {
        homebrew: 'border-amber-500/30 bg-amber-500/10 text-amber-400',
        npm: 'border-red-500/30 bg-red-500/10 text-red-400',
        pypi: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
        github: 'border-slate-500/30 bg-slate-500/10 text-slate-400',
    };

    const labels = {
        homebrew: 'Homebrew',
        npm: 'npm',
        pypi: 'PyPI',
        github: 'GitHub',
    };

    const css = badges[type] || badges.github;
    const label = labels[type] || type;

    return (
        <span className={`inline-flex h-5 items-center rounded border px-1.5 text-[10px] font-semibold uppercase tracking-wider ${css}`}>
            {label}
        </span>
    );
}

function SyncStatusBadge({ status, error, githubVersion, registryVersion, githubRepo }) {
    if (!githubRepo) {
        return (
            <div className="flex items-center gap-1.5 text-blue-400" title="Independent package (registry-only)">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-400" />
                <span className="text-xs font-medium">Registry Only</span>
            </div>
        );
    }
    if (status === 'match') {
        return (
            <div className="flex items-center gap-1.5 text-emerald-400" title="Versions match in GitHub and Registry">
                <CheckCircle2 size={16} />
                <span className="text-xs font-medium">In Sync</span>
            </div>
        );
    }
    if (status === 'github-ahead') {
        return (
            <div className="flex items-center gap-1.5 text-amber-400" title={`GitHub release (${githubVersion}) is ahead of Registry (${registryVersion})`}>
                <AlertTriangle size={16} />
                <span className="text-xs font-medium">Pending Registry update</span>
            </div>
        );
    }
    if (status === 'registry-ahead') {
        return (
            <div className="flex items-center gap-1.5 text-rose-400" title={`Registry (${registryVersion}) is ahead of GitHub release (${githubVersion})`}>
                <AlertCircle size={16} />
                <span className="text-xs font-medium">Registry Ahead</span>
            </div>
        );
    }
    return (
        <div className="flex items-center gap-1.5 text-slate-400" title={error || 'Cannot determine sync status'}>
            <HelpCircle size={16} />
            <span className="text-xs font-medium">Unknown</span>
        </div>
    );
}

function formatDate(dateStr) {
    if (!dateStr) return '—';
    try {
        const d = new Date(dateStr);
        return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
        return dateStr;
    }
}

export default function PackagesMode() {
    const [packages, setPackages] = useState([]);
    const [loading, setLoading] = useState(false);
    const [lastScanned, setLastScanned] = useState(null);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [copiedPkg, setCopiedPkg] = useState(null);
    const [error, setError] = useState(null);

    const [formData, setFormData] = useState({
        name: '',
        registry: 'npm',
        githubRepo: '',
        registryName: '',
        installCommand: '',
        description: '',
    });

    const canUseAPI = Boolean(
        window.electron?.packagesScan &&
        window.electron?.packagesGetConfig &&
        window.electron?.packagesSetConfig
    );

    const handleScan = useCallback(async (force = false) => {
        if (loading || !canUseAPI) return;
        setLoading(true);
        setError(null);
        try {
            const results = await window.electron.packagesScan({ force });
            setPackages(results || []);
            setLastScanned(new Date().toISOString());
        } catch (err) {
            console.error('Scan packages failed:', err);
            setError(err.message || 'Failed to scan registry metrics.');
        } finally {
            setLoading(false);
        }
    }, [canUseAPI, loading]);

    useEffect(() => {
        if (canUseAPI) {
            handleScan(false);
        }
    }, [canUseAPI]);

    const handleCopy = (pkgName, command) => {
        if (!command) return;
        navigator.clipboard.writeText(command);
        setCopiedPkg(pkgName);
        setTimeout(() => setCopiedPkg(null), 2000);
    };

    const handleOpenUrl = (repo) => {
        if (!repo) return;
        const url = `https://github.com/${repo}`;
        if (window.electron?.openExternal) {
            window.electron.openExternal(url);
        } else {
            window.open(url, '_blank');
        }
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        if (!formData.name || !formData.githubRepo) {
            setError('Package name and GitHub repository are required.');
            return;
        }

        setError(null);
        try {
            const currentConfig = await window.electron.packagesGetConfig();
            const updatedConfig = [...(currentConfig || [])];

            const newPackage = {
                name: formData.name.trim(),
                registry: formData.registry,
                githubRepo: formData.githubRepo.trim(),
                registryName: formData.registryName.trim() || formData.name.trim(),
                installCommand: formData.installCommand.trim(),
                description: formData.description.trim(),
            };

            updatedConfig.push(newPackage);
            const res = await window.electron.packagesSetConfig(updatedConfig);
            if (res.ok) {
                setFormData({
                    name: '',
                    registry: 'npm',
                    githubRepo: '',
                    registryName: '',
                    installCommand: '',
                    description: '',
                });
                setIsFormOpen(false);
                await handleScan(true);
            } else {
                setError(res.error || 'Failed to update packages list.');
            }
        } catch (err) {
            setError(err.message || 'An error occurred while saving.');
        }
    };

    const handleDelete = async (pkgName) => {
        if (!confirm(`Are you sure you want to stop tracking "${pkgName}"?`)) return;

        setError(null);
        try {
            const currentConfig = await window.electron.packagesGetConfig();
            const updatedConfig = (currentConfig || []).filter(p => p.name !== pkgName);
            const res = await window.electron.packagesSetConfig(updatedConfig);
            if (res.ok) {
                await handleScan(true);
            } else {
                setError(res.error || 'Failed to delete package.');
            }
        } catch (err) {
            setError(err.message || 'An error occurred during deletion.');
        }
    };

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-violet-500/25 bg-violet-500/10 text-violet-400">
                        <Package size={20} />
                    </span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h1 className="m-0 truncate text-base font-semibold leading-5">Packages</h1>
                            {loading && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
                                    <Loader2 size={12} className="animate-spin text-[var(--accent)]" /> Scanning...
                                </span>
                            )}
                            {!loading && lastScanned && (
                                <span className="text-[11px] text-[var(--text-tertiary)]">
                                    Scanned {new Date(lastScanned).toLocaleTimeString()}
                                </span>
                            )}
                        </div>
                        <p className="m-0 truncate font-mono text-[11px] text-[var(--text-tertiary)]">~/opal/electron/data/packages.json</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {canUseAPI && (
                        <>
                            <button
                                type="button"
                                onClick={() => setIsFormOpen(prev => !prev)}
                                className={`inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-tertiary)] px-3 text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]`}
                            >
                                <Plus size={15} />
                                {isFormOpen ? 'Close Panel' : 'Add Package'}
                            </button>
                            <button
                                type="button"
                                onClick={() => handleScan(true)}
                                disabled={loading}
                                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg bg-[var(--accent)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:bg-[var(--bg-tertiary)] disabled:text-[var(--text-tertiary)]"
                            >
                                <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                                Scan Registry
                            </button>
                        </>
                    )}
                </div>
            </header>

            {error && (
                <div className="bg-rose-500/10 border-b border-rose-500/25 px-4 py-2.5 text-xs text-rose-400 font-medium">
                    {error}
                </div>
            )}

            <div className="grid min-h-0 flex-1 overflow-hidden lg:grid-cols-[auto_1fr]">
                {/* Add Package Collapsible Sidebar Form */}
                {isFormOpen && (
                    <aside className="w-full shrink-0 border-b border-[var(--border)] bg-[var(--bg-secondary)] p-4 lg:w-[320px] lg:border-b-0 lg:border-r lg:overflow-y-auto">
                        <h2 className="m-0 text-sm font-semibold text-[var(--text-primary)]">Add New Package</h2>
                        <form onSubmit={handleFormSubmit} className="mt-4 grid gap-3">
                            <div>
                                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Name</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. cleanmac"
                                    value={formData.name}
                                    onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                                    className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Registry</label>
                                <select
                                    value={formData.registry}
                                    onChange={e => setFormData(prev => ({ ...prev, registry: e.target.value }))}
                                    className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                                >
                                    <option value="homebrew">Homebrew</option>
                                    <option value="npm">npm</option>
                                    <option value="pypi">PyPI</option>
                                    <option value="github">GitHub Release Only</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">GitHub Repo (owner/repo)</label>
                                <input
                                    type="text"
                                    required
                                    placeholder="e.g. toshon-jennings/cleanmac"
                                    value={formData.githubRepo}
                                    onChange={e => setFormData(prev => ({ ...prev, githubRepo: e.target.value }))}
                                    className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Registry Package Name (if different)</label>
                                <input
                                    type="text"
                                    placeholder="Leave blank to use Name"
                                    value={formData.registryName}
                                    onChange={e => setFormData(prev => ({ ...prev, registryName: e.target.value }))}
                                    className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Install Command</label>
                                <input
                                    type="text"
                                    placeholder="e.g. npm install -g cleanmac"
                                    value={formData.installCommand}
                                    onChange={e => setFormData(prev => ({ ...prev, installCommand: e.target.value }))}
                                    className="mt-1 w-full font-mono rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">Description</label>
                                <textarea
                                    placeholder="Short summary of the package"
                                    value={formData.description}
                                    onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                                    rows={3}
                                    className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 py-1.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] resize-none"
                                />
                            </div>

                            <button
                                type="submit"
                                className="mt-2 inline-flex h-9 items-center justify-center rounded-lg bg-[var(--accent)] text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
                            >
                                Save Package
                            </button>
                        </form>
                    </aside>
                )}

                {/* Package List Grid/Table Area */}
                <main className="min-h-0 flex-1 overflow-y-auto">
                    {!canUseAPI ? (
                        <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-3 p-8 text-center text-[var(--text-tertiary)]">
                            <AlertCircle size={32} className="text-amber-500/70" />
                            <div>
                                <p className="m-0 text-sm font-medium text-[var(--text-secondary)]">Electron Bridge Not Connected</p>
                                <p className="mt-1 text-xs text-[var(--text-tertiary)]">This surface requires the Perci desktop app with the Packages bridge loaded.</p>
                            </div>
                        </div>
                    ) : packages.length === 0 ? (
                        <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-4 p-8 text-center">
                            <Package size={48} className="text-[var(--text-tertiary)] opacity-30" />
                            <div>
                                <h3 className="m-0 text-base font-semibold text-[var(--text-primary)]">No packages tracked yet</h3>
                                <p className="mt-1 text-sm text-[var(--text-tertiary)] max-w-sm">Add open-source packages to keep an eye on versions and sync status across registries.</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsFormOpen(true)}
                                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--accent-hover)]"
                            >
                                <Plus size={15} />
                                Add Your First Package
                            </button>
                        </div>
                    ) : (
                        <div className="p-4">
                            <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)]">
                                <table className="w-full border-collapse text-left">
                                    <thead>
                                        <tr className="border-b border-[var(--border)] bg-[var(--bg-tertiary)] text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                                            <th className="px-4 py-3">Package</th>
                                            <th className="px-4 py-3">Registry</th>
                                            <th className="px-4 py-3">Latest Release (GH)</th>
                                            <th className="px-4 py-3">Registry Version</th>
                                            <th className="px-4 py-3">Status</th>
                                            <th className="px-4 py-3">Install Command</th>
                                            <th className="px-4 py-3 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--border)]">
                                        {packages.map((pkg) => (
                                            <tr key={`${pkg.name}-${pkg.registry}`} className="hover:bg-[var(--bg-primary)]/40 transition-colors">
                                                <td className="px-4 py-3.5">
                                                    <div className="font-semibold text-sm text-[var(--text-primary)]">{pkg.name}</div>
                                                    {pkg.description && (
                                                        <div className="mt-0.5 text-xs text-[var(--text-tertiary)] max-w-xs truncate" title={pkg.description}>
                                                            {pkg.description}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <RegistryBadge type={pkg.registry} />
                                                </td>
                                                <td className="px-4 py-3.5 font-mono text-xs">
                                                    <div className="text-[var(--text-primary)]">{pkg.githubVersion || '—'}</div>
                                                    {pkg.githubPublishDate && (
                                                        <div className="text-[10px] text-[var(--text-tertiary)]">
                                                            {formatDate(pkg.githubPublishDate)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3.5 font-mono text-xs">
                                                    <div className="text-[var(--text-primary)]">{pkg.registryVersion || '—'}</div>
                                                    {pkg.registryPublishDate && (
                                                        <div className="text-[10px] text-[var(--text-tertiary)]">
                                                            {formatDate(pkg.registryPublishDate)}
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    <SyncStatusBadge
                                                        status={pkg.syncStatus}
                                                        error={pkg.error}
                                                        githubVersion={pkg.githubVersion}
                                                        registryVersion={pkg.registryVersion}
                                                        githubRepo={pkg.githubRepo}
                                                    />
                                                    {pkg.stale && (
                                                        <span className="mt-0.5 block text-[9px] font-semibold text-amber-500/80 uppercase">
                                                            Cached / Stale
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3.5">
                                                    {pkg.installCommand ? (
                                                        <div 
                                                            className="flex max-w-[360px] items-center gap-1.5 rounded border border-[var(--border)] bg-[var(--bg-tertiary)] px-2 py-1"
                                                            title={pkg.installCommand}
                                                        >
                                                            <code className="flex-1 truncate font-mono text-[10px] text-[var(--text-secondary)]">
                                                                {pkg.installCommand}
                                                            </code>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCopy(pkg.name, pkg.installCommand)}
                                                                className="text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
                                                                title="Copy command"
                                                            >
                                                                {copiedPkg === pkg.name ? (
                                                                    <Check size={12} className="text-emerald-400" />
                                                                ) : (
                                                                    <Copy size={12} />
                                                                )}
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-[var(--text-tertiary)]">—</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3.5 text-right">
                                                    <div className="flex items-center justify-end gap-2">
                                                        {pkg.githubRepo ? (
                                                            <button
                                                                type="button"
                                                                onClick={() => handleOpenUrl(pkg.githubRepo)}
                                                                className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-hover)]"
                                                                title="Open GitHub repository"
                                                            >
                                                                <ExternalLink size={13} />
                                                            </button>
                                                        ) : (
                                                            <span className="inline-flex h-7 w-7 items-center justify-center text-[var(--text-tertiary)] opacity-30 select-none">
                                                                —
                                                            </span>
                                                        )}
                                                        <button
                                                            type="button"
                                                            onClick={() => handleDelete(pkg.name)}
                                                            className="inline-flex h-7 w-7 items-center justify-center rounded border border-rose-500/20 bg-rose-500/5 text-rose-400 transition-colors hover:bg-rose-500/20"
                                                            title="Delete package"
                                                        >
                                                            <Trash2 size={13} />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </main>
            </div>
        </div>
    );
}
