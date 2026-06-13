import React, { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext();
const THEME_STORAGE_KEY = 'theme';
const SYSTEM_THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)';

const THEME_MODES = {
    LIGHT: 'light',
    DARK: 'dark',
    SYSTEM: 'system',
};

function getStoredThemeMode() {
    if (typeof window === 'undefined') {
        return THEME_MODES.SYSTEM;
    }

    const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return Object.values(THEME_MODES).includes(savedTheme) ? savedTheme : THEME_MODES.SYSTEM;
}

function getSystemPrefersDark() {
    if (typeof window === 'undefined') {
        return false;
    }

    return window.matchMedia(SYSTEM_THEME_MEDIA_QUERY).matches;
}

export function ThemeProvider({ children }) {
    const [themeMode, setThemeMode] = useState(getStoredThemeMode);
    const [systemPrefersDark, setSystemPrefersDark] = useState(getSystemPrefersDark);

    const isDarkMode = themeMode === THEME_MODES.SYSTEM
        ? systemPrefersDark
        : themeMode === THEME_MODES.DARK;
    const resolvedTheme = isDarkMode ? THEME_MODES.DARK : THEME_MODES.LIGHT;

    useEffect(() => {
        if (typeof window === 'undefined') {
            return undefined;
        }

        const mediaQuery = window.matchMedia(SYSTEM_THEME_MEDIA_QUERY);
        const handleChange = (event) => {
            setSystemPrefersDark(event.matches);
        };

        setSystemPrefersDark(mediaQuery.matches);

        if (typeof mediaQuery.addEventListener === 'function') {
            mediaQuery.addEventListener('change', handleChange);
            return () => mediaQuery.removeEventListener('change', handleChange);
        }

        mediaQuery.addListener(handleChange);
        return () => mediaQuery.removeListener(handleChange);
    }, []);

    useEffect(() => {
        if (typeof document === 'undefined') {
            return;
        }

        document.documentElement.classList.toggle('dark', isDarkMode);
        document.documentElement.style.colorScheme = resolvedTheme;
        localStorage.setItem(THEME_STORAGE_KEY, themeMode);
    }, [isDarkMode, resolvedTheme, themeMode]);

    const toggleTheme = () => {
        setThemeMode(currentMode => {
            const currentlyDark = currentMode === THEME_MODES.SYSTEM
                ? systemPrefersDark
                : currentMode === THEME_MODES.DARK;

            return currentlyDark ? THEME_MODES.LIGHT : THEME_MODES.DARK;
        });
    };

    const cycleThemeMode = () => {
        setThemeMode(currentMode => {
            if (currentMode === THEME_MODES.LIGHT) return THEME_MODES.DARK;
            if (currentMode === THEME_MODES.DARK) return THEME_MODES.SYSTEM;
            return THEME_MODES.LIGHT;
        });
    };

    return (
        <ThemeContext.Provider value={{
            themeMode,
            setThemeMode,
            isDarkMode,
            resolvedTheme,
            toggleTheme,
            cycleThemeMode,
        }}>
            {children}
        </ThemeContext.Provider>
    );
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
}
