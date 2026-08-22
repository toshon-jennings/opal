import { useEffect, useState } from 'react';

/**
 * Whether Perci is running as the Perci OS shell, not a normal desktop
 * install (macOS, Windows, or a plain Linux desktop). Starts — and stays
 * — false on every platform until the main process confirms otherwise,
 * so OS-only surfaces (Settings tile, real-app launcher) never flash into
 * view before this resolves. See electron/perci-os.cjs.
 */
export function usePerciOS() {
    const [isPerciOS, setIsPerciOS] = useState(false);

    useEffect(() => {
        let cancelled = false;
        if (window.electron?.isPerciOS) {
            window.electron.isPerciOS()
                .then((result) => { if (!cancelled) setIsPerciOS(!!result); })
                .catch(() => {});
        }
        return () => { cancelled = true; };
    }, []);

    return isPerciOS;
}
