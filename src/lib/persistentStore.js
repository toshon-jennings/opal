// ── Persistence layer ──────────────────────────────────────────────────────
// In Electron mode, ALL data is stored in the encrypted app-data file
// (electron/main.cjs → app-data:get / app-data:set) which uses
// safeStorage.encryptString for API keys and writes atomically to disk.
//
// A synchronous in-memory cache is hydrated at startup so that existing
// synchronous callers (useState initialisers, etc.) keep working without
// refactoring every call site to async.
//
// In non-Electron (web) mode, localStorage is used as a fallback.

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
    'perci_power_workspace',
    'perci_power_workspace_cowork_handoff',
    'perci_power_workspace_project_handoff',
    'gitshells_projects',
    'gitshells_sidebar_width',
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
    'caveman_level_chat',
    'caveman_level_code',
    'ponytail_level_code',
    'ponytail_level_chat',
    'selected_provider',
    'selected_model',
    'openclaw_config',
    'lm_studio_url',
    'jan_url',
    'weather_sync_enabled',
    'weather_location',
    'search_engine',
    'searxng_url',
    'custom_models',
    'perci_open_windows',
    'perci_window_bounds',
    'theme',
    'openclaw-user-diary',
    'openclaw-user-diary-saved',
    'perci_localhost_last_url',
    'perci_localhost_home',
    'perci_localhost_allow_http',
    'perci_localhost_history',
    'perci_klipit_last_url',
    'perci_klipit_home',
    'perci_klipit_allow_http',
    'perci_klipit_history',
    ...API_KEY_STORAGE_KEYS
];

// ── In-memory cache ───────────────────────────────────────────────────────
// Hydrated once at startup from Electron appData (or localStorage in web mode).
// All synchronous reads go through this cache.

/** @type {Record<string, string>} */
let memoryStore = {};

let hydrationPromise = null;
let hydrated = false;

/**
 * Synchronous read from the in-memory cache.
 * Returns fallback if the key has not been hydrated yet or does not exist.
 */
function readFromCache(key, fallback = '') {
    if (key in memoryStore) return memoryStore[key];
    return fallback;
}

/**
 * Write to the in-memory cache (synchronous, always available).
 */
function writeToCache(key, value) {
    if (value === undefined || value === null) {
        delete memoryStore[key];
    } else {
        memoryStore[key] = value;
    }
}

// ── Electron detection ────────────────────────────────────────────────────

export function hasElectronStore() {
    return typeof window !== 'undefined' && Boolean(window.electron?.getAppData && window.electron?.setAppData);
}

// ── Hydration ─────────────────────────────────────────────────────────────
// Call once at app startup. Returns a promise that resolves when the cache
// is populated. Safe to call multiple times — subsequent calls return the
// same promise.

export function ensureHydrated() {
    if (hydrationPromise) return hydrationPromise;

    hydrationPromise = (async () => {
        if (hasElectronStore()) {
            try {
                const data = await window.electron.getAppData();
                if (data && typeof data === 'object') {
                    memoryStore = { ...data };
                }
            } catch (err) {
                console.error('[persistentStore] Failed to hydrate from Electron appData:', err);
            }
        } else {
            // Web fallback: populate cache from localStorage
            for (const key of PERSISTED_KEYS) {
                try {
                    const val = localStorage.getItem(key);
                    if (val !== null) memoryStore[key] = val;
                } catch (_) { /* ignore */ }
            }
        }
        hydrated = true;
    })();

    return hydrationPromise;
}

/** Synchronous check — true if hydration has completed. */
export function isHydrated() {
    return hydrated;
}

// ── Electron read/write ──────────────────────────────────────────────────

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

// ── Public API (synchronous reads, async writes) ─────────────────────────

/**
 * Read a JSON-parsed value. Returns fallback if missing or unparseable.
 * Synchronous — reads from the in-memory cache.
 */
export function readJsonStorage(key, fallback) {
    const saved = readFromCache(key);
    if (!saved) return fallback;
    try {
        return JSON.parse(saved);
    } catch (e) {
        return fallback;
    }
}

/**
 * Read a string value. Returns fallback (default '') if missing.
 * Synchronous — reads from the in-memory cache.
 */
export function readStringStorage(key, fallback = '') {
    return readFromCache(key) || fallback;
}

/**
 * Write a string value. Updates the in-memory cache synchronously and
 * persists to Electron appData (or localStorage in web mode) asynchronously.
 */
export function writeStringStorage(key, value) {
    writeToCache(key, value);
    if (hasElectronStore()) {
        // Fire-and-forget — the cache is already updated synchronously
        saveElectronPersistence({ [key]: value }).catch(err => {
            console.error(`[persistentStore] Failed to persist ${key}:`, err);
        });
    } else {
        try { localStorage.setItem(key, value); } catch (_) { /* ignore */ }
    }
}

/**
 * Write a JSON value. Serialises to string, then delegates to writeStringStorage.
 */
export function writeJsonStorage(key, value) {
    writeStringStorage(key, JSON.stringify(value));
}

/**
 * Remove a key. Updates the in-memory cache synchronously and
 * persists the removal asynchronously.
 */
export function removeStorageKey(key) {
    writeToCache(key, undefined);
    if (hasElectronStore()) {
        // To "remove" from the merged app-data file we need to write undefined
        // so the key is absent on next load. setAppData merges, so we write
        // a null sentinel that readJsonStorage/readStringStorage treat as missing.
        saveElectronPersistence({ [key]: null }).catch(err => {
            console.error(`[persistentStore] Failed to remove ${key}:`, err);
        });
    } else {
        try { localStorage.removeItem(key); } catch (_) { /* ignore */ }
    }
}

// ── Snapshot helpers (for migration / bulk operations) ────────────────────

/**
 * Return a snapshot of all currently cached persisted keys.
 * Synchronous — reads from the in-memory cache.
 */
export function getPersistenceSnapshot() {
    return PERSISTED_KEYS.reduce((snapshot, key) => {
        const value = memoryStore[key];
        if (value !== undefined && value !== null) snapshot[key] = value;
        return snapshot;
    }, {});
}

/**
 * Return a snapshot of all API keys currently in the cache.
 * Synchronous — reads from the in-memory cache.
 */
export function getApiKeySnapshot() {
    return API_KEY_STORAGE_KEYS.reduce((snapshot, key) => {
        const value = memoryStore[key];
        if (value) snapshot[key] = value;
        return snapshot;
    }, {});
}

/**
 * Write a bulk snapshot. Updates the cache synchronously and persists
 * to Electron appData asynchronously.
 */
export function writePersistenceSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return;
    for (const [key, value] of Object.entries(snapshot)) {
        writeToCache(key, value);
    }
    if (hasElectronStore()) {
        saveElectronPersistence(snapshot).catch(err => {
            console.error('[persistentStore] Failed to persist snapshot:', err);
        });
    } else {
        try {
            for (const [key, value] of Object.entries(snapshot)) {
                if (typeof value === 'string') localStorage.setItem(key, value);
            }
        } catch (_) { /* ignore */ }
    }
}

/**
 * Clear all API keys. Updates the cache synchronously and persists
 * asynchronously.
 */
export function clearApiKeys() {
    for (const key of API_KEY_STORAGE_KEYS) {
        writeToCache(key, undefined);
    }
    if (hasElectronStore()) {
        const clearMap = {};
        for (const key of API_KEY_STORAGE_KEYS) clearMap[key] = null;
        saveElectronPersistence(clearMap).catch(err => {
            console.error('[persistentStore] Failed to clear API keys:', err);
        });
    } else {
        try {
            for (const key of API_KEY_STORAGE_KEYS) localStorage.removeItem(key);
        } catch (_) { /* ignore */ }
    }
}

// ── Legacy compat (deprecated — use the functions above) ──────────────────
// These keep old import sites working during the transition.

/** @deprecated Use getPersistenceSnapshot() */
export function getLocalPersistenceSnapshot() {
    return getPersistenceSnapshot();
}

/** @deprecated Use getApiKeySnapshot() */
export function getLocalApiKeySnapshot() {
    return getApiKeySnapshot();
}

/** @deprecated Use clearApiKeys() */
export function clearLocalApiKeys() {
    clearApiKeys();
}

/** @deprecated Use writePersistenceSnapshot() */
export function writeLocalPersistenceSnapshot(snapshot) {
    writePersistenceSnapshot(snapshot);
}

export function hasPersistedUserData(snapshot) {
    if (!snapshot || typeof snapshot !== 'object') return false;
    return PERSISTED_KEYS.some((key) => typeof snapshot[key] === 'string');
}

export function serializeJson(value) {
    return JSON.stringify(value);
}
