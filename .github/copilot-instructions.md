# Perci – Copilot Instructions

## Commands

```bash
npm run dev              # Vite dev server at http://localhost:5173
npm run electron:dev     # Run as Electron desktop app (starts Vite + Electron concurrently)
npm run build            # Production build → dist/
npm run dist             # Build Electron distributable → dist_electron/
npm run lint             # ESLint
```

No test suite exists yet.

## Architecture

Perci is a React 18 / Vite SPA that runs as both a web app and an Electron desktop application.

### Electron process split

- **`electron/main.cjs`** – Electron main process. Manages windows, IPC handlers, and spawns `terminal-server.cjs` as a child process.
- **`electron/preload.cjs`** – Exposes a `window.electron` bridge to the renderer. All IPC goes through this.
- **`terminal-server.cjs`** – Standalone WebSocket server (port 3001) using `node-pty` for terminal emulation. Spawned by Electron main and restarted on crash.
- **`src/`** – The renderer (React app). When running in Electron, it detects `window.electron` and uses Electron's safeStorage for secrets; otherwise falls back to `localStorage`.

### Application modes

`src/context/ModeContext.jsx` defines four modes (`CHAT`, `COWORK`, `CODE`, `BUILD`) that control which top-level component renders. Mode and per-mode configs are persisted across sessions.

### LLM layer (`src/lib/llm/`)

- **`clients.js`** – `BaseClient` abstract class + provider subclasses: `OpenAIClient`, `GroqClient`, `GeminiClient`, `OllamaClient`, `LMStudioClient`, `OpenRouterClient`, `AnthropicClient`, `MistralClient`. All expose a `streamChat()` method.  `LLMFactory.getClient(provider)` is the entry point.
- **`ModelService.js`** – Dynamically fetches available models from each provider's API. Capability detection (vision, audio, video, thinking) is done entirely by **pattern matching on model name strings** — there are no hardcoded model IDs.
- **`clients.js` `THINKING_CONFIG`** – Universal config mapping provider-specific reasoning fields (`reasoning_content`, `thinking`, etc.) and streaming tag patterns (`<think>`, `<thinking>`, …) to a normalised thinking payload surfaced in the UI.

### State management

| Context | Owns |
|---|---|
| `ChatContext.jsx` | Conversations, messages, artifacts, API keys, projects, model/provider selection |
| `ModeContext.jsx` | App mode, OpenClaw config, Hermes config |
| `BuildContext.jsx` / `BuildModeContext.jsx` | Build mode file tree and actions |

### Persistence (`src/lib/persistentStore.js`)

The constant `PERSISTED_KEYS` lists every key that is synced. In Electron the store goes through `window.electron.getAppData` / `setAppData` (Electron safeStorage); in the browser everything stays in `localStorage`. **API keys are never stored in `.env` files or committed to source.**

### Artifacts

- **Chat artifacts** – Detected inline in LLM responses, rendered by `ArtifactPanel.jsx` (HTML/React/SVG preview + Research Papers).
- **Build mode artifacts** – Streamed XML `<boltArtifact>` / `<boltAction>` tags, parsed by `BoltArtifactParser.js`.

### WebContainer

`src/hooks/useWebContainer.js` uses the `@webcontainer/api` to run sandboxed Node.js environments in the browser. Vite dev server and preview server both set `Cross-Origin-Embedder-Policy: require-corp` + `Cross-Origin-Opener-Policy: same-origin` headers (required for `SharedArrayBuffer`).

## Key Conventions

- **No hardcoded model IDs.** Capability detection always uses regex/pattern matching on model name strings. See `VISION_PATTERNS`, `AUDIO_PATTERNS`, etc. in `ModelService.js`.
- **`.cjs` extension = CommonJS.** Electron main, preload, and terminal-server use `.cjs` because the package is `"type": "module"`. Don't change those to `.js` or ESM imports.
- **`window.electron` guard.** Any feature that requires Electron IPC must check `hasElectronStore()` (from `persistentStore.js`) before calling `window.electron.*`. The same code runs in a plain browser.
- **`redact-console.cjs`** is installed in the Electron main process to strip API keys from logs. Don't bypass it.
- **CSS design tokens live in `src/index.css`** as CSS custom properties (`--accent`, `--bg-primary`, etc.). Use them rather than hardcoding colors in Tailwind classes or component styles.
- **Adding a provider:** create a subclass of `BaseClient` in `clients.js`, add a case to `LLMFactory.getClient()`, add model-fetching logic to `ModelService.js`, add the storage key to `API_KEY_STORAGE_KEYS` in `persistentStore.js`, and update `SettingsModal.jsx`.
