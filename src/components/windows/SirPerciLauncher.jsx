import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Search, BookOpen } from 'lucide-react';
import PerciMascot from '../PerciMascot';
import { useMode } from '../../context/ModeContext';
import { useChat } from '../../context/ChatContext';
import { NATIVE_TILES, SYSTEM_TILES } from '../../lib/appCatalog';
import { useFlipPosition } from '../../lib/useFlipPosition';
import { BeginnerGuideModal } from '../BeginnerGuideModal';
import { MissionControlGuideModal } from '../MissionControlGuideModal';
import { ModeGuideModal } from '../ModeGuideModal';

const GUIDES = [
    { key: 'beginner', title: 'Beginner Guide', desc: 'Get started with Perci and connect a model' },
    { key: 'mission', title: 'Mission Control Guide', desc: 'How runs, checks, and supervision work' },
    { key: 'mode', title: 'Mode Guide', desc: 'Differences between Chat, Cowork, Code, Agents, Mission, Build' },
];

function matches(item, query) {
    if (!query) return true;
    return `${item.title} ${item.desc}`.toLowerCase().includes(query);
}

function CatalogItem({ icon: Icon, logo, title, desc, onClick }) {
    return (
        <button type="button" className="perci-sirperci-item" onClick={onClick}>
            <span className="perci-sirperci-item-icon">
                {logo ? <img src={logo} alt="" /> : Icon ? <Icon size={16} /> : null}
            </span>
            <span className="perci-sirperci-item-text">
                <span className="perci-sirperci-item-title">{title}</span>
                <span className="perci-sirperci-item-desc">{desc}</span>
            </span>
        </button>
    );
}

// The "Sir Perci" launcher: pinned to the right end of the dock, opens a
// searchable, categorized flyout listing every app/mode and guide. Mirrors
// WindowContextMenu's portal + flip-to-fit + spring-pop pattern.
export default function SirPerciLauncher({ onOpenSettings, autoHide, onToggleAutoHide, onOpenChange }) {
    const { openWindow } = useMode();
    const { updateProvider } = useChat();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [anchor, setAnchor] = useState(null);
    const [activeGuide, setActiveGuide] = useState(null);
    const triggerRef = useRef(null);
    const panelRef = useRef(null);
    const inputRef = useRef(null);

    const pos = useFlipPosition(panelRef, anchor, { align: 'end', remeasureKey: query });

    const close = useCallback(() => { setOpen(false); setQuery(''); onOpenChange?.(false); }, [onOpenChange]);

    const toggleOpen = (e) => {
        if (open) { close(); return; }
        const rect = e.currentTarget.getBoundingClientRect();
        setAnchor({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
        setOpen(true);
        onOpenChange?.(true);
    };

    const openApp = (id) => { openWindow(id); close(); };
    const openGuide = (key) => { setActiveGuide(key); close(); };

    useEffect(() => {
        if (open) inputRef.current?.focus();
    }, [open]);

    useEffect(() => {
        if (!open) return undefined;
        const onPointerDown = (e) => {
            if (panelRef.current?.contains(e.target)) return;
            if (triggerRef.current?.contains(e.target)) return;
            close();
        };
        const onKeyDown = (e) => { if (e.key === 'Escape') close(); };
        window.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [open, close]);

    const q = query.trim().toLowerCase();
    const nativeResults = useMemo(() => NATIVE_TILES.filter((it) => matches(it, q)), [q]);
    const systemResults = useMemo(() => SYSTEM_TILES.filter((it) => matches(it, q)), [q]);
    const guideResults = useMemo(() => GUIDES.filter((it) => matches(it, q)), [q]);
    const noResults = !nativeResults.length && !systemResults.length && !guideResults.length;

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                className={`perci-dock-sirperci${open ? ' active' : ''}`}
                onClick={toggleOpen}
                title="Sir Perci — apps & guides"
                aria-haspopup="dialog"
                aria-expanded={open}
            >
                <PerciMascot state={open ? 'thinking' : 'idle'} size={26} />
            </button>

            {createPortal(
                <AnimatePresence>
                    {open && (
                        <motion.div
                            ref={panelRef}
                            className="perci-sirperci-panel"
                            role="dialog"
                            aria-label="Sir Perci launcher"
                            style={{ left: pos.x, top: pos.y, transformOrigin: pos.origin }}
                            initial={{ opacity: 0, scale: 0.6, y: 8 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.7, y: 6 }}
                            transition={{ type: 'spring', stiffness: 560, damping: 30 }}
                            onPointerDown={(e) => e.stopPropagation()}
                        >
                            <div className="perci-sirperci-header">
                                <PerciMascot state="idle" size={20} />
                            </div>
                            <div className="perci-sirperci-search">
                                <Search size={14} className="perci-sirperci-search-icon" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search apps & guides…"
                                    aria-label="Search apps and guides"
                                />
                            </div>
                            <div className="perci-sirperci-list">
                                {nativeResults.length > 0 && (
                                    <div className="perci-sirperci-section">
                                        <div className="perci-sirperci-section-label">Perci Native</div>
                                        {nativeResults.map((item) => (
                                            <CatalogItem key={item.id} icon={item.icon} logo={item.logo} title={item.title} desc={item.desc} onClick={() => openApp(item.id)} />
                                        ))}
                                    </div>
                                )}
                                {systemResults.length > 0 && (
                                    <div className="perci-sirperci-section">
                                        <div className="perci-sirperci-section-label">System & External</div>
                                        {systemResults.map((item) => (
                                            <CatalogItem key={item.id} icon={item.icon} logo={item.logo} title={item.title} desc={item.desc} onClick={() => openApp(item.id)} />
                                        ))}
                                    </div>
                                )}
                                {guideResults.length > 0 && (
                                    <div className="perci-sirperci-section">
                                        <div className="perci-sirperci-section-label">Guides</div>
                                        {guideResults.map((g) => (
                                            <CatalogItem key={g.key} icon={BookOpen} title={g.title} desc={g.desc} onClick={() => openGuide(g.key)} />
                                        ))}
                                    </div>
                                )}
                                {noResults && <div className="perci-sirperci-empty">No matches for &quot;{query}&quot;</div>}
                            </div>
                            <div className="perci-sirperci-footer">
                                <span>Auto-hide dock</span>
                                <button
                                    type="button"
                                    role="switch"
                                    aria-checked={autoHide}
                                    className={`perci-sirperci-switch${autoHide ? ' on' : ''}`}
                                    onClick={() => onToggleAutoHide(!autoHide)}
                                >
                                    <span className="perci-sirperci-switch-knob" />
                                </button>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}

            <BeginnerGuideModal
                isOpen={activeGuide === 'beginner'}
                onClose={() => setActiveGuide(null)}
                onGetOpenRouterKey={() => {
                    setActiveGuide(null);
                    updateProvider?.('openrouter');
                    onOpenSettings?.();
                }}
            />
            <MissionControlGuideModal isOpen={activeGuide === 'mission'} onClose={() => setActiveGuide(null)} />
            <ModeGuideModal isOpen={activeGuide === 'mode'} onClose={() => setActiveGuide(null)} />
        </>
    );
}
