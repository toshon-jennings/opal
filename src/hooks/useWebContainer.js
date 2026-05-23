import { useCallback, useState, useRef } from 'react';

/**
 * Custom hook to manage WebContainer instance.
 * Implements singleton pattern to prevent multiple boots.
 */
export function useWebContainer() {
    const [webcontainerInstance, setWebcontainerInstance] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);
    const bootPromiseRef = useRef(null);

    const bootWebContainer = useCallback(async () => {
        if (webcontainerInstance) return webcontainerInstance;

        if (!window.crossOriginIsolated) {
            const err = new Error('WebContainer requires a cross-origin isolated browser context.');
            setError(err);
            return null;
        }

        if (!bootPromiseRef.current) {
            setIsLoading(true);
            setError(null);
            console.log('Booting WebContainer...');
            const { WebContainer } = await import('@webcontainer/api');
            bootPromiseRef.current = WebContainer.boot();
        }

        try {
            const instance = await bootPromiseRef.current;
            console.log('WebContainer booted successfully.');
            setWebcontainerInstance(instance);
            setIsLoading(false);
            return instance;
        } catch (err) {
            console.error('Failed to boot WebContainer:', err);
            setError(err);
            setIsLoading(false);
            bootPromiseRef.current = null;
            return null;
        }
    }, [webcontainerInstance]);

    return { webcontainerInstance, isLoading, error, bootWebContainer };
}
