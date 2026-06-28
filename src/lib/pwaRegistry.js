// ── PWA Registry ──────────────────────────────────────────────────────
// Dynamic registry of web-app shortcuts (PWA tiles) shown in the
// SYSTEM & EXTERNAL section of the Dashboard. Persisted via persistentStore.
//
// Each entry:
//   {
//     id: 'pwa_twitter.com',          // derived from origin (sanitized)
//     url: 'https://twitter.com',     // normalized URL the user entered
//     origin: 'twitter.com',          // hostname used for partition + dedupe
//     title: 'Twitter',               // page title at time of registration
//     favicon: 'data:image/png;base64,...',  // data URI from main-process extraction
//     hue: '#1da1f2',                 // accent color (optional, extracted or default)
//     addedAt: '2026-06-28T...',      // ISO timestamp
//   }

import { readJsonStorage, writeJsonStorage } from './persistentStore';

const REGISTRY_KEY = 'perci_pwa_registry';

// Default accent for PWA tiles when we can't extract one
const DEFAULT_HUE = '#6b7280';

// Sanitize a hostname into a stable tile ID:
//   twitter.com     → pwa_twitter.com
//   mail.google.com → pwa_mail.google.com
// Replaces colons and slashes so the ID is a single token.
export function originToId(origin) {
  const clean = String(origin || '')
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return `pwa_${clean || 'unknown'}`;
}

export function getPwaRegistry() {
  const raw = readJsonStorage(REGISTRY_KEY, []);
  return Array.isArray(raw) ? raw : [];
}

export function getPwaById(id) {
  return getPwaRegistry().find((p) => p.id === id) || null;
}

// Add a new PWA. Dedupes by origin. Returns the updated registry.
export function addPwa(entry) {
  const list = getPwaRegistry();
  if (list.some((p) => p.id === entry.id)) return list;
  const next = [...list, entry];
  writeJsonStorage(REGISTRY_KEY, next);
  return next;
}

// Remove a PWA by id. Returns the updated registry.
export function removePwa(id) {
  const next = getPwaRegistry().filter((p) => p.id !== id);
  writeJsonStorage(REGISTRY_KEY, next);
  return next;
}

// Convert a PWA registry entry into the tile shape DashboardMode expects.
// White-box logo presentation is signaled by `isPwa: true`.
export function pwaToTile(pwa) {
  return {
    id: pwa.id,
    logo: pwa.favicon || null,
    title: pwa.title || pwa.origin,
    desc: pwa.origin,
    hue: pwa.hue || DEFAULT_HUE,
    isPwa: true,
  };
}

// Validate and normalize a raw URL string the user types in.
// Returns { url, origin } or null if invalid.
export function normalizePwaUrl(raw) {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  // Prepend https:// if no scheme present
  if (!/^https?:\/\//i.test(candidate)) {
    candidate = `https://${candidate}`;
  }

  let parsed;
  try {
    parsed = new URL(candidate);
  } catch {
    return null;
  }

  // Only http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  const origin = parsed.hostname;
  if (!origin) return null;

  return { url: parsed.href, origin };
}
