const PERSISTED_KEYS = [
    'chat_history',
    'current_chat_id',
    'opal_projects',
    'opal_code_state',
    'working_directory',
    'cowork_routines',
    'user_name',
    'custom_instructions',
    'selected_provider',
    'selected_model'
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
        if (value !== null) snapshot[key] = value;
        return snapshot;
    }, {});
}

export function writeLocalPersistenceSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    PERSISTED_KEYS.forEach((key) => {
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
