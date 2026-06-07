import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';

// Right-click menu for dock chips. Opens above the cursor (the dock lives at the
// bottom) and pops out of its anchor with the signature spring, mirroring
// Odysseus's overflow-menu-pop. Closes on outside pointerdown, Escape, or select.
export default function WindowContextMenu({ x, y, items, onClose }) {
    const menuRef = useRef(null);
    const [pos, setPos] = useState({ x, y, origin: 'bottom left' });

    useLayoutEffect(() => {
        const el = menuRef.current;
        if (!el) return;
        // Use offset* (layout size) rather than getBoundingClientRect: the menu
        // starts at scale 0.6 for the pop animation, which would shrink a
        // rect-based measurement and place the menu too low.
        const menuW = el.offsetWidth;
        const menuH = el.offsetHeight;
        const margin = 8;
        const nextX = Math.max(margin, Math.min(x, window.innerWidth - menuW - margin));
        // Prefer opening upward from the cursor; flip below only if there's no room.
        const above = y - menuH - 6;
        const openUp = above >= margin;
        const nextY = openUp ? above : Math.min(y + 6, window.innerHeight - menuH - margin);
        setPos({ x: nextX, y: Math.max(margin, nextY), origin: openUp ? 'bottom left' : 'top left' });
    }, [x, y, items.length]);

    useEffect(() => {
        const onPointerDown = (e) => { if (!menuRef.current?.contains(e.target)) onClose(); };
        const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [onClose]);

    return createPortal(
        <motion.div
            ref={menuRef}
            className="perci-context-menu"
            style={{ left: pos.x, top: pos.y, transformOrigin: pos.origin }}
            role="menu"
            initial={{ opacity: 0, scale: 0.6, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.7, y: 6 }}
            transition={{ type: 'spring', stiffness: 560, damping: 30 }}
            onPointerDown={(e) => e.stopPropagation()}
        >
            {items.map((item, i) => (
                item.separator ? (
                    <div key={i} className="perci-context-sep" role="separator" />
                ) : (
                    <button
                        key={i}
                        type="button"
                        role="menuitem"
                        className={`perci-context-item${item.variant === 'destructive' ? ' destructive' : ''}`}
                        onClick={(e) => { e.stopPropagation(); item.onSelect(); onClose(); }}
                    >
                        {item.icon && <item.icon size={14} className="perci-context-icon" />}
                        <span>{item.label}</span>
                    </button>
                )
            ))}
        </motion.div>,
        document.body
    );
}
