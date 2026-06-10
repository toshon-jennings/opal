import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ArrowUpToLine, Minus, Maximize2, Minimize2, X } from 'lucide-react';
import { useMode, MODES, OPENCLAW_WINDOW_ID, YOUTUBE_WINDOW_ID } from '../../context/ModeContext';
import WindowContextMenu from './WindowContextMenu';

// Two-letter glyphs for dock chips (mirrors the Orbit/Odysseus dock aesthetic).
const GLYPHS = {
    [MODES.CHAT]: 'CH',
    [MODES.COWORK]: 'CW',
    [MODES.CODE]: 'CD',
    [MODES.AGENTS]: 'AG',
    [MODES.AUTORESEARCH]: 'AR',
    [MODES.OFFICE]: 'HQ',
    [MODES.MISSION]: 'MC',
    [MODES.BUILD]: 'BD',
    [OPENCLAW_WINDOW_ID]: 'OC',
    [YOUTUBE_WINDOW_ID]: 'YT',
};

// The bottom dock / taskbar. Chips animate in with a staggered "domino" spring
// (each chip delayed by its index) and animate out on close. Clicking a focused
// window's chip minimizes it (whirlpooling into the dock); clicking any other
// chip focuses/restores it.
export default function Dock() {
    const { windows, focusWindow, minimizeWindow, toggleMaximizeWindow, closeWindow } = useMode();
    const reduce = useReducedMotion();
    const [menu, setMenu] = useState(null); // { id, x, y }

    if (!windows.length) return null;

    const topZ = Math.max(...windows.map(w => w.z));

    const openMenu = (e, id) => {
        e.preventDefault();
        e.stopPropagation();
        setMenu({ id, x: e.clientX, y: e.clientY });
    };

    const menuWin = menu ? windows.find(w => w.id === menu.id) : null;
    const menuFocused = menuWin && menuWin.z === topZ && menuWin.state !== 'minimized';
    const menuItems = menuWin ? [
        ...(menuFocused ? [] : [{
            label: menuWin.state === 'minimized' ? 'Restore' : 'Focus',
            icon: ArrowUpToLine,
            onSelect: () => focusWindow(menuWin.id),
        }]),
        ...(menuWin.state === 'minimized' ? [] : [{
            label: 'Minimize',
            icon: Minus,
            onSelect: () => minimizeWindow(menuWin.id),
        }]),
        {
            label: menuWin.state === 'maximized' ? 'Restore Size' : 'Maximize',
            icon: menuWin.state === 'maximized' ? Minimize2 : Maximize2,
            onSelect: () => toggleMaximizeWindow(menuWin.id),
        },
        { separator: true },
        { label: 'Close', icon: X, variant: 'destructive', onSelect: () => closeWindow(menuWin.id) },
    ] : [];

    return (
        <div className="perci-dock" role="toolbar" aria-label="Open windows">
            <AnimatePresence initial>
                {windows.map((win, i) => {
                    const focused = win.z === topZ && win.state !== 'minimized';
                    return (
                        <motion.button
                            key={win.id}
                            type="button"
                            layout
                            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 22, scale: 0.82 }}
                            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.6 }}
                            transition={reduce
                                ? { duration: 0.12 }
                                : { type: 'spring', stiffness: 520, damping: 26, delay: i * 0.045 }}
                            className={`perci-dock-item${focused ? ' active' : ''}${win.state === 'minimized' ? ' minimized' : ''}`}
                            title={`${focused ? 'Minimize' : 'Open'} ${win.title}`}
                            onClick={() => (focused ? minimizeWindow(win.id) : focusWindow(win.id))}
                            onContextMenu={(e) => openMenu(e, win.id)}
                        >
                            <span className="perci-dock-glyph">{GLYPHS[win.modeId] || win.title.slice(0, 2).toUpperCase()}</span>
                            <span className="perci-dock-label">{win.title}</span>
                            {focused && <span className="perci-dock-dot" />}
                        </motion.button>
                    );
                })}
            </AnimatePresence>

            <AnimatePresence>
                {menuWin && (
                    <WindowContextMenu
                        key={menuWin.id}
                        x={menu.x}
                        y={menu.y}
                        items={menuItems}
                        onClose={() => setMenu(null)}
                    />
                )}
            </AnimatePresence>
        </div>
    );
}
