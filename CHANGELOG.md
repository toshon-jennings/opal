# Changelog

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
