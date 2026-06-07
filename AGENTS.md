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

- (Add repo-specific conventions here as they come up.)

## Architecture

- **Knowledge graph:** `docs/architecture/graphify-out/` contains a queryable
  graph of the renderer codebase (564 nodes, 37 communities). Use `graphify query`
  to explore structural relationships before diving into source files.
  See `docs/architecture/GRAPHIFY.md` for usage.
- **Electron main process:** The OpenClaw IPC bridge lives in `electron/main.cjs`
  and `electron/preload.cjs` — not indexed by graphify. Read source directly.
- **Dead code:** `main.cjs` (root, not `electron/`) is a legacy orphan — do not
  edit it. It is not loaded by the app.
