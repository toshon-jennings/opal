# Perci — Claude Code guide

Perci is an Electron + React 18 AI workspace. Every surface is a window on an
always-mounted desktop; the Dock opens them.

## Read first, in this order

1. **`SUMMARY.md`** — source map, architectural patterns, gotchas, and what not
   to touch. Read it instead of scanning the repo.
2. **`AGENTS.md`** — repo rules: this codebase is a fork, security constraints,
   mode-aware colour contrast, and the embedded-app integrations (Eidos,
   KeySafe, Apfel, the wiki).
3. **`HANDOFF.md`** — what the last session did and what is still open. Keep it
   updated as you work, and before you finish.

Global rules in `~/.config/agent-rules/GLOBAL.md` apply on top of all of these.
Everything above is authoritative — don't restate any of it here.

## Commands

```bash
npm run dev            # Vite dev server on :5173
npm run electron:dev   # Vite + Electron together — needed for any <webview> surface
npm run build          # must pass before you call a change done
npm test               # vitest, 14 suites under test/
npm run lint           # see the warning below — it is not what it looks like
```

## Verifying a change

- **Lint the files you touched, by name** — `npx eslint src/components/Foo.jsx`.
  They should come back completely clean; treat anything they report as yours
  to fix. The repo-wide `npm run lint` still has a backlog being worked down,
  so its exit code is not yet a signal.
- Two rules are configured off or narrowed in `.eslintrc.cjs` on purpose:
  `react/react-in-jsx-scope` (obsolete under the React 17+ automatic JSX
  transform) and `react/no-unknown-property`, which is given the Electron
  `<webview>` attributes and disabled outright for the two react-three-fiber
  scenes. Don't re-enable them to chase a warning.
- **`<webview>` surfaces cannot run in the Vite dev server.** Klipit/Localhost,
  G-Dash, GitHub Overview, Open Notebook, IPTV and friends render nothing at
  `localhost:5173` — `<webview>` exists only in Electron. Verify them with
  `npm run electron:dev`, or check layout and CSS in isolation and say that's
  what you did.
- Prefer verifying in both light and dark. Perci ships both, and `AGENTS.md`
  treats contrast as a hard requirement rather than a nicety.

## Slash commands

- **`/create-spec <project-directory>`** — interviews the user and generates an
  AutoForge app spec (`app_spec.txt`, `initializer_prompt.md`) into
  `<project-directory>/.autoforge/prompts/`. It is a command, not repo
  guidance; it used to live in this file, which made every session open as a
  spec-writing assistant.
