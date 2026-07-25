import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ClipboardList, Phone, Mail, Ticket as TicketIcon, Footprints, HelpCircle,
    Laptop, Search, Plus, Link2, FolderOpen,
} from 'lucide-react';
import { useMode } from '../context/ModeContext';
import { readStringStorage, writeStringStorage } from '../lib/persistentStore';
import {
    TICKET_STATUSES, TICKET_CHANNELS, DEVICE_STATUSES,
    TICKET_STATUS_LABELS, DEVICE_STATUS_LABELS,
    listTickets, listDevices, createTicket, createDevice, updateRecord, linkedTicketsForDevice,
} from '../lib/docketRecords';
import './DocketMode.css';

// Mirrors NotesMode.jsx's storage key on purpose: Docket and Notes must always
// resolve to the same folder, since a ticket/device *is* a note. Duplicated
// (rather than imported from NotesMode.jsx) to avoid coupling to — and risking
// a regression in — that component.
const NOTES_FOLDER_KEY = 'perci_notes_folder';
const VIEW_KEY = 'perci_docket_view:v1';

const CHANNEL_ICONS = { call: Phone, email: Mail, ticket: TicketIcon, 'walk-in': Footprints, other: HelpCircle };
const CHANNEL_LABELS = { call: 'Call', email: 'Email', ticket: 'Ticket', 'walk-in': 'Walk-in', other: 'Other' };

const TABS = [
    { id: 'capture', label: 'Capture' },
    { id: 'queue', label: 'Queue' },
    { id: 'ledger', label: 'Ledger' },
];

function relativeTime(iso) {
    if (!iso) return '';
    const diffMs = Date.now() - new Date(iso).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.round(hrs / 24)}d ago`;
}

function NoFolderState() {
    return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-12 text-center">
            <FolderOpen size={32} className="text-[var(--border)]" />
            <h3 className="m-0 text-sm font-semibold text-[var(--text-primary)]">No notes folder yet</h3>
            <p className="m-0 max-w-xs text-xs text-[var(--text-tertiary)]">
                Docket stores tickets and devices as notes. Open <strong>Workspace Notes</strong> once
                to choose or create a notes folder, then come back here.
            </p>
        </div>
    );
}

function CaptureView({ onCapture, recent, loading }) {
    const [channel, setChannel] = useState('call');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const inputRef = useRef(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const submit = useCallback(async (e) => {
        e?.preventDefault();
        const trimmed = note.trim();
        if (!trimmed || saving) return;
        setSaving(true);
        await onCapture({ channel, note: trimmed });
        setNote('');
        setSaving(false);
        inputRef.current?.focus();
    }, [channel, note, onCapture, saving]);

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) submit(e);
    };

    return (
        <div className="mx-auto flex max-w-2xl flex-col gap-5 p-6 sm:p-8">
            <div className="dk-capture-channels">
                {TICKET_CHANNELS.map((c) => {
                    const Icon = CHANNEL_ICONS[c];
                    return (
                        <button
                            key={c}
                            type="button"
                            className={`dk-channel-chip ${channel === c ? 'is-active' : ''}`}
                            onClick={() => setChannel(c)}
                        >
                            <Icon size={13} />
                            {CHANNEL_LABELS[c]}
                        </button>
                    );
                })}
            </div>

            <form onSubmit={submit} className="flex flex-col gap-3">
                <textarea
                    ref={inputRef}
                    className="dk-capture-field w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-4 leading-relaxed text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--accent)]"
                    rows={3}
                    placeholder="What happened? Who called, what's broken, what do they need…"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                <div className="flex items-center justify-between">
                    <p className="m-0 text-[11px] text-[var(--text-tertiary)]">Enter to log · Shift+Enter for a new line</p>
                    <button
                        type="submit"
                        disabled={!note.trim() || saving}
                        className="inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--accent-hover)] disabled:opacity-40"
                    >
                        <Plus size={14} /> Log it
                    </button>
                </div>
            </form>

            {recent.length > 0 && (
                <div className="border-t border-[var(--border)] pt-4">
                    <p className="m-0 mb-2 text-[11px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">Just logged</p>
                    <div className="flex flex-col gap-1.5">
                        {recent.map((t) => {
                            const Icon = CHANNEL_ICONS[t.fields.channel] || HelpCircle;
                            return (
                                <div key={t.fileName} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-[var(--text-secondary)]">
                                    <Icon size={13} className="shrink-0 text-[var(--text-tertiary)]" />
                                    <span className="truncate">{t.fields.title}</span>
                                    <span className="ml-auto shrink-0 text-[10px] text-[var(--text-tertiary)]">{relativeTime(t.fields.createdAt)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
            {loading && <p className="text-center text-[11px] text-[var(--text-tertiary)]">Loading…</p>}
        </div>
    );
}

function QueueView({ tickets, devices, loading, onPatch }) {
    const [statusTab, setStatusTab] = useState('open');
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        let result = tickets.filter((t) => (t.fields.status || 'open') === statusTab);
        if (search.trim()) {
            const s = search.trim().toLowerCase();
            result = result.filter((t) => (t.fields.title || '').toLowerCase().includes(s) || (t.body || '').toLowerCase().includes(s));
        }
        return result;
    }, [tickets, statusTab, search]);

    const counts = useMemo(() => {
        const acc = {};
        TICKET_STATUSES.forEach((s) => { acc[s] = 0; });
        tickets.forEach((t) => { acc[t.fields.status || 'open'] = (acc[t.fields.status || 'open'] || 0) + 1; });
        return acc;
    }, [tickets]);

    return (
        <div className="flex h-full min-h-0 flex-col">
            <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--border)] p-3">
                <div className="flex items-center gap-1">
                    {TICKET_STATUSES.map((s) => (
                        <button
                            key={s}
                            onClick={() => setStatusTab(s)}
                            className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                                statusTab === s ? 'bg-[var(--bg-tertiary)] text-[var(--text-primary)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
                            }`}
                        >
                            {TICKET_STATUS_LABELS[s]} <span className="opacity-60">{counts[s] || 0}</span>
                        </button>
                    ))}
                </div>
                <div className="relative ml-auto max-w-xs flex-1">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={13} />
                    <input
                        type="text"
                        placeholder="Search tickets…"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                    />
                </div>
            </div>

            <div className="flex-1 overflow-y-auto">
                {loading ? (
                    <p className="p-8 text-center text-xs text-[var(--text-tertiary)]">Loading…</p>
                ) : filtered.length === 0 ? (
                    <div className="p-12 text-center">
                        <ClipboardList size={28} className="mx-auto mb-2 text-[var(--border)]" />
                        <p className="m-0 text-xs text-[var(--text-tertiary)]">
                            {search ? 'No tickets match that search.' : `Nothing ${TICKET_STATUS_LABELS[statusTab].toLowerCase()} right now.`}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-[var(--border)]">
                        {filtered.map((t) => (
                            <TicketRow key={t.fileName} ticket={t} devices={devices} onPatch={onPatch} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

function TicketRow({ ticket, devices, onPatch }) {
    const Icon = CHANNEL_ICONS[ticket.fields.channel] || HelpCircle;
    const status = ticket.fields.status || 'open';
    const [msspRef, setMsspRef] = useState(ticket.fields.msspRef || '');

    return (
        <div className="flex flex-col gap-2 p-3.5 transition-colors hover:bg-[var(--bg-tertiary)]">
            <div className="flex items-start gap-2.5">
                <Icon size={14} className="mt-0.5 shrink-0 text-[var(--text-tertiary)]" />
                <div className="min-w-0 flex-1">
                    <p className="m-0 text-sm text-[var(--text-primary)]">{ticket.fields.title}</p>
                    {ticket.body && ticket.body !== ticket.fields.title && (
                        <p className="m-0 mt-0.5 truncate text-xs text-[var(--text-tertiary)]">{ticket.body}</p>
                    )}
                </div>
                <span className={`dk-pill is-${status} shrink-0`}>{TICKET_STATUS_LABELS[status]}</span>
                <span className="shrink-0 text-[10px] text-[var(--text-tertiary)]">{relativeTime(ticket.fields.createdAt)}</span>
            </div>

            <div className="flex flex-wrap items-center gap-2 pl-6">
                {TICKET_STATUSES.filter((s) => s !== status).map((s) => (
                    <button
                        key={s}
                        onClick={() => onPatch(ticket.fileName, { status: s })}
                        className="rounded-md border border-[var(--border)] px-2 py-0.5 text-[10.5px] text-[var(--text-secondary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--accent)]"
                    >
                        → {TICKET_STATUS_LABELS[s]}
                    </button>
                ))}

                <select
                    value={ticket.fields.device || ''}
                    onChange={(e) => onPatch(ticket.fileName, { device: e.target.value })}
                    className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-secondary)]"
                >
                    <option value="">Link a device…</option>
                    {devices.map((d) => (
                        <option key={d.fileName} value={d.fields.assetTag}>{d.fields.assetTag}</option>
                    ))}
                </select>
                {ticket.fields.device && (
                    <span className="inline-flex items-center gap-1 text-[10.5px] text-[var(--text-tertiary)]">
                        <Link2 size={10} /> {ticket.fields.device}
                    </span>
                )}

                {status === 'mssp' && (
                    <input
                        type="text"
                        placeholder="MSSP ticket #…"
                        value={msspRef}
                        onChange={(e) => setMsspRef(e.target.value)}
                        onBlur={() => onPatch(ticket.fileName, { msspRef })}
                        className="w-32 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-1.5 py-0.5 text-[10.5px] text-[var(--text-secondary)] outline-none focus:border-[var(--accent)]"
                    />
                )}
            </div>
        </div>
    );
}

function LedgerView({ devices, tickets, loading, onAdd, onPatch }) {
    const [search, setSearch] = useState('');
    const [adding, setAdding] = useState(false);
    const [selected, setSelected] = useState(null);
    const [form, setForm] = useState({ assetTag: '', assignee: '', status: 'assigned' });

    const filtered = useMemo(() => {
        let result = devices;
        if (search.trim()) {
            const s = search.trim().toLowerCase();
            result = result.filter((d) => (d.fields.assetTag || '').toLowerCase().includes(s) || (d.fields.assignee || '').toLowerCase().includes(s));
        }
        return result;
    }, [devices, search]);

    const submitAdd = async (e) => {
        e.preventDefault();
        if (!form.assetTag.trim()) return;
        await onAdd(form);
        setForm({ assetTag: '', assignee: '', status: 'assigned' });
        setAdding(false);
    };

    const openTickets = selected ? linkedTicketsForDevice(tickets, selected.fields.assetTag).filter((t) => t.fields.status !== 'closed') : [];

    return (
        <div className="flex h-full min-h-0">
            <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--border)] p-3">
                    <div className="relative max-w-xs flex-1">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={13} />
                        <input
                            type="text"
                            placeholder="Search devices…"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full rounded-md border border-[var(--border)] bg-[var(--bg-secondary)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                        />
                    </div>
                    <button
                        onClick={() => setAdding((v) => !v)}
                        className="ml-auto inline-flex items-center gap-1.5 rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[var(--accent-hover)]"
                    >
                        <Plus size={13} /> Add device
                    </button>
                </div>

                {adding && (
                    <form onSubmit={submitAdd} className="flex flex-wrap items-end gap-3 border-b border-[var(--border)] bg-[var(--bg-secondary)] p-3">
                        <label className="flex flex-col gap-1 text-[11px] text-[var(--text-tertiary)]">
                            Asset tag
                            <input
                                autoFocus
                                value={form.assetTag}
                                onChange={(e) => setForm((f) => ({ ...f, assetTag: e.target.value }))}
                                className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-[11px] text-[var(--text-tertiary)]">
                            Assignee
                            <input
                                value={form.assignee}
                                onChange={(e) => setForm((f) => ({ ...f, assignee: e.target.value }))}
                                className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                            />
                        </label>
                        <label className="flex flex-col gap-1 text-[11px] text-[var(--text-tertiary)]">
                            Status
                            <select
                                value={form.status}
                                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                                className="rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-1 text-xs text-[var(--text-primary)]"
                            >
                                {DEVICE_STATUSES.map((s) => <option key={s} value={s}>{DEVICE_STATUS_LABELS[s]}</option>)}
                            </select>
                        </label>
                        <button type="submit" disabled={!form.assetTag.trim()} className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40">Save</button>
                        <button type="button" onClick={() => setAdding(false)} className="text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]">Cancel</button>
                    </form>
                )}

                <div className="flex-1 overflow-auto">
                    {loading ? (
                        <p className="p-8 text-center text-xs text-[var(--text-tertiary)]">Loading…</p>
                    ) : filtered.length === 0 ? (
                        <div className="p-12 text-center">
                            <Laptop size={28} className="mx-auto mb-2 text-[var(--border)]" />
                            <p className="m-0 text-xs text-[var(--text-tertiary)]">{search ? 'No devices match that search.' : 'No devices in the ledger yet.'}</p>
                        </div>
                    ) : (
                        <table className="w-full border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-[var(--border)] text-left text-[10.5px] uppercase tracking-wide text-[var(--text-tertiary)]">
                                    <th className="px-3 py-2 font-medium">Asset tag</th>
                                    <th className="px-3 py-2 font-medium">Assignee</th>
                                    <th className="px-3 py-2 font-medium">Status</th>
                                    <th className="px-3 py-2 font-medium">Open tickets</th>
                                    <th className="px-3 py-2 font-medium">Last touched</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--border)]">
                                {filtered.map((d) => {
                                    const openCount = linkedTicketsForDevice(tickets, d.fields.assetTag).filter((t) => t.fields.status !== 'closed').length;
                                    return (
                                        <tr
                                            key={d.fileName}
                                            onClick={() => setSelected(d)}
                                            className={`cursor-pointer transition-colors hover:bg-[var(--bg-tertiary)] ${selected?.fileName === d.fileName ? 'bg-[var(--bg-tertiary)]' : ''}`}
                                        >
                                            <td className="px-3 py-2 font-medium text-[var(--text-primary)]">{d.fields.assetTag}</td>
                                            <td className="px-3 py-2 text-[var(--text-secondary)]">{d.fields.assignee || '—'}</td>
                                            <td className="px-3 py-2">
                                                <select
                                                    value={d.fields.status}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onChange={(e) => onPatch(d.fileName, { status: e.target.value })}
                                                    className={`dk-pill is-${d.fields.status} border-0 bg-transparent`}
                                                >
                                                    {DEVICE_STATUSES.map((s) => <option key={s} value={s}>{DEVICE_STATUS_LABELS[s]}</option>)}
                                                </select>
                                            </td>
                                            <td className="px-3 py-2 text-[var(--text-secondary)]">{openCount || '—'}</td>
                                            <td className="px-3 py-2 text-[var(--text-tertiary)]">{relativeTime(d.fields.updatedAt)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {selected && (
                <div className="w-64 shrink-0 overflow-y-auto border-l border-[var(--border)] p-3">
                    <p className="m-0 text-sm font-semibold text-[var(--text-primary)]">{selected.fields.assetTag}</p>
                    <p className="m-0 mt-3 text-[11px] font-medium uppercase tracking-wide text-[var(--text-tertiary)]">Open tickets</p>
                    {openTickets.length === 0 ? (
                        <p className="mt-1 text-xs text-[var(--text-tertiary)]">None right now.</p>
                    ) : (
                        <ul className="mt-1 flex flex-col gap-1.5 pl-0 text-xs">
                            {openTickets.map((t) => (
                                <li key={t.fileName} className="list-none text-[var(--text-secondary)]">{t.fields.title}</li>
                            ))}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
}

export default function DocketMode() {
    const { codeState } = useMode();
    const workingDirectory = codeState?.workingDirectory;

    const [folder, setFolder] = useState('');
    const [tab, setTab] = useState(() => readStringStorage(VIEW_KEY, 'capture'));
    const [tickets, setTickets] = useState([]);
    const [devices, setDevices] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;
        async function resolve() {
            let savedFolder = readStringStorage(NOTES_FOLDER_KEY);
            let shouldPersist = Boolean(savedFolder);
            if (!savedFolder && workingDirectory) {
                savedFolder = `${workingDirectory}/notes`;
                shouldPersist = true;
            }
            if (!savedFolder && window.electron?.getDefaultNotesPath) {
                try {
                    savedFolder = await window.electron.getDefaultNotesPath();
                } catch {
                    // no default available in this environment (e.g. plain web build)
                }
            }
            if (isMounted && savedFolder) {
                setFolder(savedFolder);
                if (shouldPersist) writeStringStorage(NOTES_FOLDER_KEY, savedFolder);
                if (window.electron?.registerWorkspace) await window.electron.registerWorkspace(savedFolder);
            } else if (isMounted) {
                setLoading(false);
            }
        }
        resolve();
        return () => { isMounted = false; };
    }, [workingDirectory]);

    const refresh = useCallback(async () => {
        if (!folder) return;
        setLoading(true);
        const [t, d] = await Promise.all([listTickets(folder), listDevices(folder)]);
        setTickets(t);
        setDevices(d);
        setLoading(false);
    }, [folder]);

    useEffect(() => { refresh(); }, [refresh]);
    useEffect(() => { writeStringStorage(VIEW_KEY, tab); }, [tab]);

    const handleCapture = useCallback(async ({ channel, note }) => {
        if (!folder) return;
        await createTicket(folder, { channel, note });
        refresh();
    }, [folder, refresh]);

    const handleTicketPatch = useCallback(async (fileName, patch) => {
        if (!folder) return;
        await updateRecord(folder, fileName, patch);
        refresh();
    }, [folder, refresh]);

    const handleAddDevice = useCallback(async (device) => {
        if (!folder) return;
        await createDevice(folder, device);
        refresh();
    }, [folder, refresh]);

    const handleDevicePatch = useCallback(async (fileName, patch) => {
        if (!folder) return;
        await updateRecord(folder, fileName, patch);
        refresh();
    }, [folder, refresh]);

    const openCount = tickets.filter((t) => t.fields.status !== 'closed').length;

    return (
        <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[var(--bg-primary)] text-[var(--text-primary)]">
            <header className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-orange-500/25 bg-orange-500/10 text-orange-400">
                        <ClipboardList size={19} />
                    </span>
                    <div className="min-w-0">
                        <h1 className="m-0 truncate text-base font-semibold leading-5">Docket</h1>
                        <p className="m-0 truncate font-mono text-[11px] text-[var(--text-tertiary)]">
                            {folder ? folder.split('/').slice(-2).join('/') : 'No notes folder yet'}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-1">
                    {TABS.map((t) => (
                        <button
                            key={t.id}
                            onClick={() => setTab(t.id)}
                            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                tab === t.id ? 'bg-[var(--accent)] text-white' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                            }`}
                        >
                            {t.label}
                            {t.id === 'queue' && openCount > 0 && <span className="ml-1.5 opacity-70">{openCount}</span>}
                        </button>
                    ))}
                </div>
            </header>

            <div className="flex-1 overflow-hidden">
                {!folder && !loading ? (
                    <NoFolderState />
                ) : tab === 'capture' ? (
                    <CaptureView onCapture={handleCapture} recent={tickets.slice(0, 5)} loading={loading} />
                ) : tab === 'queue' ? (
                    <QueueView tickets={tickets} devices={devices} loading={loading} onPatch={handleTicketPatch} />
                ) : (
                    <LedgerView devices={devices} tickets={tickets} loading={loading} onAdd={handleAddDevice} onPatch={handleDevicePatch} />
                )}
            </div>
        </div>
    );
}
