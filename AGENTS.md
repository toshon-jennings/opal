# Perci — repo rules

Repo-specific rules for every agent working in this repository. Global rules
(minimal code, no unnecessary duplication, etc.) live in
`~/.config/agent-rules/GLOBAL.md` and apply on top of these — don't repeat them
here.

## Context

- **This project is a fork.** The owner did not write most of it and does not
  yet fully understand what's here. Assume parts of the UI and code may be
  unused, non-functional, or unclear in purpose — do not assume existing code
  works or is needed just because it's present.
- The goal over time is to build a full understanding of the codebase and
  **remove anything unnecessary**. When you touch an area, note dead/unused/
  unclear code rather than silently working around it, and prefer deleting
  genuinely unused code over keeping it.

## Workflow

- All edits go to the main project at `/Users/toshonjennings/opal`, never a
  worktree. The dev server runs from the main project.

## Security

- No `eval`, `Function()`, or dynamic code execution on user-supplied input.
- No shell injection — never interpolate user data into shell commands or child_process calls.
- Keep secrets in env vars; never hardcode API keys, tokens, or credentials in source files.
- Don't log sensitive values (tokens, passwords, full request bodies with PII).
- Sanitize anything rendered as HTML to prevent XSS — prefer frameworks that escape by default.
- Validate and bound all external input at system boundaries (user input, API responses, file reads).

## Conventions

### Accessibility — Mode-Aware Color Contrast

**Always design for both light and dark modes.** Perci uses CSS custom properties
(`--text-primary`, `--text-secondary`, `--text-tertiary`, `--bg-primary`, etc.) defined
in `src/index.css` under `:root` (light) and `:root.dark` (dark).

Rules:
- **Never hardcode a light or dark color value for text or interactive elements.**
  Always use the theme variables so the color inverts correctly between modes.
- **Never place light text on a light background (or dark on dark).** If you set a
  foreground color, verify it has sufficient contrast against the background in BOTH
  modes. When in doubt, use `var(--text-primary)` for headings/emphasis and
  `var(--text-secondary)` for body text — they are guaranteed readable on `--bg-primary`
  and `--bg-secondary` in both themes.
- **Hover/focus states must also be mode-aware.** A `color: white` hover works in dark
  mode but becomes illegible in light mode. Use `var(--text-primary)` for hover text
  unless the hover background is guaranteed dark (e.g., a solid accent fill).
- **Test in both modes before shipping.** Toggle `:root.dark` in DevTools (or use the
  app's theme switch) and verify every surface you touched.

## Architecture

- **Knowledge graph:** `docs/architecture/graphify-out/` contains a queryable
  graph of the renderer codebase (564 nodes, 37 communities). Use `graphify query`
  to explore structural relationships before diving into source files.
  See `docs/architecture/GRAPHIFY.md` for usage.
- **Electron main process:** The OpenClaw IPC bridge lives in `electron/main.cjs`
  and `electron/preload.cjs` — not indexed by graphify. Read source directly.
- **Dead code:** `main.cjs` (root, not `electron/`) is a legacy orphan — do not
  edit it. It is not loaded by the app.
- **Eidos integration:** Eidos (`~/eidos`) is embedded in Perci as a first-class
  window (`EIDOS_WINDOW_ID`). Perci manages the Docker/OrbStack lifecycle, dashboard
  spawning, and health polling via `eidos:*` IPC handlers in `electron/main.cjs`.
  The Perci version is the leading development target. The standalone Eidos repo
  (`~/eidos`) lags behind — see `~/eidos/CLAUDE.md` for the divergence note.
  Eidos-related changes should be made in this repo, not in `~/eidos`.
- **Wiki (second brain):** `~/wiki/` is a Karpathy-style interlinked markdown wiki
  serving as the project's queryable knowledge base. Contains decision rationale,
  architecture explanations, and cross-linked concepts/entities. Read `SCHEMA.md`
  + `index.md` at session start when project context is needed. All agents (Hermes,
  OpenClaw, Eidos) can access this path for shared knowledge retrieval.
