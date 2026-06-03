// Minimal browser shims so the harness lib modules (which read/write
// localStorage) can run under the Node-based Vitest environment without
// pulling in a full DOM implementation.
import { beforeEach, vi } from 'vitest';

class MemoryStorage {
    constructor() {
        this.store = new Map();
    }
    getItem(key) {
        return this.store.has(key) ? this.store.get(key) : null;
    }
    setItem(key, value) {
        this.store.set(String(key), String(value));
    }
    removeItem(key) {
        this.store.delete(key);
    }
    clear() {
        this.store.clear();
    }
}

// Always install our own shim — some runtimes expose a partial localStorage
// global that lacks clear(), which would break per-test isolation.
globalThis.localStorage = new MemoryStorage();

// Each test starts from a clean storage slate so memory/budget/diff state
// never leaks between cases.
beforeEach(() => {
    globalThis.localStorage.clear();
    vi.restoreAllMocks();
});
