// ── Hermes Chat Session Store ──────────────────────────────────────────────
// Module-level state that survives component remounts (same pattern as
// `hermesChatSession` in electron/main.cjs). When the user navigates away
// from the Hermes panel and comes back, the messages array is still here.
// ───────────────────────────────────────────────────────────────────────────

let _messages = [];
let _sessionId = null;
let _started = false;

export function getHermesChatState() {
  return { messages: _messages, sessionId: _sessionId, started: _started };
}

export function setHermesChatMessages(messages) {
  _messages = messages;
}

export function pushHermesChatMessage(message) {
  _messages = [..._messages, message];
}

export function setHermesChatSessionId(id) {
  _sessionId = id;
}

export function setHermesChatStarted(val) {
  _started = val;
}

export function resetHermesChatState() {
  _messages = [];
  _sessionId = null;
  _started = false;
}