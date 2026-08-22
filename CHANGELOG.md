# Changelog

## [0.49.0] - 2026-08-22
### Added
- **Apfel Harness auto-start** — opening the Apfel window now auto-launches `node ~/apfel-harness/server.js` via `localhost:start-now` (`src/components/ApfelMode.jsx:82`, `src/lib/localServices.js:29`, `electron/main.cjs:4993`) and polls `localhostCheckHealth` before reloading, mirroring `GithubOverviewMode`. Offline screen shows a **Start Apfel Harness** button on Electron with a starting spinner; browser/non-Mac falls back to manual `cd ~/apfel-harness && npm start`. No terminal workaround needed for Apple Silicon users — the harness supervises `apfel --serve` on `:6272` and reports `on-device` vs `ui only` correctly. Change kept in sync with `~/apfel-harness/perci/ApfelMode.jsx` per `AGENTS.md`.
- **Perci OS Settings — Power, Display, Volume and real-app launcher** — `SystemSettingsMode` (`src/components/SystemSettingsMode.jsx`) with D-Bus/sysfs-backed controls gated by `usePerciOS()` (`src/hooks/usePerciOS.js`), which resolves false outside the Linux OS-shell image (`/etc/perci-os-release`). Power via `logind` + `UPower`, Display via backlight sysfs, Volume via `wpctl`, WiFi via NetworkManager D-Bus (`electron/perci-os.cjs:1`). Launcher now shows installed `.desktop` apps via `SirPerciLauncher.jsx`. Mac app unaffected.
- **Perci OS Settings — WiFi** — NetworkManager D-Bus integration for scan, status, and connect (`electron/perci-os.cjs`).
- **Perci Cloud roadmap** — `ROADMAP.md` parks the paid sync intent (allowlist, E2EE for keys, `perci-data.json` forward-compat) so future persistence/auth work checks it first (`CLAUDE.md`).
- **Automated backup helper** — `scripts/backup-perci.sh` for `perci-data.json`, notes, and related state.

### Fixed
- **Apfel offline UX** — replaced static "Start it from ~/apfel-harness" notice with an actionable launch path; `canStart` is gated by `window.electron.localhostStartNow` so Linux/Windows or missing checkout degrades gracefully rather than showing a broken button.

## [0.37.0] - 2026-07-12
### Added
- **Apfel Harness mode** — embedded Apfel Harness window with health monitoring and node server lifecycle management.
- **Keysafe mode** — embedded KeySafe window with port 4100 detection and dev server launch.
- **Docker mode** — Docker container management surface.
- **DbInspector mode** — database inspection surface.
- **Localhost mode** — local development server manager with Pxpipe and Shipyard modes.
- **IPTV player** — streaming TV player mode with channel management.
- **PerciDesk surfaces** — expanded workspace surfaces for the desktop.
- **SimpleX integration** — privacy-focused messenger integration with workspace maps.
- **Google Jules agent** — Jules cloud coding agent integrated into the agent panel.
- **Mission Control agent-job bridge** — agent activity feed with pulse visualization and TransitMap integration.
- **Package Registry dashboard surface** — browse/manage npm and PyPI packages from the dashboard.
- **Notes master password (sudo) encryption** — lock/unlock all encrypted notes with a single master password.
- **AutoForge surface + AgentMail tile** — automated forge dashboard tile with AgentMail integration.
- **Perci Map planner surface** — interactive route planning with "Clear all" controls and redesigned map icon.
- **TimesFM forecasting MCP server** — time-series forecasting via Google TimesFM, with hardened renderer tool.
- **Dashboard tile management** — per-section A-Z toggle and drag-to-reorder tiles.
- **Chronicle change-story generator** — CLI tool to generate human-readable change stories from git history.
- **Power Workspace operator manual** — draggable in-window manual overlay.
- **Mode Guide** — rebuilt as a field-manual modal with mode descriptions.
- **Taste-dial system prompts** — personality dials wired into Chat/Code system prompts.
- **Eidos production build** — Eidos dashboard served from production build, parallel startup.
- **G-Dash refinements** — logo, styling, and layout polish.

### Changed
- Perci surfaces refactored and Eidos integration improved.
- Agent CLI mode uses PTY for prompt-flag agents (Cmd Code, Copilot).
- Mission Control agent activity always shown; window extended to 120s.
- Mode Guide, Mission Control guide, and HANDOFF docs updated.

### Fixed
- Toolbar layout bleeding resolved; agentic tools enabled in Code mode.
- Perci-Now counts minimized windows as open surfaces.
- Jules agent card moved to alphabetical position.

## [0.31.0] - 2026-06-24
### Added
- **Ensemble mode** — multi-model deliberation engine with fan-out/judge pipeline. Panel of models responds in parallel, then a judge synthesizes.
- **MarkItDown mode** — document conversion tool with dedicated UI for transforming files to Markdown.
- **Skills mode** — skill management interface with search, editing, and browsing of installed agent skills.
- **Mission Control** — run context menu rendering moved into scope; added missing persistent storage string helper imports.

### Fixed
- **Mission Control render crash** — resolved by ensuring all imported helpers are declared and context menu state stays in component scope.
- **LocalhostMode** — restored missing lucide-react icon imports (Star, Bookmark, Search, ArrowUp, ArrowDown) that caused runtime crash.
- **LocalhostMode Lighthouse guard** — fixed `isElectron?.lighthouseScan` always evaluating to `undefined` (boolean optional-chain pitfall); changed to `window.electron?.lighthouseScan`.

## [0.30.1] - 2026-06-22
### Added
- **Localhost — Lighthouse launcher** — clickable Lighthouse logo button at the top of Localhost mode, styled like the Dashboard tile (logo chip, artwork background, amber hover glow). Opens the full Lighthouse port scanner.
- **Localhost — discovered servers** — collapsible "Running" panel that scans for open localhost ports via Lighthouse and shows one-click server chips. Collapsed by default.

### Fixed
- **Localhost — `Star`/`Bookmark`/`Search`/`ArrowUp`/`ArrowDown` imports** — restored missing lucide-react icon imports that caused a runtime crash.
- **Localhost — Lighthouse scan guard** — fixed `isElectron?.lighthouseScan` always evaluating to `undefined` (boolean optional-chain); changed to `window.electron?.lighthouseScan`.
### Added
- **Knowledge Graph FX** — curved bezier edges, traveling pulse lights along edges, idle node twinkle, and additive glow halos. New settings panel controls for curvature, pulse speed/count, twinkle, and glow.

## [0.23.0] - 2026-06-20
### Added
- **3D Knowledge Graph** — interactive Three.js/R3F visualization of note relationships. Toggle via the "Knowledge Graph" button in the Notes sidebar. Click nodes to open notes; orbit/zoom/pan with mouse.

## [0.22.0] - 2026-06-19
### Added
- **Notes encryption** — per-note AES-GCM encryption with PBKDF2 key derivation. Lock/unlock individual notes with a password. Encrypted notes stored as `.enc.md` files on disk.
- **Notes inline rename** — click the pencil icon in the header or sidebar to rename a note. Handles both `.md` and `.enc.md` files.
- **Notes rename IPC** — new `rename-file` Electron IPC handler for atomic file renames.

## [0.21.0] - 2026-06-18
### Added
- **StudioOS panel** — view/manage your StudioOS workspace directly from Perci: content overview, recent items, browse by content type.
- **StudioOS API bridge** — Electron main-process proxy eliminates CORS errors by routing API calls through the desktop app.
- **Artifact window** — dedicated window for viewing artifacts.
- **Research results window** — dedicated window for research output.

### Changed
- **Dashboard layout** — native tiles now use horizontal layout; dashboard tile grid redesigned.
- **Billboard mode** — WIP improvements.
- **Beginner's guide** — new onboarding flow with OpenRouter model picker.
- **Cowork mode** — UI polish and session management improvements.
- **Intelligent search** — query reformulation, local runtime fact detection, source enhancement.

### Removed
- Get API Key tile from dashboard.

## [0.20.0] - 2026-06-16
### Added
- **BARS mode** — added the idea notebook / OS-surface workspace.
- **Bill Board mode** — added the services, keys, and subscriptions surface.
- **OpenClaw windowing and dashboard polish** — OpenClaw now uses its own window treatment and theming direction instead of leaning on the default Perci orange.

### Changed
- Bumped the app version to 0.20.0 to reflect the newer mode additions and embedded OpenClaw updates.

## [0.18.7] - 2026-06-10
### Changed
- Rebuild with latest artwork and positioning changes.

## [0.18.6] - 2026-06-10
### Added
- **Framed artwork on Office walls** — WallArt3D component with proper texture loading, two pieces placed (right wall and back wall).
- **Shelf with plant** — small shelf with potted plant between the back wall painting and window.

### Changed
- Repositioned wall artwork: landscape on right wall, portrait enlarged and centered on back wall left of window.

## [0.18.0] - 2026-06-10
### Added
- **Dashboard mode** — new Dashboard view with OfficeScene 3D office visualization, accessible via ModeSwitcher alongside existing modes.
- **Office scene** — interactive 3D office environment rendered in the Dashboard mode.

### Changed
- ModeSwitcher updated to include Dashboard mode toggle.
- ModeContext extended for dashboard state management.
- App.jsx, Dock.jsx, OfficePanel.jsx/CSS updated for new layout integration.

## [0.16.0] - 2026-06-07
### Added
- New **window + dock system** for non-Chat modes — Cowork, Code, Agents, Mission, Build, and OpenClaw open as floating, draggable, resizable windows with macOS traffic-light controls, 8-way resize, double-click maximize, and a bottom dock with whirlpool-minimize and domino chip-in animations.
- Open windows persist across reloads; per-mode geometry is remembered when reopening closed windows.
- Per-window error boundary so a crash in one mode doesn't tear down others.
- **OpenClaw session bridging** (bridge step 3) — Agents panel can run OpenClaw through the gateway agent bridge; Cowork exposes `delegate_to_openclaw` for long-running or multi-step gateway delegation.
- **Gateway health + live event streaming** in Mission Control.
- **Intent-aware search** — `IntelligentSearchTool.planSearch()` classifies each message (intent/reason/searchQueries/freshness/expectedSourceTypes) using the selected model, with deterministic local-fact detection for clock/calendar questions and keyword heuristics as offline fallback. Replaces the old brittle `shouldAutoUseWebSearch` phrase matcher.
- `local_runtime_fact` intent answers date/time/day questions directly from the system clock — no web search needed.
- Relevance scoring (token overlap) sorts search results; weak/empty results trigger honest "I searched but found nothing" model guidance instead of fabricated summaries.
- Odysseus-inspired motion pass for Perci/Mission: whirlpool thinking/search indicators, Mission timeline rails, active synapse pulses, domino list reveal utilities.
- Scoped focus-card hover for Mission Control and guide modals — hovered cards lift/glow while siblings recede.
- Perci product upgrades capture.

### Changed
- Perci web search now uses the desktop `web-search` bridge/native provider search path instead of Tavily.
- Removed dead `analyzeSearchCompleteness` and `isNewsQuery` from `IntelligentSearchTool`.
- OpenClaw dashboard rendered as a window (not fullscreen overlay); redundant inline close button removed (window chrome owns close).

### Fixed
- Prevented EPIPE crash from broken stdout/stderr pipe.
- Cowork jobs no longer cancel when navigating away from the mode.
- Explicit web search toggle now honored correctly.
- Window resize-larger drag fixed via full-viewport drag shield.
- Spurious same-origin full reloads blocked in main-process (prevents SPA state wipe).
- Guide modals no longer reset Advanced tab back to Guide during re-renders.
- Mission guide tab reset on close only (not during background re-renders).

## [0.15.0] - 2026-06-06
### Added
- Added an Advanced tab to the in-app Mission Control guide for power users, covering run lifecycle, validation linking, memory pipeline behavior, Transit Map semantics, and operational caveats.
- Added a top-header mode guide (Guide button next to the mode switcher) that explains the differences between Chat, Cowork, Code, Agents (Agent CLI), Mission, and Build.
- Added an Advanced tab to the mode guide for power users who want a more architectural explanation of how the modes differ.
- Bumped version to 0.15.0.

## [0.14.2] - 2026-06-06
### Added
- Added an Advanced tab to the in-app Mission Control guide for power users, covering run lifecycle, validation linking, memory pipeline behavior, Transit Map semantics, and operational caveats.
- Added a top-header mode guide that explains the differences between Chat, Cowork, Code, Agents (Agent CLI), Mission, and Build.
- Added an Advanced tab to the mode guide for power users who want a more architectural explanation of how the modes differ.

## [0.14.1] - 2026-06-06
### Added
- Added a user-friendly in-app Mission Control guide that explains the page layout, statuses, validation flow, memory review, Transit Map, Mission Pulse, and OpenClaw integration.
- Added a Mission Control "Guide" button that opens the documentation directly as a modal from the page.

## [0.14.0] - 2026-06-04
### Added
- New **Agent CLI** mode — AI agent control center with job management, status tracking, and request composition.
- 13 supported agents: Aider, Antigravity CLI, Claude Code, Codex, Copilot, Cursor CLI, Hermes, Jan, OpenClaw, OpenHands, OpenCode, Percival, Qwen Code.
- Real-time job polling (2.5s active / 7s idle) with localStorage persistence.
- Job filtering (All / Active / Done / Needs Attention) and search.
- Job details pane with full prompt, output, timestamps, elapsed time, workspace path.
- Cancel active jobs, copy job ID/prompt/output to clipboard.

## [0.13.1] - 2026-06-03
### Changed
- Updated Chat, Code, and Cowork mode components.
- Refreshed Provider/Model picker and Settings modal.
- Updated integration tools and persistent store.

## [0.11.0] - 2026-05-24
### Added
- Added a **User's Diary** tab to the OpenClaw Dashboard. Write thoughts, reflections, goals, and preferences that OpenClaw reads daily for deeper personal context.
- Diary auto-saves to localStorage with a live save-status indicator in the header.
- Word count footer and `BookOpen` icon tab indicator for the diary panel.

## [0.10.0] - 2026-05-24
### Added
- Integrated a terminal command execution input bar directly inside the OpenClaw Dashboard title header.
- Added UI toggles in Settings under the OpenClaw section to configure the local gateway's OpenShell Sandbox mode (`off`, `non-main`, `all`) and Dreaming mode.
- Added a one-click Gateway restart control to Settings to apply configuration updates instantly.

## [0.9.13] - 2026-05-23
### Changed
- Redesigned Mercury and OpenClaw header buttons with branding-accurate logos and adaptive themes.
- Forced circular styling for the Mercury logo and buttons.

## [0.9.12] - 2026-05-16
### Changed
- Renamed "Hermes" to "Mercury" in the UI header and Settings Modal.
- Updated Mercury tooltip to "MERCURY for Hermes Agent".

## [0.9.1] - 2026-05-15
### Added
- Added Settings access (user avatar + gear icon) to Cowork and Code mode sidebars.
- Added version number display in sidebars.

## [0.9.0] - 2026-05-12
### Added
- Added Hermes controller profiles for local, remote, and SSH-tunnel Agent API endpoints.
- Added an in-app Hermes controller panel with health status and endpoint details.

## [0.8.1] - 2026-05-12
### Fixed
- Prevented startup persistence from overwriting saved API keys with empty initial state.

## [0.8.0] - 2026-05-12
### Added
- Added OpenClaw connection profiles for local Gateway and appliance mode.
- Added in-app OpenClaw dashboard support using an Electron webview.
- Added Gateway status probing and local OpenClaw token discovery.

### Fixed
- Fixed OpenClaw dashboard launch behavior so it no longer opens Chrome by default.
- Fixed local OpenClaw Gateway setup compatibility for current config shape.

## [0.1.1] - 2026-05-10
### Fixed
- Fixed bug where ASCII art would disappear when the terminal window was resized.

## [0.1.0] - 2026-05-01
### Added
- Initial release of Perci.
