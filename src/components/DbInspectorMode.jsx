import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ChevronRight,
    Database,
    FolderOpen,
    Loader2,
    Play,
    RefreshCw,
    Search,
    Table2,
    X,
    XCircle,
} from 'lucide-react';

const RECENTS_KEY = 'perci_db_inspector_recent';
const MAX_RECENTS = 8;
const PAGE_SIZE = 100;

function basename(p) {
    return p ? p.split('/').pop() : '';
}

// Shows the containing folder without the noisy full home-directory prefix,
// e.g. "/Users/toshon/.hermes/kanban.db" -> ".hermes" — this is the part
// that tells the user which app the file belongs to.
function folderLabel(p) {
    if (!p) return '';
    const parts = p.split('/').slice(0, -1);
    return parts.slice(-2).join('/');
}

export default function DbInspectorMode() {
    const [recents, setRecents] = useState([]);
    const [selectedPath, setSelectedPath] = useState(null);
    const [tables, setTables] = useState([]);
    const [schemaError, setSchemaError] = useState('');
    const [schemaLoading, setSchemaLoading] = useState(false);
    const [selectedTable, setSelectedTable] = useState(null);
    const [queryText, setQueryText] = useState('');
    const [rows, setRows] = useState([]);
    const [columns, setColumns] = useState([]);
    const [queryError, setQueryError] = useState('');
    const [queryLoading, setQueryLoading] = useState(false);
    const [picking, setPicking] = useState(false);
    const [discovered, setDiscovered] = useState([]);
    const [discovering, setDiscovering] = useState(false);
    const [discoverError, setDiscoverError] = useState('');

    const canUseBridge = Boolean(window.electron?.dbPickFile);

    const discover = useCallback(async () => {
        if (!window.electron?.dbDiscover) return;
        setDiscovering(true);
        setDiscoverError('');
        try {
            const result = await window.electron.dbDiscover();
            if (result?.ok) setDiscovered(result.paths || []);
            else setDiscoverError(result?.error || 'Scan failed.');
        } catch (err) {
            setDiscoverError(err.message || 'Scan failed.');
        } finally {
            setDiscovering(false);
        }
    }, []);

    useEffect(() => {
        (async () => {
            if (!window.electron?.getAppData) return;
            const data = await window.electron.getAppData();
            if (Array.isArray(data?.[RECENTS_KEY])) setRecents(data[RECENTS_KEY]);
        })();
        discover();
    }, [discover]);

    const persistRecents = useCallback(async (next) => {
        setRecents(next);
        if (!window.electron?.getAppData || !window.electron?.setAppData) return;
        const data = await window.electron.getAppData();
        await window.electron.setAppData({ ...data, [RECENTS_KEY]: next });
    }, []);

    const runQuery = useCallback(async (dbPath, sql) => {
        setQueryLoading(true);
        setQueryError('');
        try {
            const result = await window.electron.dbQuery(dbPath, sql);
            if (result?.ok) {
                setRows(result.rows || []);
                setColumns(result.columns || []);
            } else {
                setRows([]);
                setColumns([]);
                setQueryError(result?.error || 'Query failed.');
            }
        } catch (err) {
            setRows([]);
            setColumns([]);
            setQueryError(err.message || 'Query failed.');
        } finally {
            setQueryLoading(false);
        }
    }, []);

    const openDatabase = useCallback(async (dbPath) => {
        setSelectedPath(dbPath);
        setSelectedTable(null);
        setRows([]);
        setColumns([]);
        setQueryError('');
        setSchemaLoading(true);
        setSchemaError('');
        try {
            const result = await window.electron.dbSchema(dbPath);
            if (result?.ok) {
                setTables(result.tables || []);
            } else {
                setTables([]);
                setSchemaError(result?.error || 'Could not read schema.');
            }
        } catch (err) {
            setTables([]);
            setSchemaError(err.message || 'Could not read schema.');
        } finally {
            setSchemaLoading(false);
        }

        const next = [dbPath, ...recents.filter(p => p !== dbPath)].slice(0, MAX_RECENTS);
        persistRecents(next);
    }, [recents, persistRecents]);

    const pickFile = useCallback(async () => {
        if (!canUseBridge) return;
        setPicking(true);
        try {
            const chosen = await window.electron.dbPickFile();
            if (chosen) await openDatabase(chosen);
        } finally {
            setPicking(false);
        }
    }, [canUseBridge, openDatabase]);

    const selectTable = useCallback((name) => {
        setSelectedTable(name);
        // Table names come from the opened file's own schema, not a fixed list —
        // a crafted .db could name a table to break out of the quoted identifier
        // (SQL params can't bind identifiers, so we escape per SQLite's own rule).
        const escapedName = name.replace(/"/g, '""');
        const sql = `SELECT * FROM "${escapedName}" LIMIT ${PAGE_SIZE}`;
        setQueryText(sql);
        runQuery(selectedPath, sql);
    }, [selectedPath, runQuery]);

    const removeRecent = useCallback((e, path) => {
        e.stopPropagation();
        persistRecents(recents.filter(p => p !== path));
    }, [recents, persistRecents]);

    const runCustomQuery = useCallback(() => {
        if (!selectedPath || !queryText.trim()) return;
        setSelectedTable(null);
        runQuery(selectedPath, queryText);
    }, [selectedPath, queryText, runQuery]);

    const dbLabel = useMemo(() => basename(selectedPath), [selectedPath]);

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
                        <Database size={19} />
                    </span>
                    <div className="min-w-0">
                        <h1 className="m-0 truncate text-base font-semibold leading-5">DB Inspector</h1>
                        <p className="m-0 truncate font-mono text-[11px] text-[var(--text-tertiary)]">
                            {dbLabel || 'No database open — read-only SQLite browser'}
                        </p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={pickFile}
                    disabled={!canUseBridge || picking}
                    className="inline-flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-tertiary)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                    {picking ? <Loader2 size={13} className="animate-spin" /> : <FolderOpen size={13} />}
                    Open Database...
                </button>
            </header>

            {!canUseBridge && (
                <div className="m-4 rounded-lg border border-amber-500/25 bg-amber-500/10 p-4 text-sm leading-6 text-amber-200">
                    Perci needs the desktop DB Inspector bridge. Restart Perci after this update.
                </div>
            )}

            {canUseBridge && (
                <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:overflow-hidden">
                    <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1">
                        <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <p className="m-0 text-xs font-semibold text-[var(--text-tertiary)]">Found on this Mac</p>
                                <button type="button" onClick={discover} disabled={discovering} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)] disabled:opacity-50">
                                    {discovering ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                </button>
                            </div>
                            {discoverError && (
                                <div className="mb-2 rounded-md border border-red-500/25 bg-red-500/10 p-2 text-[11px] text-red-400">{discoverError}</div>
                            )}
                            {discovering && discovered.length === 0 && (
                                <div className="flex items-center gap-2 py-2 text-xs text-[var(--text-tertiary)]">
                                    <Search size={12} className="animate-pulse" />
                                    Scanning your home folder...
                                </div>
                            )}
                            {!discovering && discovered.length === 0 && !discoverError && (
                                <p className="text-xs text-[var(--text-tertiary)]">No SQLite files found under your home folder.</p>
                            )}
                            <div className="min-h-0 flex-1 overflow-y-auto">
                                {discovered.map(path => (
                                    <button
                                        key={path}
                                        type="button"
                                        title={path}
                                        onClick={() => openDatabase(path)}
                                        className={`flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                                            path === selectedPath ? 'bg-emerald-500/15 text-emerald-400' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                                        }`}
                                    >
                                        <span className="min-w-0">
                                            <span className="block truncate font-mono">{basename(path)}</span>
                                            <span className="block truncate text-[10px] text-[var(--text-tertiary)]">{folderLabel(path)}</span>
                                        </span>
                                        <ChevronRight size={11} className="ml-auto shrink-0 opacity-50" />
                                    </button>
                                ))}
                            </div>
                        </section>

                        {recents.length > 0 && (
                            <section className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                                <p className="m-0 mb-2 text-xs font-semibold text-[var(--text-tertiary)]">Recent</p>
                                <div className="grid gap-1">
                                    {recents.map(path => (
                                        <button
                                            key={path}
                                            type="button"
                                            onClick={() => openDatabase(path)}
                                            className={`group flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors ${
                                                path === selectedPath ? 'bg-emerald-500/15 text-emerald-400' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                                            }`}
                                        >
                                            <span className="truncate font-mono">{basename(path)}</span>
                                            <X
                                                size={12}
                                                onClick={(e) => removeRecent(e, path)}
                                                className="shrink-0 opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
                                            />
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}

                        {selectedPath && (
                            <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                                <div className="mb-2 flex items-center justify-between">
                                    <p className="m-0 text-xs font-semibold text-[var(--text-tertiary)]">Tables</p>
                                    <button type="button" onClick={() => openDatabase(selectedPath)} className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]">
                                        {schemaLoading ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                    </button>
                                </div>
                                {schemaError && (
                                    <div className="mb-2 rounded-md border border-red-500/25 bg-red-500/10 p-2 text-[11px] text-red-400">{schemaError}</div>
                                )}
                                <div className="min-h-0 flex-1 overflow-y-auto">
                                    {tables.length === 0 && !schemaLoading && !schemaError && (
                                        <p className="text-xs text-[var(--text-tertiary)]">No tables found.</p>
                                    )}
                                    {tables.map(t => (
                                        <button
                                            key={t.name}
                                            type="button"
                                            onClick={() => selectTable(t.name)}
                                            className={`flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-xs font-mono transition-colors ${
                                                selectedTable === t.name ? 'bg-emerald-500/15 text-emerald-400' : 'text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)]'
                                            }`}
                                        >
                                            <Table2 size={12} className="shrink-0" />
                                            <span className="truncate">{t.name}</span>
                                            <ChevronRight size={11} className="ml-auto shrink-0 opacity-50" />
                                        </button>
                                    ))}
                                </div>
                            </section>
                        )}
                    </aside>

                    <section className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
                        <div className="flex shrink-0 items-center gap-2">
                            <textarea
                                value={queryText}
                                onChange={(e) => setQueryText(e.target.value)}
                                disabled={!selectedPath}
                                placeholder={selectedPath ? 'SELECT * FROM ... LIMIT 100' : 'Open a database to run a query'}
                                rows={2}
                                className="min-h-0 flex-1 resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-emerald-500/50 disabled:opacity-50"
                            />
                            <button
                                type="button"
                                onClick={runCustomQuery}
                                disabled={!selectedPath || queryLoading || !queryText.trim()}
                                className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {queryLoading ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                                Run
                            </button>
                        </div>

                        {queryError && (
                            <div className="flex shrink-0 items-center gap-2 rounded-md border border-red-500/25 bg-red-500/10 p-3 text-xs text-red-400">
                                <XCircle size={14} />
                                {queryError}
                            </div>
                        )}

                        <div className="min-h-0 flex-1 overflow-auto rounded-lg border border-[var(--border)] bg-[#0d1117]">
                            {rows.length === 0 ? (
                                <div className="flex h-full min-h-[200px] items-center justify-center text-sm text-slate-500">
                                    {selectedPath ? 'No rows to show.' : 'Open a database and pick a table, or run a query.'}
                                </div>
                            ) : (
                                <table className="w-full border-collapse text-left text-xs">
                                    <thead className="sticky top-0 bg-[#161b22]">
                                        <tr>
                                            {columns.map(col => (
                                                <th key={col} className="whitespace-nowrap border-b border-white/10 px-3 py-2 font-mono font-semibold text-slate-300">{col}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {rows.map((row, i) => (
                                            <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                                                {columns.map(col => (
                                                    <td key={col} className="max-w-xs truncate whitespace-nowrap px-3 py-1.5 font-mono text-slate-300">
                                                        {row[col] === null ? <span className="text-slate-600">NULL</span> : String(row[col])}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                        {rows.length === PAGE_SIZE && (
                            <p className="shrink-0 text-[11px] text-[var(--text-tertiary)]">Showing first {PAGE_SIZE} rows — refine the query with LIMIT/OFFSET to page further.</p>
                        )}
                    </section>
                </div>
            )}
        </div>
    );
}
