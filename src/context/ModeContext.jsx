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
    MISSION: 'mission', // Agent run supervision and inspection
    CODE: 'code',      // Code editor interface (Legacy/Direct)
    BUILD: 'build',    // Advanced build/deploy interface (future)
    AGENTS: 'agents',  // AI agent control center
};

const DEFAULT_OPENCLAW_CONFIG = {
    activeProfileId: 'local',
    profiles: [
        {
            id: 'local',
            name: 'Local OpenClaw',
            mode: 'local',
            gatewayUrl: 'ws://127.0.0.1:18789',
            controlUrl: 'http://127.0.0.1:18789/openclaw',
            token: ''
        },
        {
            id: 'appliance',
            name: 'OpenClaw Appliance',
            mode: 'appliance',
            gatewayUrl: 'ws://clawbox.local:18789',
            controlUrl: 'http://clawbox.local:18789/openclaw',
            token: ''
        }
    ]
};

function normalizeOpenClawConfig(config) {
    const parsed = config && typeof config === 'object' ? config : DEFAULT_OPENCLAW_CONFIG;
    const profiles = Array.isArray(parsed.profiles) && parsed.profiles.length > 0
        ? parsed.profiles
        : DEFAULT_OPENCLAW_CONFIG.profiles;
    const activeProfileId = profiles.some(profile => profile.id === parsed.activeProfileId)
        ? parsed.activeProfileId
        : profiles[0].id;

    return {
        activeProfileId,
        profiles: profiles.map(profile => ({
            id: profile.id || String(Date.now()),
            name: profile.name || 'OpenClaw',
            mode: profile.mode === 'appliance' ? 'appliance' : 'local',
            gatewayUrl: profile.gatewayUrl || 'ws://127.0.0.1:18789',
            controlUrl: profile.controlUrl || 'http://127.0.0.1:18789/openclaw',
            token: profile.token || ''
        }))
    };
}

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
        files: state?.files || {},
        activeFile: state?.files ? state.activeFile : null,
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

    // Save state to localStorage whenever it changes.
    // Intentionally exclude `files`: it's a runtime disk-cache that syncFilesystem
    // rebuilds on every startup. Persisting it causes unbounded growth when a large
    // directory is opened (thousands of paths × empty strings = megabytes of JSON).
    useEffect(() => {
        const { files: _files, ...stateToSave } = {
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
    const [showGlobalTerminal, setShowGlobalTerminal] = useState(false);
    const [showOpenClawDashboard, setShowOpenClawDashboard] = useState(false);
    const [openClawConfig, setOpenClawConfig] = useState(() => (
        normalizeOpenClawConfig(readJsonStorage('openclaw_config', DEFAULT_OPENCLAW_CONFIG))
    ));
    const [hermesAppPath, setHermesAppPath] = useState(() =>
        readStringStorage('hermes_app_path', '')
    );

    useEffect(() => {
        if (!hasElectronStore()) return;

        let isMounted = true;
        async function hydrateAgentConfigs() {
            try {
                const electronData = await loadElectronPersistence();
                if (!isMounted) return;
                if (typeof electronData?.openclaw_config === 'string') {
                    localStorage.setItem('openclaw_config', electronData.openclaw_config);
                    setOpenClawConfig(normalizeOpenClawConfig(readJsonStorage('openclaw_config', DEFAULT_OPENCLAW_CONFIG)));
                }
                if (typeof electronData?.hermes_app_path === 'string') {
                    localStorage.setItem('hermes_app_path', electronData.hermes_app_path);
                    setHermesAppPath(electronData.hermes_app_path);
                }
            } catch (err) {
                console.error('Failed to hydrate agent configs:', err);
            }
        }

        hydrateAgentConfigs();
        return () => {
            isMounted = false;
        };
    }, []);

    useEffect(() => {
        const serializedOpenClawConfig = serializeJson(openClawConfig);
        localStorage.setItem('openclaw_config', serializedOpenClawConfig);
        if (electronPersistenceReadyRef.current) {
            saveElectronPersistence({
                openclaw_config: serializedOpenClawConfig
            }).catch(err => console.error('Failed to persist OpenClaw config:', err));
        }
    }, [openClawConfig]);

    useEffect(() => {
        localStorage.setItem('hermes_app_path', hermesAppPath);
        if (electronPersistenceReadyRef.current) {
            saveElectronPersistence({
                hermes_app_path: hermesAppPath
            }).catch(err => console.error('Failed to persist Hermes app path:', err));
        }
    }, [hermesAppPath]);

    useEffect(() => {
        if (!window.electron?.getOpenClawLocalProfile) return;

        let isMounted = true;
        async function hydrateLocalOpenClawProfile() {
            try {
                const localProfile = await window.electron.getOpenClawLocalProfile();
                if (!isMounted || !localProfile || localProfile.error) return;
                setOpenClawConfig(prev => ({
                    ...prev,
                    profiles: prev.profiles.map(profile => (
                        profile.id === 'local'
                            ? {
                                ...profile,
                                gatewayUrl: localProfile.gatewayUrl || profile.gatewayUrl,
                                controlUrl: localProfile.controlUrl || profile.controlUrl,
                                token: localProfile.token || profile.token
                            }
                            : profile
                    ))
                }));
            } catch (err) {
                console.error('Failed to read local OpenClaw profile:', err);
            }
        }

        hydrateLocalOpenClawProfile();
        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <ModeContext.Provider value={{
            currentMode,
            setCurrentMode,
            chatState,
            setChatState,
            codeState,
            setCodeState,
            showGlobalTerminal,
            setShowGlobalTerminal,
            showOpenClawDashboard,
            setShowOpenClawDashboard,
            openClawConfig,
            setOpenClawConfig,
            hermesAppPath,
            setHermesAppPath
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
