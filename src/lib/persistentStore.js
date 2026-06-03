export const API_KEY_STORAGE_KEYS = [
    'openai_key',
    'groq_key',
    'gemini_key',
    'tavily_key',
    'openrouter_key',
    'anthropic_key',
    'mistral_key'
];

const PERSISTED_KEYS = [
    'chat_history',
    'current_chat_id',
    'opal_projects',
    'opal_code_state',
    'opal_mission_runs',
    'opal_mission_memory',
    'opal_mission_memory_candidates',
    'opal_terminal_port',
    'working_directory',
    'cowork_routines',
    'user_name',
    'custom_instructions',
    'selected_provider',
    'selected_model',
    'openclaw_config',
    'hermes_app_path',
    'lm_studio_url',
    'jan_url',
    ...API_KEY_STORAGE_KEYS
];

export function hasElectronStore() {
    return typeof window !== 'undefined' && Boolean(window.electron?.getAppData && window.electron?.setAppData);
}

export function readJsonStorage(key, fallback) {
    const saved = localStorage.getItem(key);
    if (!saved) return fallback;
    try {
        return JSON.parse(saved);
    } catch (e) {
        return fallback;
    }
}

export function readStringStorage(key, fallback = '') {
    return localStorage.getItem(key) || fallback;
}

export function getLocalPersistenceSnapshot() {
    return PERSISTED_KEYS.reduce((snapshot, key) => {
        const value = localStorage.getItem(key);
        if (API_KEY_STORAGE_KEYS.includes(key) && !value) return snapshot;
        if (value !== null) snapshot[key] = value;
        return snapshot;
    }, {});
}

export function getLocalApiKeySnapshot() {
    return API_KEY_STORAGE_KEYS.reduce((snapshot, key) => {
        const value = localStorage.getItem(key);
        if (value) snapshot[key] = value;
        return snapshot;
    }, {});
}

export function clearLocalApiKeys() {
    API_KEY_STORAGE_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function writeLocalPersistenceSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    PERSISTED_KEYS.forEach((key) => {
        if (API_KEY_STORAGE_KEYS.includes(key)) return;
        const value = snapshot[key];
        if (typeof value === 'string') {
            localStorage.setItem(key, value);
        }
    });
}

export async function loadElectronPersistence() {
    if (!hasElectronStore()) return null;
    const data = await window.electron.getAppData();
    return data && typeof data === 'object' ? data : {};
}

export async function saveElectronPersistence(partialSnapshot) {
    if (!hasElectronStore()) return null;
    const current = await loadElectronPersistence();
    return window.electron.setAppData({
        ...(current || {}),
        ...partialSnapshot
    });
}

export function hasPersistedUserData(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    return PERSISTED_KEYS.some((key) => typeof snapshot[key] === 'string');
}

export function serializeJson(value) {
    return JSON.stringify(value);
}
