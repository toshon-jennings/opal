export const API_KEY_STORAGE_KEYS = [
    'openai_key',
    'groq_key',
    'gemini_key',
    'openrouter_key',
    'anthropic_key',
    'mistral_key',
    'github_key'
];

const PERSISTED_KEYS = [
    'chat_history',
    'current_chat_id',
    'perci_projects',
    'perci_code_state',
    'perci_mission_runs',
    'perci_mission_memory',
    'perci_mission_memory_candidates',
    'perci_harness_memory',
    'perci_diff_reviews',
    'perci_budget_state',
    'perci_terminal_port',
    'working_directory',
    'cowork_routines',
    'perci_bars_ideas:v1',
    'perci_bars_ai_settings:v1',
    'user_name',
    'custom_instructions',
    'selected_provider',
    'selected_model',
    'openclaw_config',
    'lm_studio_url',
    'jan_url',
    'weather_sync_enabled',
    'weather_location',
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
