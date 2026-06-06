# Changelog

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
- Initial release of Opal.
