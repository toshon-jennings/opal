import { useCallback, useEffect, useRef, useState } from 'react';
import { useMode } from '../../context/ModeContext';

const MIN_W = 420;
const MIN_H = 300;
const RESIZE_DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];

// A single floating window. Draggable by its header, resizable from 8 edges,
// with macOS-style traffic-light controls. Minimizing plays a "whirlpool" spin
// into the dock; the frame stays mounted (display:none) while minimized so the
// mode's state survives. Open/restore/close each have their own choreography.
export default function WindowFrame({ win, active, children }) {
    const { focusWindow, closeWindow, minimizeWindow, toggleMaximizeWindow, moveWindow, resizeWindow } = useMode();
    const frameRef = useRef(null);
    const dragRef = useRef(null);
    const openedRef = useRef(false);
    const prevStateRef = useRef(win.state);
    const [anim, setAnim] = useState(null); // 'open' | 'in' | 'out' | 'close'

    useEffect(() => {
        if (!openedRef.current) {
            openedRef.current = true;
            setAnim('open');
        }
    }, []);

    useEffect(() => {
        const prev = prevStateRef.current;
        if (prev !== 'minimized' && win.state === 'minimized') setAnim('out');
        else if (prev === 'minimized' && win.state !== 'minimized') setAnim('in');
        prevStateRef.current = win.state;
    }, [win.state]);

    const onPointerMove = useCallback((e) => {
        const d = dragRef.current;
        if (!d) return;
        const dx = e.clientX - d.sx;
        const dy = e.clientY - d.sy;
        if (d.type === 'move') {
            moveWindow(win.id, d.x + dx, d.y + dy);
            return;
        }
        let { x, y, width, height } = d;
        const dir = d.dir;
        if (dir.includes('e')) width += dx;
        if (dir.includes('s')) height += dy;
        if (dir.includes('w')) { x += dx; width -= dx; }
        if (dir.includes('n')) { y += dy; height -= dy; }
        if (width < MIN_W) { if (dir.includes('w')) x = d.x + (d.width - MIN_W); width = MIN_W; }
        if (height < MIN_H) { if (dir.includes('n')) y = d.y + (d.height - MIN_H); height = MIN_H; }
        moveWindow(win.id, x, y);
        resizeWindow(win.id, width, height);
    }, [win.id, moveWindow, resizeWindow]);

    const endDrag = useCallback(() => {
        dragRef.current = null;
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', endDrag);
        document.body.style.userSelect = '';
    }, [onPointerMove]);

    useEffect(() => () => endDrag(), [endDrag]);

    const startMove = (e) => {
        if (e.button !== 0 || win.state === 'maximized') return;
        focusWindow(win.id);
        dragRef.current = { type: 'move', sx: e.clientX, sy: e.clientY, ...win.bounds };
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', endDrag);
    };

    const startResize = (dir) => (e) => {
        e.stopPropagation();
        if (win.state === 'maximized') return;
        focusWindow(win.id);
        dragRef.current = { type: 'resize', dir, sx: e.clientX, sy: e.clientY, ...win.bounds };
        document.body.style.userSelect = 'none';
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', endDrag);
    };

    const handleAnimEnd = (e) => {
        if (e.target !== frameRef.current) return; // ignore bubbling child animations
        if (anim === 'close') closeWindow(win.id);
        else setAnim(null);
    };

    const maximized = win.state === 'maximized';
    const hidden = win.state === 'minimized' && anim !== 'out';

    // Webview-backed windows fade instead of whirlpooling (transforms flicker webviews).
    let animClass = '';
    if (anim === 'out') animClass = win.noWhirlpool ? 'anim-fade-out' : 'anim-out';
    else if (anim === 'in') animClass = win.noWhirlpool ? 'anim-fade-in' : 'anim-in';
    else if (anim) animClass = `anim-${anim}`;

    const style = maximized
        ? { left: 0, top: 0, right: 0, bottom: 0, zIndex: win.z }
        : { left: win.bounds.x, top: win.bounds.y, width: win.bounds.width, height: win.bounds.height, zIndex: win.z };
    if (hidden) style.display = 'none';

    return (
        <div
            ref={frameRef}
            className={`perci-window${active ? ' active' : ''}${maximized ? ' maximized' : ''}${animClass ? ` ${animClass}` : ''}`}
            style={style}
            onPointerDown={() => focusWindow(win.id)}
            onAnimationEnd={handleAnimEnd}
        >
            <div
                className="perci-window-header"
                onPointerDown={startMove}
                onDoubleClick={() => toggleMaximizeWindow(win.id)}
            >
                <div className="perci-window-controls" onPointerDown={(e) => e.stopPropagation()}>
                    <button className="pwc close" aria-label={`Close ${win.title}`} onClick={(e) => { e.stopPropagation(); setAnim('close'); }} />
                    <button className="pwc min" aria-label={`Minimize ${win.title}`} onClick={(e) => { e.stopPropagation(); minimizeWindow(win.id); }} />
                    <button className="pwc max" aria-label={`${maximized ? 'Restore' : 'Maximize'} ${win.title}`} onClick={(e) => { e.stopPropagation(); toggleMaximizeWindow(win.id); }} />
                </div>
                <div className="perci-window-title">{win.title}</div>
            </div>

            <div className="perci-window-body">{children}</div>

            {!maximized && RESIZE_DIRS.map(dir => (
                <div key={dir} className={`perci-resizer ${dir}`} onPointerDown={startResize(dir)} />
            ))}
        </div>
    );
}
