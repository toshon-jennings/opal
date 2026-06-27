export const TERMINAL_PORT_KEY = 'perci_terminal_port';
export const TERMINAL_PORT_CANDIDATES = [3001, 3002];

import { readStringStorage, writeStringStorage } from './persistentStore';

export function getTerminalPortCandidates() {
    const saved = Number(readStringStorage(TERMINAL_PORT_KEY, ''));
    const candidates = Number.isFinite(saved) && saved > 0
        ? [saved, ...TERMINAL_PORT_CANDIDATES]
        : TERMINAL_PORT_CANDIDATES;
    return Array.from(new Set(candidates));
}

export function rememberTerminalPort(port) {
    if (Number.isFinite(Number(port))) {
        writeStringStorage(TERMINAL_PORT_KEY, String(port));
    }
}

export async function getTerminalConnectionInfo() {
    if (typeof window === 'undefined' || !window.electron?.getTerminalConnectionInfo) {
        return { token: '' };
    }

    try {
        return await window.electron.getTerminalConnectionInfo();
    } catch {
        return { token: '' };
    }
}

export function buildTerminalWsUrl(port, sessionId = 'default', telemetry = false, token = '') {
    const params = new URLSearchParams({ sessionId });
    if (telemetry) params.set('telemetry', '1');
    if (token) params.set('token', token);
    return `ws://localhost:${port}?${params.toString()}`;
}
