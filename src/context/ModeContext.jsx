import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
    DASHBOARD: 'dashboard', // Always-mounted home dashboard (the "desktop")
    CHAT: 'chat',      // Normal conversation interface
    COWORK: 'cowork',  // Session-based task interface (Claude style)
    MISSION: 'mission', // Agent run supervision and inspection
    CODE: 'code',      // Code editor interface (Legacy/Direct)
    BUILD: 'build',    // Advanced build/deploy interface (future)
    AGENTS: 'agents',  // AI agent control center
    AUTORESEARCH: 'autoresearch', // Karpathy prompt-optimization loop monitor
    OFFICE: 'office',  // Animated agent office scene (Perci HQ)
    LIGHTHOUSE: 'lighthouse', // Port scanning and conflict detection
};

// Non-mode windows (surfaces that open as windows but aren't in the MODES enum).
export const OPENCLAW_WINDOW_ID = 'openclaw';
export const HERMES_WINDOW_ID = 'hermes';
export const YOUTUBE_WINDOW_ID = 'youtube';

// Titles shown in window headers and dock chips for each windowed surface.
export const WINDOW_TITLES = {
    [MODES.CHAT]: 'Chat',
    [MODES.COWORK]: 'Cowork',
    [MODES.CODE]: 'Code',
    [MODES.AGENTS]: 'Agents',
    [MODES.MISSION]: 'Mission Control',
    [MODES.BUILD]: 'Build',
    [MODES.AUTORESEARCH]: 'Autoresearch',
    [MODES.OFFICE]: 'Perci HQ',
    [MODES.LIGHTHOUSE]: 'Lighthouse',
    [OPENCLAW_WINDOW_ID]: 'OpenClaw',
    [HERMES_WINDOW_ID]: 'Hermes',
    [YOUTUBE_WINDOW_ID]: 'YouTube',
};

// Windows whose content is an Electron <webview>; CSS transforms can make webviews
// flicker, so these minimize with a plain fade instead of the whirlpool spin.
const NO_WHIRLPOOL_IDS = new Set([OPENCLAW_WINDOW_ID, HERMES_WINDOW_ID, YOUTUBE_WINDOW_ID]);

const WINDOW_DEFAULTS = { width: 960, height: 640, minWidth: 420, minHeight: 300, cascade: 34 };
const DOCK_RESERVED_HEIGHT = 64;

function viewportSize() {
    if (typeof window === 'undefined') return { width: 1440, height: 900 };
    return { width: window.innerWidth, height: window.innerHeight };
}

function defaultBounds(index = 0) {
    const { width: vw, height: vh } = viewportSize();
    const width = Math.min(WINDOW_DEFAULTS.width, Math.round(vw * 0.72));
    const height = Math.min(WINDOW_DEFAULTS.height, Math.round((vh - 120 - DOCK_RESERVED_HEIGHT) * 0.94));
    const offset = (index % 6) * WINDOW_DEFAULTS.cascade;
    return { x: 80 + offset, y: 36 + offset, width, height };
}

function clampBounds(bounds) {
    const { width: vw, height: vh } = viewportSize();
    const width = Math.max(WINDOW_DEFAULTS.minWidth, Math.min(bounds.width, vw));
    const height = Math.max(WINDOW_DEFAULTS.minHeight, Math.min(bounds.height, vh - 80 - DOCK_RESERVED_HEIGHT));
    const x = Math.min(Math.max(bounds.x, 0), Math.max(0, vw - 160));
    const y = Math.min(Math.max(bounds.y, 0), Math.max(0, vh - 140 - DOCK_RESERVED_HEIGHT));
    return { x, y, width, height };
}

// Rebuilds the persisted open-window set on load: validates shape, re-clamps
// geometry to the current viewport, and re-derives non-persisted fields.
function hydrateWindows(saved) {
    if (!Array.isArray(saved)) return [];
    const validStates = new Set(['normal', 'minimized', 'maximized']);
    return saved
        // The YouTube window's content (its embed URL) isn't persisted, so drop
        // any stale chip on reload rather than rehydrate an empty player.
        .filter(w => w && typeof w.id === 'string' && typeof w.modeId === 'string' && w.id !== YOUTUBE_WINDOW_ID)
        .map(w => ({
            id: w.id,
            modeId: w.modeId,
            title: WINDOW_TITLES[w.modeId] || w.title || w.modeId,
            state: validStates.has(w.state) ? w.state : 'normal',
            z: Number(w.z) || 20,
            focusedAt: Number(w.focusedAt) || Date.now(),
            bounds: clampBounds(w.bounds && typeof w.bounds === 'object' ? w.bounds : defaultBounds(0)),
            restoreBounds: w.restoreBounds && typeof w.restoreBounds === 'object' ? clampBounds(w.restoreBounds) : undefined,
            noWhirlpool: NO_WHIRLPOOL_IDS.has(w.modeId),
        }));
}

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
    const [currentMode, setActiveMode] = useState(MODES.DASHBOARD);
    const electronPersistenceReadyRef = useRef(!hasElectronStore());

    // ── Window system ──────────────────────────────────────────────
    // The dashboard is the always-mounted base "desktop". Every mode (Chat
    // included) opens as a floating window on top, surfaced by the bottom dock.
    // The open set is persisted so windows survive a reload; per-mode geometry is
    // remembered separately so reopening a closed window restores its size.
    const [windows, setWindows] = useState(() => hydrateWindows(readJsonStorage('perci_open_windows', [])));
    // The embed URL backing the YouTube window's iframe. The window itself lives
    // in `windows` (so it's a first-class dock citizen); this holds its content.
    const [youtubeUrl, setYoutubeUrl] = useState(null);
    // Agent id to pre-select when the Agents window opens (e.g. clicking a desk
    // in Perci HQ). Consumed and cleared by AgentsPanel.
    const [pendingAgentSelection, setPendingAgentSelection] = useState(null);
    const zCounterRef = useRef(windows.reduce((max, w) => Math.max(max, w.z || 0), 20));

    // Mirror of `windows` so actions can read the latest set without putting
    // impure logic inside setState updaters.
    const windowsRef = useRef(windows);
    useEffect(() => { windowsRef.current = windows; }, [windows]);

    // Persist the open window set (which modes are open, their state + geometry).
    useEffect(() => {
        localStorage.setItem('perci_open_windows', serializeJson(windows));
    }, [windows]);

    // Per-mode geometry memory. Kept in a ref (not React state) so move/resize
    // updaters stay pure; persisted to localStorage by the effect below.
    const windowBoundsRef = useRef(readJsonStorage('perci_window_bounds', {}) || {});
    useEffect(() => {
        let changed = false;
        const next = { ...windowBoundsRef.current };
        for (const w of windows) {
            if (w.state !== 'normal') continue;
            const cur = next[w.modeId];
            if (!cur || cur.x !== w.bounds.x || cur.y !== w.bounds.y || cur.width !== w.bounds.width || cur.height !== w.bounds.height) {
                next[w.modeId] = w.bounds;
                changed = true;
            }
        }
        if (changed) {
            windowBoundsRef.current = next;
            localStorage.setItem('perci_window_bounds', serializeJson(next));
        }
    }, [windows]);

    const topVisibleId = (list) => {
        const visible = list.filter(w => w.state !== 'minimized');
        if (!visible.length) return MODES.DASHBOARD;
        return visible.reduce((a, b) => (b.z > a.z ? b : a), visible[0]).id;
    };

    const focusWindow = useCallback((id) => {
        const nextZ = ++zCounterRef.current;
        setWindows(ws => ws.map(w => w.id === id
            ? { ...w, z: nextZ, focusedAt: Date.now(), state: w.state === 'minimized' ? 'normal' : w.state }
            : w));
        setActiveMode(id);
    }, []);

    const openWindow = useCallback((modeId) => {
        if (modeId === MODES.DASHBOARD) return;
        const nextZ = ++zCounterRef.current;
        setActiveMode(modeId);
        setWindows(ws => {
            const existing = ws.find(w => w.id === modeId);
            if (existing) {
                return ws.map(w => w.id === modeId
                    ? { ...w, z: nextZ, focusedAt: Date.now(), state: w.state === 'minimized' ? 'normal' : w.state }
                    : w);
            }
            const bounds = clampBounds(windowBoundsRef.current[modeId] || defaultBounds(ws.length));
            return [...ws, {
                id: modeId,
                modeId,
                title: WINDOW_TITLES[modeId] || modeId,
                state: 'normal',
                z: nextZ,
                focusedAt: Date.now(),
                bounds,
                noWhirlpool: NO_WHIRLPOOL_IDS.has(modeId),
            }];
        });
    }, []);

    // Opens (or refocuses) the YouTube window with a new embed URL.
    const openYouTubeWindow = useCallback((embedUrl) => {
        if (!embedUrl) return;
        setYoutubeUrl(embedUrl);
        openWindow(YOUTUBE_WINDOW_ID);
    }, [openWindow]);

    // Opens (or refocuses) the Agents window with a specific agent's card selected.
    const openAgentWindow = useCallback((agentId) => {
        setPendingAgentSelection(agentId);
        openWindow(MODES.AGENTS);
    }, [openWindow]);

    // setCurrentMode keeps its existing call sites working: Dashboard reveals
    // the desktop (minimizing windows); every other mode opens/focuses its window.
    const setCurrentMode = useCallback((modeId) => {
        if (modeId === MODES.DASHBOARD) {
            setActiveMode(MODES.DASHBOARD);
            setWindows(ws => ws.map(w => (w.state === 'minimized' ? w : { ...w, state: 'minimized' })));
            return;
        }
        openWindow(modeId);
    }, [openWindow]);

    const closeWindow = useCallback((id) => {
        const next = windowsRef.current.filter(w => w.id !== id);
        setWindows(next);
        setActiveMode(topVisibleId(next));
        if (id === YOUTUBE_WINDOW_ID) setYoutubeUrl(null);
    }, []);

    const minimizeWindow = useCallback((id) => {
        const next = windowsRef.current.map(w => (w.id === id ? { ...w, state: 'minimized' } : w));
        setWindows(next);
        setActiveMode(topVisibleId(next));
    }, []);

    const toggleMaximizeWindow = useCallback((id) => {
        setWindows(ws => ws.map(w => {
            if (w.id !== id) return w;
            if (w.state === 'maximized') {
                return { ...w, state: 'normal', bounds: clampBounds(w.restoreBounds || w.bounds), restoreBounds: undefined };
            }
            return { ...w, state: 'maximized', restoreBounds: w.bounds };
        }));
        focusWindow(id);
    }, [focusWindow]);

    const moveWindow = useCallback((id, x, y) => {
        setWindows(ws => ws.map(w => (
            w.id === id ? { ...w, bounds: clampBounds({ ...w.bounds, x, y }) } : w
        )));
    }, []);

    const resizeWindow = useCallback((id, width, height) => {
        setWindows(ws => ws.map(w => (
            w.id === id ? { ...w, bounds: clampBounds({ ...w.bounds, width, height }) } : w
        )));
    }, []);

    const windowApi = useMemo(() => ({
        windows,
        openWindow,
        closeWindow,
        focusWindow,
        minimizeWindow,
        toggleMaximizeWindow,
        moveWindow,
        resizeWindow,
        youtubeUrl,
        openYouTubeWindow,
        pendingAgentSelection,
        setPendingAgentSelection,
        openAgentWindow,
    }), [windows, openWindow, closeWindow, focusWindow, minimizeWindow, toggleMaximizeWindow, moveWindow, resizeWindow, youtubeUrl, openYouTubeWindow, pendingAgentSelection, openAgentWindow]);

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
        const parsed = readJsonStorage('perci_code_state', null);
        return parsed ? normalizeCodeState(parsed) : createDefaultCodeState();
    });

    useEffect(() => {
        if (!hasElectronStore()) return;

        let isMounted = true;
        async function hydrateCodeState() {
            try {
                const electronData = await loadElectronPersistence();
                if (!isMounted) return;
                if (typeof electronData?.perci_code_state === 'string') {
                    localStorage.setItem('perci_code_state', electronData.perci_code_state);
                    if (typeof electronData.working_directory === 'string') {
                        localStorage.setItem('working_directory', electronData.working_directory);
                    }
                    const parsed = readJsonStorage('perci_code_state', null);
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
        localStorage.setItem('perci_code_state', serializedCodeState);
        if (codeState.workingDirectory) {
            localStorage.setItem('working_directory', codeState.workingDirectory);
        }
        if (electronPersistenceReadyRef.current) {
            saveElectronPersistence({
                perci_code_state: serializedCodeState,
                working_directory: codeState.workingDirectory || ''
            }).catch(err => console.error('Failed to persist code state:', err));
        }
    }, [codeState]);


    const [chatState, setChatState] = useState({});
    const [showGlobalTerminal, setShowGlobalTerminal] = useState(false);

    // OpenClaw is now a window. Keep the old open/close API working for existing
    // call sites (AgentsPanel, SettingsModal, MissionControl) by bridging to the
    // window system: open/focus or close the OpenClaw window.
    const showOpenClawDashboard = windows.some(w => w.id === OPENCLAW_WINDOW_ID && w.state !== 'minimized');
    const setShowOpenClawDashboard = useCallback((open) => {
        if (open) openWindow(OPENCLAW_WINDOW_ID);
        else closeWindow(OPENCLAW_WINDOW_ID);
    }, [openWindow, closeWindow]);
    const [openClawConfig, setOpenClawConfig] = useState(() => (
        normalizeOpenClawConfig(readJsonStorage('openclaw_config', DEFAULT_OPENCLAW_CONFIG))
    ));
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
            ...windowApi,
            chatState,
            setChatState,
            codeState,
            setCodeState,
            showGlobalTerminal,
            setShowGlobalTerminal,
            showOpenClawDashboard,
            setShowOpenClawDashboard,
            openClawConfig,
            setOpenClawConfig
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
