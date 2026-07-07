// pxpipe — local token-compression proxy (https://github.com/teamchong/pxpipe).
// Renders bulky Anthropic request context (system prompt, tool docs, older
// history, large tool results) as dense PNG pages before the request leaves
// the machine, cutting input tokens on models that read them reliably
// (Fable 5 by default). The proxy compresses requests only — responses
// stream through untouched, and non-allowlisted models pass through
// byte-identical.
import { readStringStorage, writeStringStorage } from './persistentStore';

export const PXPIPE_ORIGIN = 'http://127.0.0.1:47821';
export const PXPIPE_MESSAGES_URL = `${PXPIPE_ORIGIN}/v1/messages`;

export function isPxpipeEnabled() {
    return readStringStorage('perci_pxpipe_enabled', 'false') === 'true';
}

export function setPxpipeEnabled(enabled) {
    writeStringStorage('perci_pxpipe_enabled', enabled ? 'true' : 'false');
}

// Reachability probe for the settings UI. The dashboard route serves no CORS
// headers, so first try an opaque no-cors fetch (resolving means something is
// listening). Some embedded browsers block opaque cross-origin requests
// outright, so on failure fall back to an unauthenticated POST through the
// /v1/messages passthrough — the upstream 401 carries CORS headers and is
// readable, while a dead proxy still fails instantly with a network error.
export async function checkPxpipeAlive() {
    try {
        await fetch(`${PXPIPE_ORIGIN}/`, { mode: 'no-cors', cache: 'no-store' });
        return true;
    } catch { /* fall through to the readable probe */ }
    try {
        await fetch(PXPIPE_MESSAGES_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01',
                'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: '{}'
        });
        return true;
    } catch {
        return false;
    }
}
