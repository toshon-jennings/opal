import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import lhLogo from '../assets/lh-logo.png';
import './LighthouseMode.css';

// ── Process name mapping (same as Lighthouse) ──────────────────────────
const PROCESS_NAME_MAP = {
  'com.docke': 'Docker Desktop', 'Docker': 'Docker Desktop', 'docker': 'Docker',
  'ControlCe': 'AirPlay Receiver', 'rapportd': 'AirPlay / Handoff',
  'LM Studio': 'LM Studio', 'node': 'Node.js', 'node.exe': 'Node.js',
  'next-server': 'Next.js', 'next-dev': 'Next.js (dev)', 'vite': 'Vite',
  'python3.1': 'Hermes Agent', 'python3': 'Python', 'python': 'Python',
  'ollama': 'Ollama', 'Ollama': 'Ollama', 'keybase': 'Keybase',
  'kbfs': 'Keybase FS', 'Raycast': 'Raycast', 'Electron': 'Perci',
  'Antigravi': 'Antigravity', 'app_inkwe': 'Inkweasel',
  'language_': 'Language Server', 'lmlink-co': 'LM Link',
  'Mountain': 'Mountain', 'sshd': 'SSH', 'postgres': 'PostgreSQL',
  'redis-server': 'Redis', 'nginx': 'nginx',
};

function friendlyProcessName(raw) {
  if (!raw) return '—';
  const name = String(raw).split('/').pop();
  if (PROCESS_NAME_MAP[name]) return PROCESS_NAME_MAP[name];
  const base = name.replace(/\d+(\.\d+)*$/, '').toLowerCase();
  if (base === 'python') return 'Python';
  if (base === 'node') return 'Node.js';
  return name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function sourceLabel(source) {
  const labels = { Live: 'Live', Portmaster: 'Portmaster', Docker: 'Docker', ProjectConfig: 'Config' };
  return labels[source] || source || 'Unknown';
}

function parentProcessDescription(details) {
  if (!details?.parent_pid) {
    return 'Lighthouse could not identify the parent PID for this listener.';
  }

  const parentRaw = details.parent_name || details.parent_command || '';
  const parentName = friendlyProcessName(parentRaw);
  const parentLabel = parentName && parentName !== '—' ? parentName : 'an unknown process';
  const normalized = String(parentRaw || parentLabel).toLowerCase();

  if (details.parent_pid === 1 || normalized.includes('launchd')) {
    return 'Parent PID 1 is launchd, macOS’s system service manager. This usually means macOS is supervising the listener, or the original launcher exited and launchd adopted it.';
  }
  if (normalized.includes('docker')) {
    return `Parent PID ${details.parent_pid} is ${parentLabel}, so this listener belongs to Docker’s background runtime.`;
  }
  if (normalized.includes('electron') || normalized.includes('perci')) {
    return `Parent PID ${details.parent_pid} is ${parentLabel}, so this listener is owned by the Perci desktop app.`;
  }
  if (normalized.includes('npm') || normalized.includes('pnpm') || normalized.includes('yarn') || normalized.includes('vite') || normalized.includes('node')) {
    return `Parent PID ${details.parent_pid} is ${parentLabel}, the local development command supervising this listener.`;
  }
  return `Parent PID ${details.parent_pid} is ${parentLabel}, the immediate parent process for this listener.`;
}

// ── Toast system ───────────────────────────────────────────────────────
function useToasts() {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const showToast = useCallback((title, message, type = 'info') => {
    const id = ++idRef.current;
    setToasts(prev => [...prev, { id, title, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  }, []);

  return { toasts, showToast };
}

function ToastContainer({ toasts }) {
  if (!toasts.length) return null;
  return (
    <div className="lh-toast-container">
      {toasts.map(t => (
        <div key={t.id} className={`lh-toast lh-toast-${t.id}`}>
          <div className="lh-toast-icon">
            {t.type === 'success' ? '✓' : t.type === 'warn' ? '⚠' : '⌁'}
          </div>
          <div className="lh-toast-content">
            <div className="lh-toast-title">{t.title}</div>
            <div className="lh-toast-body">{t.message}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────
export default function LighthouseMode() {
  const [ports, setPorts] = useState([]);
  const [portmasterFiles, setPortmasterFiles] = useState([]);
  const [portmasterEntries, setPortmasterEntries] = useState([]);
  const [lastScan, setLastScan] = useState(null);
  const [status, setStatus] = useState('ready');
  const [statusText, setStatusText] = useState('Ready');
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState('all');
  const [sortKey, setSortKey] = useState('port');
  const [sortDir, setSortDir] = useState('asc');
  const [checkPortInput, setCheckPortInput] = useState('');
  const [checkResult, setCheckResult] = useState(null);
  const [expandedPid, setExpandedPid] = useState(null);
  const [processDetails, setProcessDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [conflicts, setConflicts] = useState([]);
  const [resolving, setResolving] = useState(null); // { conflict, refs, killChecked, refChecks, loading, applying }

  const { toasts, showToast } = useToasts();
  const isDesktop = Boolean(window.electron?.lighthouseScan);
  const checkResultRef = useRef(null);
  const conflictsStripRef = useRef(null);

  // Map vertical mouse-wheel to horizontal scroll on the conflicts strip
  // (wheel up → left, down → right). Only intercept when it actually overflows.
  useEffect(() => {
    const el = conflictsStripRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (e.deltaY === 0 || el.scrollWidth <= el.clientWidth) return;
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [conflicts]);

  // ── Scan ──────────────────────────────────────────────────────────
  const scan = useCallback(async () => {
    if (!isDesktop) return;
    setScanning(true);
    setStatusText('Scanning');
    try {
      const result = await window.electron.lighthouseScan();
      setPorts(result.ports || []);
      setPortmasterFiles(result.portmaster_files || []);
      setPortmasterEntries(result.portmaster_entries || []);
      setLastScan(result.last_scan);
      setStatus(result.status || 'ok');
      setConflicts(result.conflicts || []);
      const conflictCount = (result.conflicts || []).length;
      setStatusText(conflictCount > 0 ? `${conflictCount} conflict(s)` : 'All clear');
    } catch (err) {
      setStatus('error');
      setStatusText(`Error: ${err}`);
    } finally {
      setScanning(false);
    }
  }, [isDesktop]);

  // Auto-scan on mount
  useEffect(() => { scan(); }, [scan]);

  // ── Sorting ───────────────────────────────────────────────────────
  const handleSort = useCallback((key) => {
    setSortKey(prev => {
      if (prev === key) {
        setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        return prev;
      }
      setSortDir('asc');
      return key;
    });
  }, []);

  const sortedPorts = useMemo(() => {
    let filtered = ports;
    if (filter !== 'all') {
      filtered = ports.filter(p => {
        switch (filter) {
          case 'live': return p.source === 'Live';
          case 'portmaster': return p.source === 'Portmaster';
          case 'docker': return p.source === 'Docker';
          case 'config': return p.source === 'ProjectConfig';
          default: return true;
        }
      });
    }

    const sorted = [...filtered].sort((a, b) => {
      let aVal, bVal;
      switch (sortKey) {
        case 'port': aVal = Number(a.port || 0); bVal = Number(b.port || 0); break;
        case 'bind_address': aVal = (a.bind_address || '').toLowerCase(); bVal = (b.bind_address || '').toLowerCase(); break;
        case 'service': aVal = (a.service_name || a.project || '').toLowerCase(); bVal = (b.service_name || b.project || '').toLowerCase(); break;
        case 'process_name': aVal = (a.process_name || '').toLowerCase(); bVal = (b.process_name || '').toLowerCase(); break;
        case 'source': aVal = (a.source || '').toLowerCase(); bVal = (b.source || '').toLowerCase(); break;
        case 'managed_by': aVal = (a.managed_by || '').toLowerCase(); bVal = (b.managed_by || '').toLowerCase(); break;
        default: aVal = Number(a.port || 0); bVal = Number(b.port || 0);
      }
      let cmp = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        cmp = aVal - bVal;
      } else {
        cmp = String(aVal).localeCompare(String(bVal), undefined, { sensitivity: 'base' });
      }
      if (cmp === 0) cmp = Number(a.port || 0) - Number(b.port || 0);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return sorted;
  }, [ports, filter, sortKey, sortDir]);

  // ── Port detail expansion ────────────────────────────────────────
  const togglePortDetail = useCallback(async (portNum, bindAddr) => {
    const key = `${portNum}-${bindAddr}`;
    if (expandedPid === key) {
      setExpandedPid(null);
      setProcessDetails(null);
      return;
    }
    const portInfo = ports.find(p => p.port === portNum && (p.bind_address === bindAddr || (!p.bind_address && bindAddr === '0.0.0.0')));
    if (!portInfo?.pid) return;
    setExpandedPid(key);
    setLoadingDetails(true);
    try {
      const d = await window.electron.lighthouseProcessDetails(portInfo.pid);
      setProcessDetails(d);
    } catch {
      setProcessDetails({ error: 'Failed to load process details' });
    } finally {
      setLoadingDetails(false);
    }
  }, [ports, expandedPid]);

  // ── Check port ───────────────────────────────────────────────────
  const checkPort = useCallback(async (port) => {
    const portNum = port || parseInt(checkPortInput, 10);
    if (!portNum) return;
    try {
      const result = await window.electron.lighthouseCheckPort(portNum);
      setCheckResult(result);
      if (result.in_use) {
        const processStr = result.process ? `${result.process} (PID: ${result.pid})` : 'Unknown process';
        const suggestionStr = result.suggestion ? `. Try port ${result.suggestion}` : '';
        showToast(`Port ${result.port} is occupied`, `${processStr}${suggestionStr}`, 'warn');
      } else {
        showToast(`Port ${result.port} is free`, 'This port is currently available for local bindings.', 'success');
      }
      // Scroll to result
      setTimeout(() => {
        checkResultRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 50);
    } catch (err) {
      showToast('Check failed', String(err), 'warn');
    }
  }, [checkPortInput, showToast]);

  // ── Suggest port ─────────────────────────────────────────────────
  const suggestPort = useCallback(async () => {
    try {
      const suggested = await window.electron.lighthouseSuggestPort();
      setCheckResult({ port: suggested, in_use: false, suggestion: null });
      showToast(`Suggested free port: ${suggested}`, 'First available in the 3000–3999 range.', 'success');
    } catch (err) {
      showToast('Suggest failed', String(err), 'warn');
    }
  }, [showToast]);

  // ── Kill process ─────────────────────────────────────────────────
  const killProcess = useCallback(async (pid, processName) => {
    if (!confirm(`Kill ${processName} (PID: ${pid})?`)) return;
    try {
      const result = await window.electron.lighthouseKillProcess(pid);
      if (result.ok) {
        showToast('Process killed', result.message, 'success');
        scan();
      } else {
        showToast('Kill failed', result.error, 'warn');
      }
    } catch (err) {
      showToast('Kill failed', String(err), 'warn');
    }
  }, [scan, showToast]);

  // ── Resolve conflict (preview + per-item confirm) ────────────────
  const openResolve = useCallback(async (conflict) => {
    setResolving({ conflict, refs: [], kills: {}, refChecks: {}, loading: true, applying: false });
    let refs = [];
    if (conflict.suggestion) {
      try { refs = await window.electron.lighthouseFindReferences(conflict.port, conflict.suggestion); } catch { refs = []; }
    }
    setResolving(r => (r && r.conflict === conflict)
      ? { ...r, refs, refChecks: Object.fromEntries(refs.map((rf, i) => [i, rf.risk !== 'high'])), loading: false }
      : r);
  }, []);

  const applyResolve = useCallback(async () => {
    if (!resolving) return;
    const { conflict, refs, kills, refChecks } = resolving;
    setResolving(r => ({ ...r, applying: true }));
    const errors = [];
    let killedCount = 0;
    for (const proc of (conflict.processes || [])) {
      if (!kills[proc.pid]) continue;
      const res = await window.electron.lighthouseKillProcess(proc.pid);
      if (res.ok) killedCount++; else errors.push(`kill ${proc.pid}: ${res.error || 'failed'}`);
    }
    let applied = 0;
    for (let i = 0; i < refs.length; i++) {
      if (!refChecks[i]) continue;
      const r = refs[i];
      const res = await window.electron.lighthouseApplyFix(r.file_path, r.line_number, r.new_line, r.old_line);
      if (res.ok) applied++; else errors.push(`${r.file_path}:${r.line_number}: ${res.error}`);
    }
    setResolving(null);
    if (errors.length) showToast('Resolved with errors', errors.join('. '), 'warn');
    else showToast('Conflict resolved', `Updated ${applied} file(s)${killedCount ? ` and killed ${killedCount} process(es)` : ''}.`, 'success');
    scan();
  }, [resolving, scan, showToast]);

  // ── Export ───────────────────────────────────────────────────────
  const exportState = useCallback(() => {
    if (!ports.length) {
      showToast('No data', 'Scan first before exporting.', 'warn');
      return;
    }
    const data = { ports, portmaster_files: portmasterFiles, portmaster_entries: portmasterEntries, last_scan: lastScan, exported_at: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'lighthouse-state.json';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Exported', 'Downloaded lighthouse-state.json', 'success');
  }, [ports, portmasterFiles, portmasterEntries, lastScan, showToast]);

  // ── Keyboard shortcuts ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') setShowGuide(false);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  // ── Render ──────────────────────────────────────────────────────
  const statusDotClass = status === 'ok' ? 'lh-dot-ok' : status === 'error' ? 'lh-dot-error' : 'lh-dot-warn';

  return (
    <div className="lh-root">
      <ToastContainer toasts={toasts} />

      {/* Guide modal */}
      {showGuide && (
        <div className="lh-modal-overlay" onClick={() => setShowGuide(false)}>
          <div className="lh-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="lh-modal-header">
              <div>
                <h2>Lighthouse User Guide</h2>
                <p className="lh-modal-subtitle">Track port usage, find conflicts, and understand who owns what.</p>
              </div>
              <button className="lh-icon-btn" onClick={() => setShowGuide(false)} aria-label="Close guide">✕</button>
            </div>
            <div className="lh-modal-body">
              <section className="lh-guide-section">
                <h3>What Lighthouse does</h3>
                <ul>
                  <li>Scans live listening ports on your machine</li>
                  <li>Finds PORTMASTER.md files across agent rules and repositories</li>
                  <li>Helps you spot port conflicts quickly</li>
                  <li>Suggests nearby free ports when a port is already in use</li>
                </ul>
              </section>
              <section className="lh-guide-section">
                <h3>How to use the main table</h3>
                <ul>
                  <li>Click Scan to refresh the live machine state</li>
                  <li>Use the filter buttons to narrow results by source</li>
                  <li>Click any column header to sort ascending or descending</li>
                </ul>
              </section>
              <section className="lh-guide-section">
                <h3>Quick Check</h3>
                <ul>
                  <li>Enter a port number to see if it is currently in use</li>
                  <li>Use Suggest Free to find the next available port in the app-server range</li>
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}

      {/* Resolve modal (preview + per-item confirm) */}
      {resolving && (
        <div className="lh-modal-overlay" onClick={() => setResolving(null)}>
          <div className="lh-modal" onClick={e => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className="lh-modal-header">
              <div>
                <h2>Resolve Port Conflict</h2>
                <p className="lh-modal-subtitle">Port {resolving.conflict.port} — {resolving.conflict.kind === 'duplicate_declaration' ? 'duplicate declaration' : 'owner mismatch'}</p>
              </div>
              <button className="lh-icon-btn" onClick={() => setResolving(null)} aria-label="Close">✕</button>
            </div>
            <div className="lh-modal-body">
              <section className="lh-guide-section">
                <h3>What's conflicting</h3>
                <p className="lh-muted">{resolving.conflict.explanation}</p>
              </section>

              <section className="lh-guide-section">
                <h3>Processes on this port</h3>
                {(resolving.conflict.processes || []).length === 0 ? (
                  <p className="lh-muted">No live process is bound to this port — resolve via the config changes below.</p>
                ) : (
                  resolving.conflict.processes.map(proc => (
                    <label key={proc.pid} className="lh-resolve-check">
                      <input
                        type="checkbox"
                        checked={!!resolving.kills[proc.pid]}
                        onChange={e => setResolving(r => ({ ...r, kills: { ...r.kills, [proc.pid]: e.target.checked } }))}
                      />
                      <span>Kill {friendlyProcessName(proc.name)} (PID {proc.pid})</span>
                    </label>
                  ))
                )}
              </section>

              <section className="lh-guide-section">
                <h3>Config changes {resolving.conflict.suggestion ? `→ port ${resolving.conflict.suggestion}` : ''}</h3>
                {resolving.loading ? (
                  <p className="lh-muted">Searching config files…</p>
                ) : resolving.refs.length === 0 ? (
                  <p className="lh-muted">No config files reference this port. {resolving.conflict.pid_a ? 'You can still kill the process above.' : ''}</p>
                ) : (
                  <>
                    {resolving.refs.some(r => r.risk === 'high') && (
                      <div className="lh-sync-warning">
                        ⚠ {resolving.refs.filter(r => r.risk === 'high').length} change(s) touch env files or deployment-synced values — <strong>off by default</strong>. Turn one on only if you'll also update the remote (Vercel, Supabase, etc.).
                      </div>
                    )}
                    {resolving.refs.map((r, i) => (
                      <div key={`${r.file_path}:${r.line_number}`} className={`lh-resolve-ref ${r.risk === 'high' ? 'lh-risk-row' : ''}`}>
                        <label className="lh-resolve-check">
                          <input
                            type="checkbox"
                            checked={!!resolving.refChecks[i]}
                            onChange={e => setResolving(rs => ({ ...rs, refChecks: { ...rs.refChecks, [i]: e.target.checked } }))}
                          />
                          <span className="lh-resolve-file">{r.file_path.replace(/^\/Users\/[^/]+\//, '~/')}:{r.line_number}</span>
                          {r.risk === 'high' && <span className="lh-risk-badge lh-risk-high" title={r.reason}>⚠ {r.platforms && r.platforms.length ? r.platforms.join('/') : (r.env_file ? 'env' : 'synced')}</span>}
                          {r.risk === 'medium' && <span className="lh-risk-badge lh-risk-medium" title={r.reason}>{r.platforms && r.platforms.length ? r.platforms.join('/') : 'deploy'}</span>}
                        </label>
                        <div className="lh-resolve-diff">
                          <div className="lh-diff-old">- {r.old_line.trim()}</div>
                          <div className="lh-diff-new">+ {r.new_line.trim()}</div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </section>
            </div>
            <div className="lh-modal-footer">
              <button className="lh-btn-secondary" onClick={() => setResolving(null)}>Cancel</button>
              <button
                className="lh-btn-primary"
                disabled={resolving.applying || resolving.loading || (!Object.values(resolving.kills).some(Boolean) && !Object.values(resolving.refChecks).some(Boolean))}
                onClick={applyResolve}
              >
                {resolving.applying ? 'Applying…' : 'Confirm & Apply'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top bar */}
      <header className="lh-topbar">
        <div className="lh-topbar-left">
          <div className="lh-logo">
            <img className="lh-logo-image" src={lhLogo} alt="Lighthouse logo" />
            <div className="lh-logo-copy">
              <h1 className="lh-title">Lighthouse</h1>
              <span className="lh-subtitle">Local development port awareness</span>
            </div>
          </div>
        </div>
        <div className="lh-topbar-right">
          <div className="lh-status-card">
            <span className={`lh-dot ${statusDotClass}`}></span>
            <div>
              <strong>{statusText}</strong>
              <small>Monitoring active</small>
            </div>
          </div>
          <div className="lh-status-card">
            <span className="lh-status-icon">◷</span>
            <div>
              <strong>Last scan</strong>
              <small>{lastScan || 'Never scanned'}</small>
            </div>
          </div>
          <button className="lh-btn-secondary" onClick={() => setShowGuide(true)}>Guide</button>
          <button className="lh-btn-primary" onClick={scan} disabled={scanning}>
            {scanning ? 'Scanning...' : 'Scan Now'}
          </button>
          <button className="lh-btn-secondary" onClick={exportState} title="Export port data as JSON">Export</button>
        </div>
      </header>

      {/* Main content */}
      <div className="lh-content">
        {/* Conflicts bar — single horizontal strip with a sideways scrollbar */}
        {conflicts.length > 0 && (
          <section className="lh-conflicts-bar">
            <div className="lh-conflicts-bar-label">⚠ Conflicts ({conflicts.length})</div>
            <div className="lh-conflicts-strip" ref={conflictsStripRef}>
              {conflicts.map(c => (
                <div key={`${c.port}-${c.kind}`} className="lh-conflict-chip" title={c.explanation}>
                  <span className="lh-conflict-chip-port">{c.port}</span>
                  <span className="lh-conflict-chip-text">{friendlyProcessName(c.process_a)} vs {friendlyProcessName(c.process_b)}</span>
                  {c.suggestion && <span className="lh-conflict-chip-suggestion">→ {c.suggestion}</span>}
                  <button className="lh-conflict-chip-resolve" onClick={() => openResolve(c)}>Resolve</button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Upper grid: Portmaster files + Quick check */}
        <div className="lh-upper-grid">
          <section className="lh-section">
            <div className="lh-section-header lh-section-compact">
              <div>
                <h2>PORTMASTER.md Files</h2>
                <p className="lh-section-subtitle">Registered port ledgers found across local workspaces.</p>
              </div>
            </div>
            <div className="lh-portmaster-list">
              {portmasterFiles.length === 0 ? (
                <p className="lh-muted">No PORTMASTER.md files found</p>
              ) : (
                portmasterFiles.map(f => (
                  <div key={f} className="lh-file-item">
                    <span className="lh-file-path">{f}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="lh-section" ref={checkResultRef}>
            <div className="lh-section-header lh-section-compact">
              <div>
                <h2>Quick Port Check</h2>
                <p className="lh-section-subtitle">Check one port or ask Lighthouse for a clean app-server slot.</p>
              </div>
            </div>
            <div className="lh-check-form">
              <input
                type="number"
                className="lh-input"
                placeholder="Port number, e.g. 3000"
                min="1"
                max="65535"
                value={checkPortInput}
                onChange={e => setCheckPortInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') checkPort(); }}
              />
              <button className="lh-btn-primary" onClick={() => checkPort()}>Check</button>
              <button className="lh-btn-secondary" onClick={suggestPort}>Suggest Free</button>
            </div>
            <div className="lh-common-ports">
              {[3000, 5173, 5432, 6379, 8080].map(p => (
                <button key={p} className="lh-common-btn" onClick={() => { setCheckPortInput(String(p)); checkPort(p); }}>{p}</button>
              ))}
            </div>
            {checkResult && (
              <div className={`lh-check-result ${checkResult.in_use || checkResult.transient_state ? 'lh-check-warn' : 'lh-check-ok'}`}>
                <strong>
                  Port {checkResult.port} is {checkResult.in_use ? 'in use' : checkResult.transient_state ? 'not bound, but not free' : 'free'}
                </strong>
                {checkResult.in_use && checkResult.process && (
                  <p>Process: {friendlyProcessName(checkResult.process)} (PID: {checkResult.pid})</p>
                )}
                {checkResult.in_use && checkResult.bind && (
                  <p>Bind: <code>{checkResult.bind}</code> · {checkResult.protocol || 'TCP'}</p>
                )}
                {!checkResult.in_use && checkResult.transient_state && (
                  <p>A TCP socket is lingering in <code>{checkResult.transient_state}</code>{checkResult.pid ? ` (PID: ${checkResult.pid})` : ''}. Binding now may fail until it clears.</p>
                )}
                {checkResult.in_use && checkResult.suggestion && (
                  <p>Suggestion: Try port {checkResult.suggestion}</p>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Ports table */}
        <section className="lh-section lh-ports-section">
          <div className="lh-section-header">
            <div>
              <h2>Active Ports</h2>
              <p className="lh-section-subtitle">Live listeners, configured claims, and ownership signals from local development services.</p>
            </div>
            <div className="lh-filters">
              {['all', 'live', 'portmaster', 'docker', 'config'].map(f => (
                <button
                  key={f}
                  className={`lh-filter-btn ${filter === f ? 'lh-filter-active' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f === 'all' ? 'All' : f === 'portmaster' ? 'Portmaster' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
          </div>
          <div className="lh-table-wrap">
            <table className="lh-table">
              <thead>
                <tr>
                  {[
                    { key: 'port', label: 'Port' },
                    { key: 'bind_address', label: 'Bind' },
                    { key: 'service', label: 'Service' },
                    { key: 'process_name', label: 'Process' },
                    { key: 'source', label: 'Source' },
                    { key: 'managed_by', label: 'Managed By' },
                  ].map(col => (
                    <th key={col.key}>
                      <button
                        className={`lh-th-btn ${sortKey === col.key ? 'lh-th-active' : ''}`}
                        onClick={() => handleSort(col.key)}
                      >
                        {col.label}
                        <span className={`lh-sort-indicator ${sortKey === col.key ? '' : 'lh-sort-hidden'}`}>
                          {sortKey === col.key ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                        </span>
                      </button>
                    </th>
                  ))}
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedPorts.length === 0 ? (
                  <tr className="lh-empty-state">
                    <td colSpan={7}>{ports.length === 0 ? 'Click "Scan" to discover ports' : 'No ports match the current filter'}</td>
                  </tr>
                ) : (
                  sortedPorts.flatMap(p => {
                    const rows = [];
                    const detailKey = `${p.port}-${p.bind_address}`;
                    const isExpanded = expandedPid === detailKey;

                    // Main row
                    rows.push(
                      <tr key={`${p.port}-${p.bind_address}-${p.pid}`} className={`lh-port-row ${String(p.source || '').toLowerCase()}`}>
                        <td className="lh-port-number">{p.port}{p.protocol && p.protocol !== 'TCP' && <span className="lh-proto-tag">{p.protocol}</span>}</td>
                        <td>
                          <code className="lh-bind">{p.bind_address || '—'}</code>
                          {p.exposed && <span className="lh-warn-flag" title="Bound to all interfaces (0.0.0.0 / ::). PORTMASTER policy prefers 127.0.0.1.">⚠ exposed</span>}
                        </td>
                        <td>{p.service_name || p.project || (p.undeclared ? <span className="lh-muted">undeclared</span> : '—')}</td>
                        <td>
                          <span className="lh-process-cell">
                            {friendlyProcessName(p.process_name) || '—'}
                            {p.pid && (
                              <button
                                className="lh-info-btn"
                                onClick={() => togglePortDetail(p.port, p.bind_address)}
                                title="Show process details"
                              >ⓘ</button>
                            )}
                          </span>
                        </td>
                        <td><span className={`lh-badge ${String(p.source || '').toLowerCase()}`}>{sourceLabel(p.source)}</span></td>
                        <td>{p.managed_by || '—'}</td>
                        <td>
                          <div className="lh-actions">
                            <button className="lh-action-btn" onClick={() => checkPort(p.port)} title="Check this port">Check</button>
                            {p.pid && (
                              <button className="lh-action-btn lh-kill-btn" onClick={() => killProcess(p.pid, p.process_name)} title="Kill process">Kill</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );

                    // Detail row
                    if (isExpanded) {
                      rows.push(
                        <tr key={`${detailKey}-detail`} className="lh-detail-row">
                          <td colSpan={7} className="lh-detail-cell">
                            {loadingDetails ? (
                              <span className="lh-muted">Loading process details…</span>
                            ) : processDetails?.error ? (
                              <span className="lh-muted">{processDetails.error}</span>
                            ) : processDetails ? (
                              <div className="lh-detail-grid">
                                <div className="lh-detail-item">
                                  <span className="lh-detail-label">PID</span>
                                  <span className="lh-detail-value lh-mono">{processDetails.pid}</span>
                                </div>
                                <div className="lh-detail-item lh-detail-wide lh-parent-summary">
                                  <span className="lh-detail-label">Parent PID</span>
                                  <span className="lh-detail-value">{parentProcessDescription(processDetails)}</span>
                                  {processDetails.parent_command && (
                                    <span className="lh-detail-value lh-mono lh-cmd-wrap">{processDetails.parent_command}</span>
                                  )}
                                </div>
                                <div className="lh-detail-item">
                                  <span className="lh-detail-label">Started</span>
                                  <span className="lh-detail-value">{processDetails.start_time || '—'}</span>
                                </div>
                                <div className="lh-detail-item lh-detail-wide">
                                  <span className="lh-detail-label">Working Dir</span>
                                  <span className="lh-detail-value lh-mono">{processDetails.working_dir || '—'}</span>
                                </div>
                                <div className="lh-detail-item lh-detail-wide">
                                  <span className="lh-detail-label">Command</span>
                                  <span className="lh-detail-value lh-mono lh-cmd-wrap">{processDetails.command || '—'}</span>
                                </div>
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    }

                    return rows;
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
