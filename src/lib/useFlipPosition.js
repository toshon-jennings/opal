import { useCallback, useEffect, useLayoutEffect, useState } from 'react';

const DEFAULT_POS = { x: 0, y: 0, origin: 'bottom left' };

/**
 * Shared flip-to-fit positioning for portal-rendered popups anchored near a
 * rect (a button's getBoundingClientRect(), or a zero-size rect built from
 * raw click coordinates). Measures the panel via offsetWidth/offsetHeight
 * rather than getBoundingClientRect — popups that animate in from a
 * scaled-down state would otherwise be measured too small and placed wrong.
 * Prefers opening upward from the anchor (the dock lives at the bottom of
 * the screen) and flips below only when there's no room above. Recomputes
 * on window resize so an open popup can't be left stranded off-screen.
 *
 * @param {React.RefObject} panelRef - ref to the panel element to measure.
 * @param {{left:number, top:number, right:number, bottom:number}} anchorRect
 * @param {{margin?: number, align?: 'start'|'end', remeasureKey?: any}} [options]
 */
export function useFlipPosition(panelRef, anchorRect, options = {}) {
    const { margin = 8, align = 'start', remeasureKey } = options;
    const { left, top, right, bottom } = anchorRect || {};
    const [pos, setPos] = useState(DEFAULT_POS);

    const recompute = useCallback(() => {
        const el = panelRef.current;
        if (!el || left == null) return;
        const panelW = el.offsetWidth;
        const panelH = el.offsetHeight;

        const minX = margin;
        const maxX = window.innerWidth - panelW - margin;
        const anchorX = align === 'end' ? right - panelW : left;
        const nextX = Math.max(minX, Math.min(anchorX, maxX));

        // Prefer opening upward from the anchor; flip below only if there's no room.
        const above = top - panelH - 6;
        const openUp = above >= margin;
        const nextY = openUp ? above : Math.min(bottom + 6, window.innerHeight - panelH - margin);

        setPos({
            x: nextX,
            y: Math.max(margin, nextY),
            origin: `${openUp ? 'bottom' : 'top'} ${align === 'end' ? 'right' : 'left'}`,
        });
    }, [panelRef, left, top, right, bottom, margin, align]);

    useLayoutEffect(() => {
        recompute();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [recompute, remeasureKey]);

    useEffect(() => {
        if (left == null) return undefined;
        window.addEventListener('resize', recompute);
        return () => window.removeEventListener('resize', recompute);
    }, [left, recompute]);

    return pos;
}
