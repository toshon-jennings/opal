export const TERMINAL_PORT_KEY = 'opal_terminal_port';
export const TERMINAL_PORT_CANDIDATES = [3001, 3002];

export function getTerminalPortCandidates() {
    const saved = Number(localStorage.getItem(TERMINAL_PORT_KEY));
    const candidates = Number.isFinite(saved) && saved > 0
        ? [saved, ...TERMINAL_PORT_CANDIDATES]
        : TERMINAL_PORT_CANDIDATES;
    return Array.from(new Set(candidates));
}

export function rememberTerminalPort(port) {
    if (Number.isFinite(Number(port))) {
        localStorage.setItem(TERMINAL_PORT_KEY, String(port));
    }
}

export function buildTerminalWsUrl(port, sessionId = 'default', telemetry = false) {
    const params = new URLSearchParams({ sessionId });
    if (telemetry) params.set('telemetry', '1');
    return `ws://localhost:${port}?${params.toString()}`;
}
