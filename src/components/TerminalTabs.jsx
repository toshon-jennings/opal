import { useRef, useState } from 'react';
import { Plus, RefreshCw, RotateCcw, X, GripVertical } from 'lucide-react';
import TerminalPanel from './Terminal';

// A multitab wrapper over TerminalPanel. Every tab is its own PTY session
// (unique sessionId on the local terminal bridge); inactive tabs stay mounted
// so their shells keep running, and the strip shows each session's live
// connection state. Reset/reconnect act on the active tab via the panel ref.

const MAX_TABS = 6;

const STATUS_DOT = {
    connected: 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.7)]',
    connecting: 'bg-amber-400 animate-pulse-subtle',
    disconnected: 'bg-red-400',
    error: 'bg-red-400',
};

function newTab(n, idPrefix) {
    return {
        id: `${idPrefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        label: `Shell ${n}`,
    };
}

export default function TerminalTabs({ idPrefix = 'term' }) {
    const counterRef = useRef(1);
    const panelRefs = useRef({});
    const [tabs, setTabs] = useState(() => [newTab(1, idPrefix)]);
    const [activeId, setActiveId] = useState(() => null);
    const [statuses, setStatuses] = useState({});
    const [dragId, setDragId] = useState(null);
    const [dropIndex, setDropIndex] = useState(null);
    const dragCounter = useRef(0);

    const currentId = activeId && tabs.some(t => t.id === activeId) ? activeId : tabs[0]?.id;
    const currentStatus = statuses[currentId] || 'connecting';

    const addTab = () => {
        if (tabs.length >= MAX_TABS) return;
        counterRef.current += 1;
        const tab = newTab(counterRef.current, idPrefix);
        setTabs(list => [...list, tab]);
        setActiveId(tab.id);
    };

    const closeTab = (id) => {
        const idx = tabs.findIndex(t => t.id === id);
        const next = tabs.filter(t => t.id !== id);
        if (next.length === 0) {
            counterRef.current += 1;
            next.push(newTab(counterRef.current, idPrefix));
        }
        setTabs(next);
        if (id === currentId) {
            setActiveId(next[Math.max(0, idx - 1)]?.id ?? next[0].id);
        }
        setStatuses(({ [id]: _gone, ...rest }) => rest);
        delete panelRefs.current[id];
    };

    const selectTab = (id) => {
        setActiveId(id);
        // Refocus after the hidden panel becomes visible again.
        requestAnimationFrame(() => panelRefs.current[id]?.focus());
    };

    // --- Drag and drop reordering ---
    const onDragStart = (e, id) => {
        setDragId(id);
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
    };

    const onDragEnter = (e, index) => {
        dragCounter.current += 1;
        setDropIndex(index);
    };

    const onDragLeave = () => {
        dragCounter.current -= 1;
        if (dragCounter.current === 0) setDropIndex(null);
    };

    const onDragOver = (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const onDrop = (e, targetIndex) => {
        e.preventDefault();
        const sourceId = e.dataTransfer.getData('text/plain');
        dragCounter.current = 0;
        setDragId(null);
        if (!sourceId) return;
        setTabs(prev => {
            const sourceIndex = prev.findIndex(t => t.id === sourceId);
            if (sourceIndex === -1 || sourceIndex === targetIndex) return prev;
            const next = [...prev];
            const [moved] = next.splice(sourceIndex, 1);
            next.splice(targetIndex, 0, moved);
            return next;
        });
        setDropIndex(null);
    };

    const onDragEnd = () => {
        dragCounter.current = 0;
        setDragId(null);
        setDropIndex(null);
    };

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {/* Session strip */}
            <div className="flex shrink-0 items-center gap-1 border-b border-[var(--border)] bg-[var(--bg-secondary)] px-2 py-1.5">
                <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
                    {tabs.map((tab, index) => {
                        const active = tab.id === currentId;
                        const isDragging = dragId === tab.id;
                        const isDropTarget = dropIndex === index;
                        return (
                            <div
                                key={tab.id}
                                role="tab"
                                tabIndex={0}
                                aria-selected={active}
                                draggable
                                onDragStart={e => onDragStart(e, tab.id)}
                                onDragEnter={e => onDragEnter(e, index)}
                                onDragLeave={onDragLeave}
                                onDragOver={onDragOver}
                                onDrop={e => onDrop(e, index)}
                                onDragEnd={onDragEnd}
                                onClick={() => selectTab(tab.id)}
                                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectTab(tab.id); } }}
                                className={`group relative flex shrink-0 cursor-pointer select-none items-center gap-2 rounded-md border px-2.5 py-1 font-mono text-[11px] transition-colors ${
                                    isDragging ? 'opacity-40' : ''
                                } ${
                                    active
                                        ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-300'
                                        : 'border-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-hover)] hover:text-[var(--text-primary)]'
                                } ${isDropTarget && !isDragging ? 'border-l-2 border-l-amber-500' : ''}`}
                            >
                                <GripVertical size={10} className="-ml-0.5 shrink-0 text-[var(--text-tertiary)] opacity-0 group-hover:opacity-60" />
                                <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[statuses[tab.id]] || STATUS_DOT.connecting}`} />
                                {tab.label}
                                <button
                                    onClick={e => { e.stopPropagation(); closeTab(tab.id); }}
                                    className={`-mr-0.5 rounded p-px text-[var(--text-tertiary)] transition-opacity hover:text-[var(--text-primary)] ${
                                        active ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 group-hover:hover:opacity-100'
                                    }`}
                                    title="Close session"
                                >
                                    <X size={11} />
                                </button>
                            </div>
                        );
                    })}
                    {tabs.length < MAX_TABS && (
                        <button
                            onClick={addTab}
                            className="flex shrink-0 items-center justify-center rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-hover)] hover:text-amber-500"
                            title="New shell session"
                        >
                            <Plus size={13} />
                        </button>
                    )}
                </div>
                <div className="flex shrink-0 items-center gap-2 pl-2">
                    {currentStatus !== 'connected' && (
                        <button
                            onClick={() => panelRefs.current[currentId]?.reconnect()}
                            className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-amber-500 transition-colors hover:text-amber-400"
                        >
                            <RefreshCw size={10} className={currentStatus === 'connecting' ? 'animate-spin' : ''} />
                            Reconnect
                        </button>
                    )}
                    <button
                        onClick={() => panelRefs.current[currentId]?.reset()}
                        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)] transition-colors hover:text-[var(--text-primary)]"
                        title="Reset the active terminal"
                    >
                        <RotateCcw size={10} />
                        Reset
                    </button>
                </div>
            </div>
            {/* Sessions stay mounted while hidden so shells survive tab switches. */}
            {tabs.map(tab => (
                <div key={tab.id} className={tab.id === currentId ? 'flex min-h-0 flex-1 flex-col' : 'hidden'}>
                    <TerminalPanel
                        ref={el => { panelRefs.current[tab.id] = el; }}
                        sessionId={tab.id}
                        embedded
                        onStatusChange={s => setStatuses(prev => (prev[tab.id] === s ? prev : { ...prev, [tab.id]: s }))}
                    />
                </div>
            ))}
        </div>
    );
}
