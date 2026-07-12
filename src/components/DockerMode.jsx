import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    AlertTriangle,
    Archive,
    Box,
    CheckCircle2,
    Container as ContainerIcon,
    ExternalLink,
    HardDrive,
    Loader2,
    Play,
    RefreshCw,
    Square,
    Trash2,
    XCircle,
} from 'lucide-react';

const POLL_MS = 5000;

const TABS = [
    { id: 'containers', label: 'Containers', icon: ContainerIcon },
    { id: 'images', label: 'Images', icon: Box },
    { id: 'volumes', label: 'Volumes', icon: HardDrive },
];

function StatusBadge({ state }) {
    const stateClass = {
        running: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-500',
        stopped: 'border-amber-500/30 bg-amber-500/10 text-amber-500',
        'not-installed': 'border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
        error: 'border-red-500/30 bg-red-500/10 text-red-500',
        checking: 'border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]',
    }[state] || 'border-[var(--border)] bg-[var(--bg-tertiary)] text-[var(--text-secondary)]';

    const label = {
        running: 'Daemon running',
        stopped: 'OrbStack stopped',
        'not-installed': 'Not installed',
        error: 'Error',
        checking: 'Checking...',
    }[state] || state;

    return (
        <span className={`inline-flex h-7 items-center rounded-md border px-2.5 text-xs font-semibold ${stateClass}`}>
            {label}
        </span>
    );
}

function isRunningContainer(status) {
    return /^up\b/i.test(status || '');
}

// Per-row remove confirmation. Volumes get a "back up first" nudge since
// `docker volume rm` is unrecoverable; containers/images just need the
// explicit second click.
function RemoveConfirm({ type, item, onCancel, onConfirm, onBackup, backupState }) {
    const [understood, setUnderstood] = useState(false);
    const needsBackupGate = type === 'volume';
    const canConfirm = !needsBackupGate || understood;

    return (
        <div className="mt-2 rounded-md border border-red-500/25 bg-red-500/10 p-3 text-xs leading-5">
            <div className="flex items-start gap-2 text-red-500">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                    This permanently removes {type} <strong className="font-mono">{item.label}</strong>.
                    {needsBackupGate && ' Volumes can hold databases and app state — back it up first if you are not sure.'}
                </span>
            </div>

            {needsBackupGate && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button
                        type="button"
                        onClick={onBackup}
                        disabled={backupState?.busy}
                        className="inline-flex h-7 items-center gap-1.5 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2.5 text-[11px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {backupState?.busy ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}
                        {backupState?.ok ? 'Backed up' : 'Back up volume'}
                    </button>
                    {backupState?.ok && backupState.path && (
                        <span className="truncate font-mono text-[10px] text-emerald-500">{backupState.path}</span>
                    )}
                    {backupState?.error && (
                        <span className="text-[10px] text-red-500">{backupState.error}</span>
                    )}
                </div>
            )}

            {needsBackupGate && (
                <label className="mt-2 flex cursor-pointer items-start gap-2">
                    <input
                        type="checkbox"
                        checked={understood}
                        onChange={(e) => setUnderstood(e.target.checked)}
                        className="mt-0.5 h-3.5 w-3.5 accent-red-500"
                    />
                    <span className="text-[var(--text-secondary)]">I have what I need and accept losing this volume&apos;s data.</span>
                </label>
            )}

            <div className="mt-2 flex items-center gap-2">
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={!canConfirm}
                    className="inline-flex h-7 items-center gap-1.5 rounded-md bg-red-600 px-3 text-[11px] font-bold text-white transition-colors hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
                >
                    <Trash2 size={12} />
                    Confirm delete
                </button>
                <button
                    type="button"
                    onClick={onCancel}
                    className="inline-flex h-7 items-center rounded-md px-2 text-[11px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

export default function DockerMode() {
    const [bridgeState, setBridgeState] = useState('checking'); // checking | running | stopped | not-installed | error
    const [bridgeError, setBridgeError] = useState('');
    const [data, setData] = useState({ containers: [], images: [], volumes: [] });
    const [loading, setLoading] = useState(false);
    const [listError, setListError] = useState('');
    const [activeTab, setActiveTab] = useState('containers');
    const [pendingRemoveKey, setPendingRemoveKey] = useState(null); // `${type}:${id}`
    const [busyKey, setBusyKey] = useState(null);
    const [backups, setBackups] = useState({}); // name -> { busy, ok, path, error }
    const [startingOrb, setStartingOrb] = useState(false);
    const pollRef = useRef(null);

    const canUseBridge = Boolean(window.electron?.dockerList);

    const refreshStatus = useCallback(async () => {
        if (!window.electron?.dockerStatus) {
            setBridgeState('error');
            setBridgeError('Perci needs the desktop Docker bridge. Restart Perci after this update.');
            return null;
        }
        const status = await window.electron.dockerStatus();
        const state = status.state === 'orbstack' ? 'running' : status.state === 'orbstack-stopped' ? 'stopped' : status.state;
        setBridgeState(state);
        setBridgeError(status.error || '');
        return state;
    }, []);

    const refreshList = useCallback(async () => {
        if (!canUseBridge) return;
        setLoading(true);
        try {
            const result = await window.electron.dockerList();
            if (result?.ok) {
                setData({ containers: result.containers || [], images: result.images || [], volumes: result.volumes || [] });
                setListError('');
            } else {
                setListError(result?.error || 'Could not load Docker state.');
            }
        } catch (err) {
            setListError(err.message || 'Could not load Docker state.');
        } finally {
            setLoading(false);
        }
    }, [canUseBridge]);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            const state = await refreshStatus();
            if (!cancelled && state === 'running') await refreshList();
        })();
        return () => { cancelled = true; };
    }, [refreshStatus, refreshList]);

    useEffect(() => {
        if (bridgeState !== 'running') {
            if (pollRef.current) clearInterval(pollRef.current);
            return;
        }
        pollRef.current = setInterval(refreshList, POLL_MS);
        return () => clearInterval(pollRef.current);
    }, [bridgeState, refreshList]);

    const startOrbStack = useCallback(async () => {
        if (!window.electron?.dockerStartOrbStack) return;
        setStartingOrb(true);
        try {
            await window.electron.dockerStartOrbStack();
            const state = await refreshStatus();
            if (state === 'running') await refreshList();
        } finally {
            setStartingOrb(false);
        }
    }, [refreshStatus, refreshList]);

    const stopContainer = useCallback(async (id) => {
        setBusyKey(`container:${id}`);
        try {
            await window.electron.dockerStop(id);
            await refreshList();
        } finally {
            setBusyKey(null);
        }
    }, [refreshList]);

    const backupVolume = useCallback(async (name) => {
        setBackups(prev => ({ ...prev, [name]: { busy: true } }));
        try {
            const result = await window.electron.dockerBackupVolume(name);
            setBackups(prev => ({ ...prev, [name]: result?.ok ? { ok: true, path: result.path } : { error: result?.error || 'Backup failed.' } }));
        } catch (err) {
            setBackups(prev => ({ ...prev, [name]: { error: err.message || 'Backup failed.' } }));
        }
    }, []);

    const removeItem = useCallback(async (type, id) => {
        const key = `${type}:${id}`;
        setBusyKey(key);
        try {
            await window.electron.dockerRemove(type, id, true);
            setPendingRemoveKey(null);
            await refreshList();
        } finally {
            setBusyKey(null);
        }
    }, [refreshList]);

    const counts = useMemo(() => ({
        containers: data.containers.length,
        images: data.images.length,
        volumes: data.volumes.length,
    }), [data]);

    const renderRows = () => {
        if (activeTab === 'containers') {
            if (data.containers.length === 0) return <EmptyState label="No containers" />;
            return data.containers.map(c => {
                const key = `container:${c.id}`;
                const running = isRunningContainer(c.status);
                return (
                    <Row key={c.id}>
                        <RowMain title={c.name} subtitle={c.image} tag={c.status} tagOk={running} />
                        <RowActions>
                            {running && (
                                <ActionButton icon={Square} label="Stop" busy={busyKey === key} onClick={() => stopContainer(c.id)} />
                            )}
                            <ActionButton icon={Trash2} label="Remove" danger busy={busyKey === key} onClick={() => setPendingRemoveKey(pendingRemoveKey === key ? null : key)} />
                        </RowActions>
                        {pendingRemoveKey === key && (
                            <RemoveConfirm
                                type="container"
                                item={{ label: c.name || c.id }}
                                onCancel={() => setPendingRemoveKey(null)}
                                onConfirm={() => removeItem('container', c.id)}
                            />
                        )}
                    </Row>
                );
            });
        }

        if (activeTab === 'images') {
            if (data.images.length === 0) return <EmptyState label="No images" />;
            return data.images.map(i => {
                const key = `image:${i.id}`;
                const label = `${i.repository}:${i.tag}`;
                return (
                    <Row key={i.id}>
                        <RowMain title={label} subtitle={i.id} tag={i.size} />
                        <RowActions>
                            <ActionButton icon={Trash2} label="Remove" danger busy={busyKey === key} onClick={() => setPendingRemoveKey(pendingRemoveKey === key ? null : key)} />
                        </RowActions>
                        {pendingRemoveKey === key && (
                            <RemoveConfirm
                                type="image"
                                item={{ label }}
                                onCancel={() => setPendingRemoveKey(null)}
                                onConfirm={() => removeItem('image', i.id)}
                            />
                        )}
                    </Row>
                );
            });
        }

        if (data.volumes.length === 0) return <EmptyState label="No volumes" />;
        return data.volumes.map(v => {
            const key = `volume:${v.name}`;
            return (
                <Row key={v.name}>
                    <RowMain title={v.name} subtitle={v.driver} />
                    <RowActions>
                        <ActionButton icon={Trash2} label="Remove" danger busy={busyKey === key} onClick={() => setPendingRemoveKey(pendingRemoveKey === key ? null : key)} />
                    </RowActions>
                    {pendingRemoveKey === key && (
                        <RemoveConfirm
                            type="volume"
                            item={{ label: v.name }}
                            backupState={backups[v.name]}
                            onBackup={() => backupVolume(v.name)}
                            onCancel={() => setPendingRemoveKey(null)}
                            onConfirm={() => removeItem('volume', v.name)}
                        />
                    )}
                </Row>
            );
        });
    };

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-blue-500/25 bg-blue-500/10 text-blue-400">
                        <ContainerIcon size={19} />
                    </span>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h1 className="m-0 truncate text-base font-semibold leading-5">Docker</h1>
                            <StatusBadge state={bridgeState} />
                        </div>
                        <p className="m-0 truncate text-[11px] text-[var(--text-tertiary)]">
                            {counts.containers} containers · {counts.images} images · {counts.volumes} volumes
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={refreshList}
                    disabled={bridgeState !== 'running' || loading}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                    Refresh
                </button>
            </header>

            {bridgeState === 'not-installed' && (
                <div className="m-4 rounded-lg border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-200">
                    Docker/OrbStack was not found on this Mac.{' '}
                    <a href="https://orbstack.dev" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-amber-100 underline">
                        Install OrbStack <ExternalLink size={12} />
                    </a>
                </div>
            )}

            {bridgeState === 'stopped' && (
                <div className="m-4 flex items-center justify-between gap-3 rounded-lg border border-amber-500/25 bg-amber-500/10 p-4 text-sm text-amber-200">
                    <span>OrbStack is installed but not running.</span>
                    <button
                        type="button"
                        onClick={startOrbStack}
                        disabled={startingOrb}
                        className="inline-flex h-8 items-center gap-2 rounded-md bg-amber-500 px-3 text-xs font-bold text-black transition-colors hover:bg-amber-400 disabled:opacity-50"
                    >
                        {startingOrb ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                        Start OrbStack
                    </button>
                </div>
            )}

            {bridgeState === 'error' && bridgeError && (
                <div className="m-4 rounded-lg border border-red-500/25 bg-red-500/10 p-4 text-sm leading-6 text-red-300">
                    {bridgeError}
                </div>
            )}

            {bridgeState === 'running' && (
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex shrink-0 gap-1 border-b border-[var(--border)] px-4 pt-3">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`inline-flex items-center gap-1.5 rounded-t-md border-b-2 px-3 py-2 text-xs font-semibold transition-colors ${
                                    activeTab === tab.id
                                        ? 'border-blue-500 text-blue-400'
                                        : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                                }`}
                            >
                                <tab.icon size={13} />
                                {tab.label}
                                <span className="rounded-full bg-[var(--bg-tertiary)] px-1.5 text-[10px] text-[var(--text-tertiary)]">{counts[tab.id]}</span>
                            </button>
                        ))}
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto p-4">
                        {listError && (
                            <div className="mb-3 flex items-center gap-2 rounded-md border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-400">
                                <XCircle size={14} />
                                {listError}
                            </div>
                        )}
                        <div className="grid gap-2">
                            {renderRows()}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Row({ children }) {
    return (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
            <div className="flex items-center justify-between gap-3">
                {children}
            </div>
        </div>
    );
}

function RowMain({ title, subtitle, tag, tagOk }) {
    return (
        <div className="min-w-0">
            <div className="flex items-center gap-2">
                <span className="truncate font-mono text-sm text-[var(--text-primary)]">{title}</span>
                {tag && (
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${tagOk ? 'bg-emerald-500/15 text-emerald-500' : 'bg-[var(--bg-tertiary)] text-[var(--text-tertiary)]'}`}>
                        {tag}
                    </span>
                )}
            </div>
            {subtitle && <div className="truncate text-xs text-[var(--text-tertiary)]">{subtitle}</div>}
        </div>
    );
}

function RowActions({ children }) {
    return <div className="flex shrink-0 items-center gap-1.5">{children}</div>;
}

function ActionButton({ icon: Icon, label, danger, busy, onClick }) {
    return (
        <button
            type="button"
            onClick={onClick}
            disabled={busy}
            className={`inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                danger
                    ? 'border-red-500/30 text-red-400 hover:bg-red-500/10'
                    : 'border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--bg-tertiary)]'
            }`}
        >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Icon size={12} />}
            {label}
        </button>
    );
}

function EmptyState({ label }) {
    return (
        <div className="flex h-40 flex-col items-center justify-center gap-2 text-center text-[var(--text-tertiary)]">
            <CheckCircle2 size={22} />
            <span className="text-sm">{label}</span>
        </div>
    );
}
