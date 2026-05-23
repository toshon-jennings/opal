import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useWebContainer } from '../hooks/useWebContainer';

const BuildModeContext = createContext();

export function BuildModeProvider({ children }) {
    const [isBuildMode, setIsBuildMode] = useState(false);
    const {
        webcontainerInstance,
        isLoading: isWebContainerLoading,
        error: webContainerError,
        bootWebContainer
    } = useWebContainer();

    const toggleBuildMode = useCallback(() => {
        setIsBuildMode(prev => {
            const newValue = !prev;
            console.log(`🔧 Build Mode: ${newValue ? 'ON' : 'OFF'}`);
            return newValue;
        });
    }, []);

    useEffect(() => {
        if (isBuildMode && !webcontainerInstance && !isWebContainerLoading) {
            bootWebContainer();
        }
    }, [bootWebContainer, isBuildMode, isWebContainerLoading, webcontainerInstance]);

    const value = {
        isBuildMode,
        setIsBuildMode,
        toggleBuildMode,
        webcontainerInstance,
        isWebContainerLoading,
        webContainerError,
        bootWebContainer
    };

    return (
        <BuildModeContext.Provider value={value}>
            {children}
        </BuildModeContext.Provider>
    );
}

export function useBuildMode() {
    const context = useContext(BuildModeContext);
    if (!context) {
        throw new Error('useBuildMode must be used within a BuildModeProvider');
    }
    return context;
}
