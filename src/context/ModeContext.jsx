import { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
    hasElectronStore,
    loadElectronPersistence,
    readJsonStorage,
    readStringStorage,
    saveElectronPersistence,
    serializeJson
} from '../lib/persistentStore';

const ModeContext = createContext();

export const MODES = {
    CHAT: 'chat',      // Normal conversation interface
    COWORK: 'cowork',  // Session-based task interface (Claude style)
    CODE: 'code',      // Code editor interface (Legacy/Direct)
    BUILD: 'build'     // Advanced build/deploy interface (future)
};

export function ModeProvider({ children }) {
    const [currentMode, setCurrentMode] = useState(MODES.CHAT);
    const electronPersistenceReadyRef = useRef(!hasElectronStore());

    const createDefaultCodeState = () => ({
        workingDirectory: readStringStorage('working_directory', null),
        sessions: [],
        codingSessions: [],
        currentSessionId: null,
        files: {},
        activeFile: null,
        expandedFolders: new Set(['src']),
        unsavedChanges: false
    });

    const normalizeCodeState = (state) => ({
        ...state,
        expandedFolders: new Set(state?.expandedFolders || ['src'])
    });

    // Load initial state from localStorage
    const [codeState, setCodeState] = useState(() => {
        const parsed = readJsonStorage('opal_code_state', null);
        return parsed ? normalizeCodeState(parsed) : createDefaultCodeState();
    });

    useEffect(() => {
        if (!hasElectronStore()) return;

        let isMounted = true;
        async function hydrateCodeState() {
            try {
                const electronData = await loadElectronPersistence();
                if (!isMounted) return;
                if (typeof electronData?.opal_code_state === 'string') {
                    localStorage.setItem('opal_code_state', electronData.opal_code_state);
                    if (typeof electronData.working_directory === 'string') {
                        localStorage.setItem('working_directory', electronData.working_directory);
                    }
                    const parsed = readJsonStorage('opal_code_state', null);
                    setCodeState(parsed ? normalizeCodeState(parsed) : createDefaultCodeState());
                }
            } catch (err) {
                console.error('Failed to hydrate code state:', err);
            } finally {
                if (isMounted) {
                    electronPersistenceReadyRef.current = true;
                }
            }
        }

        hydrateCodeState();
        return () => {
            isMounted = false;
        };
    }, []);

    // Save state to localStorage whenever it changes
    useEffect(() => {
        console.log('Saving codeState to localStorage:', codeState.sessions.length, 'sessions');
        const stateToSave = {
            ...codeState,
            expandedFolders: Array.from(codeState.expandedFolders || [])
        };
        const serializedCodeState = serializeJson(stateToSave);
        localStorage.setItem('opal_code_state', serializedCodeState);
        if (codeState.workingDirectory) {
            localStorage.setItem('working_directory', codeState.workingDirectory);
        }
        if (electronPersistenceReadyRef.current) {
            saveElectronPersistence({
                opal_code_state: serializedCodeState,
                working_directory: codeState.workingDirectory || ''
            }).catch(err => console.error('Failed to persist code state:', err));
        }
    }, [codeState]);

    const [chatState, setChatState] = useState({});

    return (
        <ModeContext.Provider value={{
            currentMode,
            setCurrentMode,
            chatState,
            setChatState,
            codeState,
            setCodeState
        }}>
            {children}
        </ModeContext.Provider>
    );
}

export const useMode = () => {
    const context = useContext(ModeContext);
    if (!context) {
        throw new Error('useMode must be used within a ModeProvider');
    }
    return context;
};
