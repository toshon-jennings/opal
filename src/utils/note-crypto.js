// Per-note encryption using Web Crypto API (PBKDF2 + AES-GCM)
// No external dependencies needed.

const ENC_MARKER = '<!--ENC:v1-->';

function arrayBufferToBase64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToArrayBuffer(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
}

/**
 * Derive an AES-GCM key from a password + salt using PBKDF2.
 */
async function deriveKey(password, salt) {
    const enc = new TextEncoder();
    const rawKey = await crypto.subtle.importKey(
        'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations: 200000, hash: 'SHA-256' },
        rawKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

/**
 * Encrypt plaintext with a password. Returns a JSON string containing
 * base64-encoded salt, iv, and ciphertext.
 */
export async function encryptNote(plaintext, password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await deriveKey(password, salt);
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv }, key, enc.encode(plaintext)
    );
    const payload = ENC_MARKER + JSON.stringify({
        salt: arrayBufferToBase64(salt),
        iv: arrayBufferToBase64(iv),
        ct: arrayBufferToBase64(ciphertext)
    });
    return payload;
}

/**
 * Decrypt an encrypted note JSON string with a password.
 * Returns the plaintext, or throws on wrong password / bad format.
 */
export async function decryptNote(encryptedText, password) {
    if (!encryptedText.startsWith(ENC_MARKER)) {
        throw new Error('Not an encrypted note');
    }
    const json = encryptedText.slice(ENC_MARKER.length);
    const { salt, iv, ct } = JSON.parse(json);
    const key = await deriveKey(password, new Uint8Array(base64ToArrayBuffer(salt)));
    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(base64ToArrayBuffer(iv)) },
        key,
        base64ToArrayBuffer(ct)
    );
    return new TextDecoder().decode(plaintext);
}

/**
 * Check if a file's content is an encrypted note.
 */
export function isEncrypted(content) {
    return content && content.startsWith(ENC_MARKER);
}
