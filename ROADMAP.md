# Perci Roadmap

> **Agent note:** This is the parked intent doc. Don't start building items marked `Parked` — they are here so future agents get triggered at the right moment and don't forget the owner's goal. If you touch persistence, auth, billing, or `perci-data.json`, check this file first.

---

## 1. Perci Cloud — Sync Subscription (Parked)

**Status:** Parked — do not implement yet. Visible for planning only.

**Intent:** Paid "Perci Cloud" subscription that syncs a user's Perci installations (multiple machines, same user). User explicitly wants this eventually; feasibility confirmed 2026-08-22.

**Why:** Perci is 100% local today (`electron/main.cjs` → `perci-data.json` via `safeStorage`, fallback `localStorage` in web mode — see `src/lib/persistentStore.js:1` and `src/lib/persistentStore.js:24` `PERSISTED_KEYS`). Users reinstall / use 2 laptops and lose chat history, projects, notes, OpenClaw/Hermes config, and BARS ideas. Cloud sync is the retention + revenue lever.

**Scope when we do it:**
- **Sync (allowlist only):** `chat_history`, `perci_projects`, `perci_power_workspace`, `perci_mission_runs`/`perci_mission_memory`, `perci_bars_ideas:v1`, `perci_docket_*`, `perci_desk_tasks:v1`, `perci_hermes_chat:v1`, `custom_instructions`, `openclaw_config` (gateway URLs, not tokens initially), and the Notes folder contents (`~/Documents/Perci Notes` at `electron/main.cjs:1440` — not just the pointer `perci_notes_folder`).
- **Do NOT sync:** `working_directory` / absolute paths, `perci_terminal_port`, `perci_open_windows`, `perci_window_bounds`, device-specific ports. These are machine-local (`src/lib/persistentStore.js:55`).
- **E2EE for secrets:** `API_KEY_STORAGE_KEYS` (`openai_key`, `anthropic_key`, etc.) are currently OS-keychain-bound via `safeStorage.encryptString` (`electron/main.cjs:1476`) and not portable. Cloud sync for keys must be client-side E2EE (Argon2id-derived key from user password, recovery code). Server never sees plaintext. If E2EE isn't ready, don't sync keys at all — re-enter per device.
- **Conflict strategy:** Server is source of truth, per-key `updatedAt` + `deviceId`, `push(diff)` on `writeStringStorage` (`src/lib/persistentStore.js:245`) + periodic `pull`. Phase 1 can be last-write-wins with single-active-device guard; later move to CRDT for `chat_history`.

**Trigger for agents:** If the user says "let's do Perci Cloud / sync / subscription", or you are about to add auth, billing (Stripe), `perci-data.json` migration, or a new persistence key — re-read the detailed feasibility notes from 2026-08-22 (in session history) and propose a phased plan before coding:
1. Export/import snapshot using `getPersistenceSnapshot()` (`src/lib/persistentStore.js:288`) — proves allowlist.
2. Phase 1: Auth + entitlement + non-secret sync (Supabase/Neon + S3, no E2EE).
3. Phase 2: E2EE vault + Notes folder blob sync.
4. Phase 3: Realtime watcher + multi-device live sync.

**Non-goals now:** No backend, no billing code, no schema migration. Just keep persistence changes forward-compatible (new keys added to `PERSISTED_KEYS` should note `sync: yes/no/e2ee` in a comment).

---

## 2. Backlog (add here)

| # | Idea | Status |
|---|------|--------|
| — | (next parked idea goes here) | Parked |

---

### How to use this file

- Owner adds one-line intents here instead of forgetting them.
- Agents: treat `Parked` as "read-only context" — surface it in planning (`/create-spec`, `improve-codebase-architecture` scans) but don't create issues/PRs until owner says to move it to `Next`.
