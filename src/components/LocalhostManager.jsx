import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readStringStorage, writeStringStorage } from '../lib/persistentStore';
import { LOCAL_SERVICES } from '../lib/localServices';
import {
    Plus, X, Play, Square, Power, PowerOff, RotateCw,
    ChevronDown, ChevronUp, ExternalLink, RefreshCw,
    Server, Terminal, AlertCircle, CheckCircle, Globe, Pencil
} from 'lucide-react';

const STORAGE_KEY = 'perci_localhost_manager_apps';

// ── Default app catalog — shared with the surfaces that embed these apps ──
const DEFAULT_APPS = LOCAL_SERVICES;

function plistLabel(id) { return `local.perci.${id}`; }
function plistPath(id, homeDir) {
    const label = plistLabel(id);
    return `${homeDir}/Library/LaunchAgents/${label}.plist`;
}

function buildPlist(label, command, cwd, name, homeDir) {
    const envDict = cwd
        ? `<key>WorkingDirectory</key><string>${cwd.replace('~', homeDir)}</string>`
        : '';
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${label}</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>-c</string>
        <string>${command}</string>
    </array>
    ${envDict}
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <false/>
    <key>StandardOutPath</key>
    <string>${homeDir}/Library/Logs/${label}.log</string>
    <key>StandardErrorPath</key>
    <string>${homeDir}/Library/Logs/${label}.log</string>
</dict>
</plist>`;
}

function readApps() {
    try {
        const raw = readStringStorage(STORAGE_KEY, '[]');
        const saved = JSON.parse(raw);
        if (!Array.isArray(saved)) return [...DEFAULT_APPS];
        
        const savedMap = new Map(saved.map(a => [a.id, a]));
        return DEFAULT_APPS.map(def => {
            const s = savedMap.get(def.id);
            if (!s) return def;
            // Saved state wins, except for a blank launch command or folder:
            // earlier catalog versions shipped several apps with no command and
            // persisted those blanks, which would otherwise permanently shadow a
            // command the catalog has since learned. The user can still clear one
            // by editing the app.
            return {
                ...def,
                ...s,
                startCommand: s.startCommand || def.startCommand,
                cwd: s.cwd || def.cwd,
                autoStart: !!s.autoStart
            };
        }).concat(saved.filter(s => !DEFAULT_APPS.find(d => d.id === s.id)));
    } catch {
        return [...DEFAULT_APPS];
    }
}

function writeApps(apps) {
    writeStringStorage(STORAGE_KEY, JSON.stringify(apps.map(a => ({
        id: a.id, name: a.name, port: a.port, url: a.url,
        startCommand: a.startCommand, cwd: a.cwd, autoStart: a.autoStart,
    }))));
}

export default function LocalhostManager({ onNavigate }) {
    const [apps, setApps] = useState(() => readApps());
    const [homeDir, setHomeDir] = useState('/Users/toshonjennings');
    const [runningPorts, setRunningPorts] = useState(new Set());
    const [appHealthMap, setAppHealthMap] = useState({});
    const [scanning, setScanning] = useState(false);
    const [showAddForm, setShowAddForm] = useState(false);
    const [addName, setAddName] = useState('');
    const [addPort, setAddPort] = useState('');
    const [addCommand, setAddCommand] = useState('');
    const [addCwd, setAddCwd] = useState('');
    const [busyIds, setBusyIds] = useState(new Set());
    const [toast, setToast] = useState(null);
    const [showHostsModal, setShowHostsModal] = useState(false);
    const [hostsContent, setHostsContent] = useState('');
    const [savingHosts, setSavingHosts] = useState(false);
    const [expandedSection, setExpandedSection] = useState('all'); // 'all' | 'running' | 'stopped'
    const [editingAppId, setEditingAppId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editPort, setEditPort] = useState('');
    const [editCwd, setEditCwd] = useState('');
    const [editCommand, setEditCommand] = useState('');
    const healthScanSeqRef = useRef(0);

    useEffect(() => {
        if (window.electron?.getHomeDir) {
            window.electron.getHomeDir().then(dir => {
                if (dir) setHomeDir(dir);
            });
        }
    }, []);

    const checkAppHealth = useCallback(async (app, scanSeq) => {
        if (!app.port) return;
        const targetUrl = app.url || `http://localhost:${app.port}`;
        if (!window.electron?.localhostCheckHealth) {
            if (scanSeq !== healthScanSeqRef.current) return;
            setAppHealthMap(prev => ({ ...prev, [app.id]: { state: 'unavailable' } }));
            return;
        }
        if (scanSeq !== healthScanSeqRef.current) return;
        setAppHealthMap(prev => ({ ...prev, [app.id]: { state: 'checking' } }));
        try {
            const result = await window.electron.localhostCheckHealth(targetUrl);
            if (scanSeq !== healthScanSeqRef.current) return;
            const health = result.ok
                ? { state: 'healthy', status: result.status }
                : result.reachable
                    ? { state: 'http-error', status: result.status }
                    : { state: 'unreachable', error: result.error };
            setAppHealthMap(prev => ({ ...prev, [app.id]: health }));
        } catch (err) {
            if (scanSeq !== healthScanSeqRef.current) return;
            setAppHealthMap(prev => ({
                ...prev,
                [app.id]: { state: 'unreachable', error: err.message },
            }));
        }
    }, []);

    const refreshPorts = useCallback(async () => {
        if (!window.electron?.lighthouseScan) return;
        const scanSeq = ++healthScanSeqRef.current;
        setScanning(true);
        try {
            const result = await window.electron.lighthouseScan();
            if (scanSeq !== healthScanSeqRef.current) return;
            const ports = (result.ports || [])
                .filter(p => {
                    const bind = (p.bind_address || '').toLowerCase();
                    return ['127.0.0.1', '::1', 'localhost', '0.0.0.0', '::', ''].includes(bind);
                });
            const activePortsSet = new Set(ports.map(p => Number(p.port)));
            setRunningPorts(activePortsSet);

            // Probe health for apps whose port is listening
            apps.forEach(app => {
                if (app.port > 0 && activePortsSet.has(app.port)) {
                    checkAppHealth(app, scanSeq);
                } else {
                    setAppHealthMap(prev => ({ ...prev, [app.id]: { state: 'stopped' } }));
                }
            });
        } catch (err) {
            console.error('[LocalhostManager] scan failed:', err);
        } finally {
            if (scanSeq === healthScanSeqRef.current) setScanning(false);
        }
    }, [apps, checkAppHealth]);

    useEffect(() => { refreshPorts(); }, [refreshPorts]);

    const showToast = useCallback((msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3000);
    }, []);

    // ── Auto-start toggles ──────────────────────────────────────────────
    const enableAutoStart = useCallback(async (app) => {
        if (!app.startCommand) {
            showToast(`${app.name} has no start command configured`, 'error');
            return;
        }
        setBusyIds(prev => new Set(prev).add(app.id));
        const label = plistLabel(app.id);
        const pPath = plistPath(app.id, homeDir);
        const plistContent = buildPlist(label, app.startCommand, app.cwd, app.name, homeDir);
        try {
            const result = await window.electron.localhostEnableAutostart({ label, plistContent, plistPath: pPath });
            if (!result.ok) {
                showToast(`Failed to enable ${app.name}: ${result.error}`, 'error');
                setBusyIds(prev => { const n = new Set(prev); n.delete(app.id); return n; });
                return;
            }
            setApps(prev => {
                const next = prev.map(a => a.id === app.id ? { ...a, autoStart: true } : a);
                writeApps(next);
                return next;
            });
            showToast(`${app.name} will start on boot`);
        } catch (err) {
            showToast(`Error enabling ${app.name}: ${err.message}`, 'error');
        }
        setBusyIds(prev => { const n = new Set(prev); n.delete(app.id); return n; });
    }, [showToast, homeDir]);

    const disableAutoStart = useCallback(async (app) => {
        setBusyIds(prev => new Set(prev).add(app.id));
        const pPath = plistPath(app.id, homeDir);
        try {
            const result = await window.electron.localhostDisableAutostart({ plistPath: pPath });
            if (!result.ok) {
                showToast(`Failed to disable ${app.name}: ${result.error}`, 'error');
                setBusyIds(prev => { const n = new Set(prev); n.delete(app.id); return n; });
                return;
            }
            setApps(prev => {
                const next = prev.map(a => a.id === app.id ? { ...a, autoStart: false } : a);
                writeApps(next);
                return next;
            });
            showToast(`${app.name} removed from startup`);
        } catch (err) {
            showToast(`Error disabling ${app.name}: ${err.message}`, 'error');
        }
        setBusyIds(prev => { const n = new Set(prev); n.delete(app.id); return n; });
    }, [showToast, homeDir]);

    // ── Start / Stop / Restart app now ────────────────────────────────────────────
    const startNow = useCallback(async (app) => {
        setBusyIds(prev => new Set(prev).add(app.id));
        try {
            if (app.id === 'eidos' && window.electron?.eidosStart) {
                showToast('Starting Eidos (Docker + Dashboard)...');
                const res = await window.electron.eidosStart();
                if (res && res.error) {
                    showToast(`Error starting Eidos: ${res.error}`, 'error');
                } else {
                    showToast('Eidos started successfully!');
                    setTimeout(refreshPorts, 2000);
                }
                return;
            }
            if (!app.startCommand) {
                showToast(`${app.name} has no start command configured`, 'error');
                return;
            }
            const result = await window.electron.localhostStartNow({
                cwd: app.cwd ? app.cwd.replace('~', homeDir) : null,
                command: app.startCommand,
            });
            if (!result.ok) {
                showToast(`Error starting ${app.name}: ${result.error}`, 'error');
            } else {
                showToast(`Starting ${app.name}...`);
                setTimeout(refreshPorts, 2000);
            }
        } catch (err) {
            showToast(`Error starting ${app.name}: ${err.message}`, 'error');
        } finally {
            setBusyIds(prev => { const n = new Set(prev); n.delete(app.id); return n; });
        }
    }, [showToast, homeDir, refreshPorts]);

    const stopNow = useCallback(async (app) => {
        setBusyIds(prev => new Set(prev).add(app.id));
        try {
            if (app.id === 'eidos' && window.electron?.eidosStop) {
                await window.electron.eidosStop();
            } else if (window.electron?.localhostStopNow) {
                await window.electron.localhostStopNow({ port: app.port, id: app.id });
            }
            showToast(`Stopped ${app.name}`);
            setTimeout(refreshPorts, 1200);
        } catch (err) {
            showToast(`Error stopping ${app.name}: ${err.message}`, 'error');
        } finally {
            setBusyIds(prev => { const n = new Set(prev); n.delete(app.id); return n; });
        }
    }, [showToast, refreshPorts]);

    const restartNow = useCallback(async (app) => {
        setBusyIds(prev => new Set(prev).add(app.id));
        try {
            showToast(`Restarting ${app.name}...`);
            if (app.id === 'eidos' && window.electron?.eidosStop) {
                await window.electron.eidosStop();
            } else if (window.electron?.localhostStopNow) {
                await window.electron.localhostStopNow({ port: app.port, id: app.id });
            }
            await new Promise(r => setTimeout(r, 1200));

            if (app.id === 'eidos' && window.electron?.eidosStart) {
                const res = await window.electron.eidosStart();
                if (res && res.error) {
                    showToast(`Error restarting Eidos: ${res.error}`, 'error');
                } else {
                    showToast('Eidos restarted successfully!');
                }
            } else if (app.startCommand && window.electron?.localhostStartNow) {
                await window.electron.localhostStartNow({
                    cwd: app.cwd ? app.cwd.replace('~', homeDir) : null,
                    command: app.startCommand,
                });
            }
            setTimeout(refreshPorts, 2000);
        } catch (err) {
            showToast(`Error restarting ${app.name}: ${err.message}`, 'error');
        } finally {
            setBusyIds(prev => { const n = new Set(prev); n.delete(app.id); return n; });
        }
    }, [showToast, homeDir, refreshPorts]);

    // ── Add custom app ──────────────────────────────────────────────────
    const addApp = useCallback((e) => {
        e.preventDefault();
        if (!addName.trim()) return;
        const slug = addName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
        const newApp = {
            id: slug || `custom-${Date.now()}`,
            name: addName.trim(),
            port: parseInt(addPort) || 0,
            url: addPort ? `http://localhost:${addPort}` : '',
            startCommand: addCommand.trim(),
            cwd: addCwd.trim(),
            autoStart: false,
        };
        setApps(prev => {
            if (prev.find(a => a.id === newApp.id)) {
                showToast(`App "${newApp.name}" already exists`, 'error');
                return prev;
            }
            const next = [...prev, newApp];
            writeApps(next);
            return next;
        });
        setAddName('');
        setAddPort('');
        setAddCommand('');
        setAddCwd('');
        setShowAddForm(false);
        showToast(`Added ${newApp.name}`);
    }, [addName, addPort, addCommand, addCwd, showToast]);

    const removeApp = useCallback((appId) => {
        const app = apps.find(a => a.id === appId);
        if (!app) return;
        if (app.autoStart) {
            disableAutoStart(app).then(() => {
                setApps(prev => {
                    const next = prev.filter(a => a.id !== appId);
                    writeApps(next);
                    return next;
                });
            });
        } else {
            setApps(prev => {
                const next = prev.filter(a => a.id !== appId);
                writeApps(next);
                return next;
            });
            showToast(`Removed ${app.name}`);
        }
    }, [apps, disableAutoStart, showToast]);

    const isRunning = useCallback((app) => {
        return app.port > 0 && runningPorts.has(app.port);
    }, [runningPorts]);

    const orderedApps = useMemo(() => {
        const sortByName = (a, b) => a.name.localeCompare(b.name);
        const running = apps.filter(a => isRunning(a)).sort(sortByName);
        const stopped = apps.filter(a => !isRunning(a)).sort(sortByName);
        return { running, stopped };
    }, [apps, isRunning]);

    // ── Edit app ──────────────────────────────────────────────────────
    const startEdit = useCallback((app) => {
        setEditingAppId(app.id);
        setEditName(app.name);
        setEditPort(app.port > 0 ? app.port.toString() : '');
        setEditCwd(app.cwd || '');
        setEditCommand(app.startCommand || '');
    }, []);

    const cancelEdit = useCallback(() => {
        setEditingAppId(null);
        setEditName('');
        setEditPort('');
        setEditCwd('');
        setEditCommand('');
    }, []);

    const saveEdit = useCallback(() => {
        if (!editName.trim()) return;
        setApps(prev => {
            const next = prev.map(a => {
                if (a.id !== editingAppId) return a;
                const port = parseInt(editPort) || 0;
                return {
                    ...a,
                    name: editName.trim(),
                    port,
                    url: port ? `http://localhost:${port}` : '',
                    cwd: editCwd.trim(),
                    startCommand: editCommand.trim(),
                };
            });
            writeApps(next);
            return next;
        });
        setEditingAppId(null);
        setEditName('');
        setEditPort('');
        setEditCwd('');
        setEditCommand('');
        showToast('Changes saved');
    }, [editingAppId, editName, editPort, editCwd, editCommand, showToast]);

    return (
        <div className="h-full w-full flex flex-col bg-[var(--bg-primary)] overflow-y-auto">
            {/* Toast */}
            {toast && (
                <div className={`absolute top-3 right-3 z-50 rounded-lg border px-3 py-2 text-xs font-medium shadow-lg backdrop-blur-sm transition-all ${
                    toast.type === 'error'
                        ? 'border-red-500/40 bg-red-500/15 text-red-400'
                        : 'border-green-500/40 bg-green-500/15 text-green-400'
                }`}>
                    <div className="flex items-center gap-2">
                        {toast.type === 'error' ? <AlertCircle size={12} /> : <CheckCircle size={12} />}
                        {toast.msg}
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-secondary)]/30 px-4 py-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--accent)]/10">
                            <Server size={14} className="text-[var(--accent)]" />
                        </div>
                        <h2 className="text-sm font-semibold text-[var(--text-primary)]">Localhost Manager</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-[var(--text-tertiary)]">
                            {apps.filter(a => isRunning(a)).length}/{apps.length} running
                        </span>
                        <button
                            type="button"
                            onClick={refreshPorts}
                            disabled={scanning}
                            className="micro-interaction rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)] disabled:opacity-40"
                            title="Re-scan ports & probe health"
                        >
                            <RefreshCw size={12} className={scanning ? 'animate-spin' : ''} />
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                window.electron.hostsRead().then(res => {
                                    if (res.error) {
                                        showToast(res.error, 'error');
                                    } else {
                                        setHostsContent(res);
                                        setShowHostsModal(true);
                                    }
                                }).catch(err => showToast(err.message, 'error'));
                            }}
                            className="micro-interaction flex items-center gap-1 rounded-md bg-[var(--bg-hover)] px-2 py-1 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--border)]"
                            title="Edit /etc/hosts to map custom domains"
                        >
                            <Globe size={11} />
                            /etc/hosts
                        </button>
                        <button
                            type="button"
                            onClick={() => setShowAddForm(v => !v)}
                            className="micro-interaction flex items-center gap-1 rounded-md bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-white transition-colors hover:bg-[var(--accent-hover)]"
                        >
                            <Plus size={11} />
                            Add App
                        </button>
                    </div>
                </div>
                {/* Add form */}
                {showAddForm && (
                    <form onSubmit={addApp} className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                        <div className="grid grid-cols-2 gap-2">
                            <div className="col-span-2">
                                <label className="mb-1 block text-[10px] font-medium text-[var(--text-tertiary)]">App Name *</label>
                                <input
                                    type="text"
                                    value={addName}
                                    onChange={e => setAddName(e.target.value)}
                                    placeholder="e.g. My App"
                                    required
                                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-[10px] font-medium text-[var(--text-tertiary)]">Port</label>
                                <input
                                    type="number"
                                    value={addPort}
                                    onChange={e => setAddPort(e.target.value)}
                                    placeholder="e.g. 3000"
                                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-[10px] font-medium text-[var(--text-tertiary)]">Working Dir</label>
                                <input
                                    type="text"
                                    value={addCwd}
                                    onChange={e => setAddCwd(e.target.value)}
                                    placeholder="e.g. ~/my-app"
                                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
                                />
                            </div>
                            <div className="col-span-2">
                                <label className="mb-1 block text-[10px] font-medium text-[var(--text-tertiary)]">Start Command</label>
                                <input
                                    type="text"
                                    value={addCommand}
                                    onChange={e => setAddCommand(e.target.value)}
                                    placeholder="e.g. npm run dev"
                                    className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none"
                                />
                            </div>
                        </div>
                        <div className="mt-2 flex justify-end gap-2">
                            <button type="button" onClick={() => setShowAddForm(false)} className="rounded-md px-2.5 py-1 text-[11px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancel</button>
                            <button type="submit" className="rounded-md bg-[var(--accent)] px-3 py-1 text-[11px] font-medium text-white hover:bg-[var(--accent-hover)]">Add</button>
                        </div>
                    </form>
                )}
            </div>

            {/* Running apps section */}
            <div className="shrink-0 border-b border-[var(--border)]">
                <button
                    type="button"
                    onClick={() => setExpandedSection(expandedSection === 'running' ? 'all' : 'running')}
                    className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]/30"
                >
                    <Play size={11} className="text-green-400" />
                    <span className="text-xs font-medium text-[var(--text-primary)]">Running</span>
                    <span className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">{orderedApps.running.length}</span>
                    <div className="flex-1" />
                    {expandedSection === 'running' ? <ChevronUp size={11} className="text-[var(--text-tertiary)]" /> : <ChevronDown size={11} className="text-[var(--text-tertiary)]" />}
                </button>
                {(expandedSection === 'all' || expandedSection === 'running') && (
                    <div className="px-4 pb-2">
                        {orderedApps.running.length === 0 ? (
                            <p className="py-2 text-[11px] text-[var(--text-tertiary)]">No running apps detected.</p>
                        ) : (
                            <AppList
                                apps={orderedApps.running}
                                isRunning={isRunning}
                                appHealthMap={appHealthMap}
                                busyIds={busyIds}
                                onNavigate={onNavigate}
                                onStart={startNow}
                                onStop={stopNow}
                                onRestart={restartNow}
                                onEnableAutoStart={enableAutoStart}
                                onDisableAutoStart={disableAutoStart}
                                onRemove={removeApp}
                                editingAppId={editingAppId}
                                onEditStart={startEdit}
                                onEditSave={saveEdit}
                                onEditCancel={cancelEdit}
                                editName={editName}
                                setEditName={setEditName}
                                editPort={editPort}
                                setEditPort={setEditPort}
                                editCwd={editCwd}
                                setEditCwd={setEditCwd}
                                editCommand={editCommand}
                                setEditCommand={setEditCommand}
                            />
                        )}
                    </div>
                )}
            </div>

            {/* Stopped apps section */}
            <div className="shrink-0">
                <div className="border-b border-[var(--border)]">
                    <button
                        type="button"
                        onClick={() => setExpandedSection(expandedSection === 'stopped' ? 'all' : 'stopped')}
                        className="flex w-full items-center gap-2 px-4 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]/30"
                    >
                        <Square size={11} className="text-[var(--text-tertiary)]" />
                        <span className="text-xs font-medium text-[var(--text-primary)]">Stopped</span>
                        <span className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">{orderedApps.stopped.length}</span>
                        <div className="flex-1" />
                        {expandedSection === 'stopped' ? <ChevronUp size={11} className="text-[var(--text-tertiary)]" /> : <ChevronDown size={11} className="text-[var(--text-tertiary)]" />}
                    </button>
                    {(expandedSection === 'all' || expandedSection === 'stopped') && (
                        <div className="px-4 pb-2">
                            {orderedApps.stopped.length === 0 ? (
                                <p className="py-2 text-[11px] text-[var(--text-tertiary)]">All apps are running.</p>
                            ) : (
                                <AppList
                                    apps={orderedApps.stopped}
                                    isRunning={isRunning}
                                    appHealthMap={appHealthMap}
                                    busyIds={busyIds}
                                    onNavigate={onNavigate}
                                    onStart={startNow}
                                    onStop={stopNow}
                                    onRestart={restartNow}
                                    onEnableAutoStart={enableAutoStart}
                                    onDisableAutoStart={disableAutoStart}
                                    onRemove={removeApp}
                                    editingAppId={editingAppId}
                                    onEditStart={startEdit}
                                    onEditSave={saveEdit}
                                    onEditCancel={cancelEdit}
                                    editName={editName}
                                    setEditName={setEditName}
                                    editPort={editPort}
                                    setEditPort={setEditPort}
                                    editCwd={editCwd}
                                    setEditCwd={setEditCwd}
                                    editCommand={editCommand}
                                    setEditCommand={setEditCommand}
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Hosts Modal */}
            {showHostsModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
                    <div className="flex flex-col w-full max-w-2xl bg-[var(--bg-primary)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden max-h-[90vh]">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)] bg-[var(--bg-secondary)]/50">
                            <div className="flex items-center gap-2">
                                <Globe size={16} className="text-[var(--accent)]" />
                                <h3 className="font-semibold text-[var(--text-primary)]">Edit /etc/hosts</h3>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowHostsModal(false)}
                                disabled={savingHosts}
                                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                            >
                                <X size={16} />
                            </button>
                        </div>
                        <div className="p-4 flex-1 overflow-y-auto">
                            <p className="text-xs text-[var(--text-secondary)] mb-3 leading-relaxed">
                                Use this file to map custom domains (like <code>nodus.local</code>) to IP addresses (like <code>127.0.0.1</code>).<br />
                                <strong>Note:</strong> You cannot map a domain directly to a port here. You still need to include the port in the URL (e.g. <code>http://nodus.local:6280</code>).
                            </p>
                            <textarea
                                value={hostsContent}
                                onChange={(e) => setHostsContent(e.target.value)}
                                disabled={savingHosts}
                                spellCheck={false}
                                className="w-full h-96 p-3 bg-[#1e1e1e] text-[#d4d4d4] font-mono text-xs rounded-md border border-[var(--border)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
                            />
                        </div>
                        <div className="flex items-center justify-end gap-3 px-4 py-3 border-t border-[var(--border)] bg-[var(--bg-secondary)]/50">
                            <button
                                type="button"
                                onClick={() => setShowHostsModal(false)}
                                disabled={savingHosts}
                                className="px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                disabled={savingHosts}
                                onClick={async () => {
                                    setSavingHosts(true);
                                    try {
                                        const res = await window.electron.hostsWrite(hostsContent);
                                        if (res.error) {
                                            showToast(res.error, 'error');
                                        } else {
                                            showToast('Successfully updated /etc/hosts');
                                            setShowHostsModal(false);
                                        }
                                    } catch (err) {
                                        showToast(err.message, 'error');
                                    } finally {
                                        setSavingHosts(false);
                                    }
                                }}
                                className="px-3 py-1.5 flex items-center gap-2 text-xs font-medium text-white bg-[var(--accent)] rounded-md hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
                            >
                                {savingHosts ? (
                                    <>
                                        <RefreshCw size={12} className="animate-spin" />
                                        Saving...
                                    </>
                                ) : (
                                    'Save Changes (Requires Admin)'
                                )}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// ── Compact app card (2-column grid) ────────────────────────────────────
function AppRow({ app, isRunning, appHealthMap, busy, onNavigate, onStart, onStop, onRestart, onEnableAutoStart, onDisableAutoStart, onRemove, isEditing, onEditStart, onEditSave, onEditCancel, editName, setEditName, editPort, setEditPort, editCwd, setEditCwd, editCommand, setEditCommand }) {
    const hasCommand = !!app.startCommand || app.id === 'eidos';
    const running = isRunning(app);
    const health = appHealthMap[app.id] || { state: 'unknown' };
    const healthy = health.state === 'healthy';
    const degraded = health.state === 'http-error' || health.state === 'unreachable';
    const healthLabel = health.state === 'http-error'
        ? `HTTP ${health.status}`
        : health.state === 'unreachable'
            ? 'No response'
            : health.state === 'unavailable'
                ? 'Restart'
                : null;
    let healthTitle = `Running on port :${app.port}; checking HTTP response`;
    if (healthy) healthTitle = `Running & Healthy on port :${app.port}`;
    if (health.state === 'http-error') healthTitle = `Port :${app.port} open; HTTP responded ${health.status}`;
    if (health.state === 'unreachable') healthTitle = `Port :${app.port} open, but its configured URL did not respond`;
    if (health.state === 'unavailable') healthTitle = 'Restart Perci to enable the HTTP health probe';

    if (isEditing) {
        return (
            <div className="col-span-1 rounded-lg border border-[var(--accent)]/30 bg-[var(--bg-secondary)] p-2.5">
                <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-medium text-[var(--text-tertiary)]">Name</label>
                    <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[10px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50"
                    />
                    <label className="text-[9px] font-medium text-[var(--text-tertiary)]">Port</label>
                    <input
                        type="number"
                        value={editPort}
                        onChange={e => setEditPort(e.target.value)}
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[10px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50"
                    />
                    <label className="text-[9px] font-medium text-[var(--text-tertiary)]">Working Dir</label>
                    <input
                        type="text"
                        value={editCwd}
                        onChange={e => setEditCwd(e.target.value)}
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[10px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50"
                    />
                    <label className="text-[9px] font-medium text-[var(--text-tertiary)]">Start Command</label>
                    <input
                        type="text"
                        value={editCommand}
                        onChange={e => setEditCommand(e.target.value)}
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-[10px] text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)]/50"
                    />
                    <div className="mt-1 flex justify-end gap-2">
                        <button type="button" onClick={onEditCancel} className="rounded-md px-2 py-1 text-[10px] text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancel</button>
                        <button type="button" onClick={onEditSave} className="rounded-md bg-[var(--accent)] px-2 py-1 text-[10px] font-medium text-white hover:bg-[var(--accent-hover)]">Save</button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className={`group relative flex flex-col gap-1.5 rounded-lg border px-2.5 py-2 transition-all ${
            running
                ? degraded
                    ? 'border-amber-500/30 bg-amber-500/[0.05]'
                    : healthy
                        ? 'border-green-500/20 bg-green-500/[0.03]'
                        : 'border-[var(--border)] bg-[var(--bg-primary)]'
                : 'border-[var(--border)] bg-[var(--bg-primary)] hover:border-[var(--accent)]/20'
        }`}>
            {/* Top row: status bar + name + auto badge */}
            <div className="flex items-center gap-2">
                {/* Health / Status indicator */}
                <div
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        running
                            ? degraded
                                ? 'bg-amber-400 shadow-[0_0_4px_rgba(251,191,36,0.5)] animate-pulse'
                                : healthy
                                    ? 'bg-green-400 shadow-[0_0_4px_rgba(74,222,128,0.4)]'
                                    : 'bg-[var(--text-tertiary)]'
                            : 'bg-[var(--text-tertiary)]'
                    }`}
                    title={running ? healthTitle : 'Stopped'}
                />
                <span className="min-w-0 flex-1 truncate text-xs font-medium text-[var(--text-primary)]">{app.name}</span>
                {running && healthLabel && (
                    <span className="shrink-0 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-1.5 py-[1px] text-[8px] font-medium text-[var(--accent)]">
                        {healthLabel}
                    </span>
                )}
                {app.autoStart && (
                    <span className="shrink-0 rounded-full bg-[var(--accent)]/10 px-1.5 py-[1px] text-[8px] font-medium text-[var(--accent)]">Auto</span>
                )}
            </div>

            {/* Middle row: port + command */}
            <div className="flex items-center gap-1.5 text-[9px] text-[var(--text-tertiary)] min-w-0">
                {app.port > 0 && (
                    <span className="shrink-0 font-mono">:{app.port}</span>
                )}
                {(() => {
                    const cmd = app.startCommand;
                    if (!cmd) return null;
                    const short = cmd.startsWith('cd ~/') ? cmd.replace(/^cd ~\//, '').replace(/ && .*/, '') : cmd;
                    return (
                        <span className="truncate">
                            <Terminal size={7} className="mr-0.5 inline-block align-baseline" />
                            {short}
                        </span>
                    );
                })()}
            </div>

            {/* Actions row */}
            <div className="flex items-center gap-0.5 -ml-0.5">
                {app.port > 0 && (
                    <button
                        type="button"
                        onClick={() => onNavigate && onNavigate(app.port)}
                        className="micro-interaction rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]"
                        title={`Open localhost:${app.port}`}
                    >
                        <ExternalLink size={10} />
                    </button>
                )}
                {!running && hasCommand && (
                    <button
                        type="button"
                        onClick={() => onStart(app)}
                        disabled={busy}
                        className="micro-interaction rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:bg-green-500/10 hover:text-green-400 disabled:opacity-40"
                        title="Start now"
                    >
                        <Play size={10} />
                    </button>
                )}
                {running && (
                    <>
                        <button
                            type="button"
                            onClick={() => onStop(app)}
                            disabled={busy}
                            className="micro-interaction rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:bg-red-500/10 hover:text-red-400 disabled:opacity-40"
                            title="Stop process / free port"
                        >
                            <Square size={10} />
                        </button>
                        <button
                            type="button"
                            onClick={() => onRestart(app)}
                            disabled={busy}
                            className="micro-interaction rounded-md p-1 text-[var(--text-tertiary)] transition-colors hover:bg-blue-500/10 hover:text-blue-400 disabled:opacity-40"
                            title="Restart app"
                        >
                            <RotateCw size={10} className={busy ? 'animate-spin' : ''} />
                        </button>
                    </>
                )}
                <div className="flex-1" />
                <button
                    type="button"
                    onClick={() => onEditStart(app)}
                    className="micro-interaction rounded-md p-1 text-[var(--text-tertiary)] opacity-0 transition-all hover:text-[var(--accent)] group-hover:opacity-100"
                    title="Edit app"
                >
                    <Pencil size={10} />
                </button>
                {app.autoStart ? (
                    <button
                        type="button"
                        onClick={() => onDisableAutoStart(app)}
                        disabled={busy}
                        className={`micro-interaction rounded-md p-1 transition-colors disabled:opacity-40 ${
                            busy ? 'animate-pulse' : 'text-[var(--accent)] hover:bg-red-500/10 hover:text-red-400'
                        }`}
                        title="Remove from startup"
                    >
                        <PowerOff size={10} />
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={() => onEnableAutoStart(app)}
                        disabled={busy || !hasCommand}
                        className={`micro-interaction rounded-md p-1 transition-colors disabled:opacity-30 ${
                            busy ? 'animate-pulse' : 'text-[var(--text-tertiary)] hover:bg-green-500/10 hover:text-green-400'
                        }`}
                        title={hasCommand ? 'Enable auto-start on boot' : 'No start command configured'}
                    >
                        <Power size={10} />
                    </button>
                )}
                {!DEFAULT_APPS.find(d => d.id === app.id) && (
                    <button
                        type="button"
                        onClick={() => onRemove(app.id)}
                        className="micro-interaction rounded-md p-1 text-[var(--text-tertiary)] opacity-0 transition-all hover:text-red-400 group-hover:opacity-100"
                        title="Remove app"
                    >
                        <X size={10} />
                    </button>
                )}
            </div>
        </div>
    );
}

function AppList({ apps, isRunning, appHealthMap, busyIds, onNavigate, onStart, onStop, onRestart, onEnableAutoStart, onDisableAutoStart, onRemove, editingAppId, onEditStart, onEditSave, onEditCancel, editName, setEditName, editPort, setEditPort, editCwd, setEditCwd, editCommand, setEditCommand }) {
    return (
        <div className="grid grid-cols-2 gap-1.5">
            {apps.map(app => (
                <AppRow
                    key={app.id}
                    app={app}
                    isRunning={isRunning}
                    appHealthMap={appHealthMap}
                    busy={busyIds.has(app.id)}
                    onNavigate={onNavigate}
                    onStart={onStart}
                    onStop={onStop}
                    onRestart={onRestart}
                    onEnableAutoStart={onEnableAutoStart}
                    onDisableAutoStart={onDisableAutoStart}
                    onRemove={onRemove}
                    isEditing={editingAppId === app.id}
                    onEditStart={onEditStart}
                    onEditSave={onEditSave}
                    onEditCancel={onEditCancel}
                    editName={editName}
                    setEditName={setEditName}
                    editPort={editPort}
                    setEditPort={setEditPort}
                    editCwd={editCwd}
                    setEditCwd={setEditCwd}
                    editCommand={editCommand}
                    setEditCommand={setEditCommand}
                />
            ))}
        </div>
    );
}
