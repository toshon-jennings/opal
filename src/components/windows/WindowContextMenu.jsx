import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { useFlipPosition } from '../../lib/useFlipPosition';

// Right-click menu for dock chips. Opens above the cursor (the dock lives at the
// bottom) and pops out of its anchor with the signature spring, mirroring
// Odysseus's overflow-menu-pop. Closes on outside pointerdown, Escape, or select.
export default function WindowContextMenu({ x, y, items, onClose }) {
    const menuRef = useRef(null);
    const pos = useFlipPosition(menuRef, { left: x, top: y, right: x, bottom: y }, { remeasureKey: items.length });

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
