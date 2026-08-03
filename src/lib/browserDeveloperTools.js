export const BROWSER_VIEWPORT_PRESETS = [
    { id: 'fit', label: 'Fit window', shortLabel: 'Fit', width: null, height: null },
    { id: 'iphone', label: 'iPhone — 390 × 844', shortLabel: '390 × 844', width: 390, height: 844 },
    { id: 'android', label: 'Android — 412 × 915', shortLabel: '412 × 915', width: 412, height: 915 },
    { id: 'tablet', label: 'Tablet — 768 × 1024', shortLabel: '768 × 1024', width: 768, height: 1024 },
    { id: 'desktop', label: 'Desktop — 1440 × 900', shortLabel: '1440 × 900', width: 1440, height: 900 },
];

const VIEWPORTS_BY_ID = new Map(
    BROWSER_VIEWPORT_PRESETS.map((preset) => [preset.id, preset]),
);
const DIAGNOSTIC_KINDS = new Set(['console', 'navigation', 'crash', 'info']);
const DIAGNOSTIC_LEVELS = new Set(['info', 'warning', 'error']);
const MAX_DIAGNOSTIC_MESSAGE_LENGTH = 400;
const MAX_DIAGNOSTICS = 40;
const MAX_JSON_DOCUMENT_LENGTH = 1_000_000;

export function resolveBrowserViewport(presetId) {
    return VIEWPORTS_BY_ID.get(presetId) || BROWSER_VIEWPORT_PRESETS[0];
}

export function browserConsoleLevel(level) {
    if (level === 'error' || Number(level) >= 3) return 'error';
    if (level === 'warning' || Number(level) === 2) return 'warning';
    return 'info';
}

export function appendBrowserDiagnostic(entries, entry, limit = MAX_DIAGNOSTICS) {
    const message = String(entry?.message || '').trim().slice(0, MAX_DIAGNOSTIC_MESSAGE_LENGTH);
    if (!message) return Array.isArray(entries) ? entries : [];

    const nextEntry = {
        kind: DIAGNOSTIC_KINDS.has(entry?.kind) ? entry.kind : 'info',
        level: DIAGNOSTIC_LEVELS.has(entry?.level) ? entry.level : 'info',
        message,
        timestamp: Number.isFinite(entry?.timestamp) ? entry.timestamp : Date.now(),
    };

    return [nextEntry, ...(Array.isArray(entries) ? entries : [])]
        .slice(0, Math.max(1, Math.min(Number(limit) || MAX_DIAGNOSTICS, MAX_DIAGNOSTICS)));
}

export function formatJsonDocument(rawText) {
    const text = String(rawText || '').trim();
    if (!text) return { ok: false, error: 'The page does not contain JSON text.' };
    if (text.length > MAX_JSON_DOCUMENT_LENGTH) {
        return { ok: false, error: 'The JSON document is too large to format safely.' };
    }

    try {
        return { ok: true, formatted: JSON.stringify(JSON.parse(text), null, 2) };
    } catch {
        return { ok: false, error: 'The page content is not valid JSON.' };
    }
}
