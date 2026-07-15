// ── Hermes Chat Conversation Store ──────────────────────────────────────────
// One continuous Hermes conversation. The transcript and the backend session
// id persist through persistentStore (Electron app-data, localStorage on web),
// so the chat survives component remounts, renderer reloads, and full app
// restarts. ChatTab resumes the backend session silently from `sessionId`;
// `resetHermesChatState` (the New chat button) is the only way it ends.
// ───────────────────────────────────────────────────────────────────────────
import { isHydrated, readJsonStorage, removeStorageKey, writeJsonStorage } from './persistentStore';

const STORE_KEY = 'perci_hermes_chat:v1';
const MAX_MESSAGES = 200; // cap transcript growth; oldest turns fall off

let state = null;

function normalize(saved) {
  const messages = Array.isArray(saved?.messages) ? saved.messages.slice(-MAX_MESSAGES) : [];
  const sessionId = typeof saved?.sessionId === 'string' && saved.sessionId && !saved.sessionId.startsWith('pending-')
    ? saved.sessionId
    : null;
  return { messages, sessionId };
}

function load() {
  if (state) return state;
  const loaded = normalize(readJsonStorage(STORE_KEY, null));
  // Don't memoize a read that raced app hydration, or a later persist could
  // overwrite the saved transcript with this empty snapshot.
  if (isHydrated()) state = loaded;
  return loaded;
}

function persist() {
  if (state && isHydrated()) writeJsonStorage(STORE_KEY, state);
}

export function getHermesChatState() {
  const { messages, sessionId } = load();
  return { messages, sessionId };
}

export function setHermesChatMessages(messages) {
  const next = Array.isArray(messages) ? messages.slice(-MAX_MESSAGES) : [];
  state = { ...load(), messages: next };
  persist();
}

export function setHermesChatSessionId(sessionId) {
  state = { ...load(), sessionId: sessionId || null };
  persist();
}

export function resetHermesChatState() {
  state = { messages: [], sessionId: null };
  removeStorageKey(STORE_KEY);
}
