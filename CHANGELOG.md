# Changelog

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
