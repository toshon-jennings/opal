# AGENTS.md — Klippit

> Agent rules and operating procedures for the Klippit project.
> Read this before making any changes.

## Project Context

Klippit is a cross-platform (Chrome/Firefox) browser extension for capturing,
annotating, and organizing screenshots and web clippings. Built with vanilla
JS, HTML, and CSS — no bundler. Minimalist design.

- **Local path:** `/Users/toshonjennings/klippit`
- **Repo:** `github.com/toshon-jennings/klipit`

## Features

- Capture screen regions / full pages
- Annotate (arrows, text, highlights)
- Organize into collections with graph-based connections
- Copy to clipboard
- Save to file
- Import / export JSON backups

## Core Stack
- **Extension:** Vanilla JS, HTML, CSS (no bundler, no framework)
- **Storage:** Browser Extension Storage API (`klippit:items`, `klippit:connections`, `klippit:schema`)
- **Build:** `build.sh` packages `src/` into `dist/chrome` and `dist/firefox`
- **Icons:** SVG master in `assets/klippit-mark.svg`, exported to `icons/`

## Internal Identifiers (do not change without migration plan)
- Storage keys: `klippit:items`, `klippit:connections`, `klippit:schema`
- Global: `globalThis.klippitStorage`
- Firefox extension id: `klippit@toshon.tech`
- Message types: `klippit:capture-active-tab`, `klippit:get-active-tab`, `klippit:open-url`, `klippit:item-saved`

## Design Gate

Before writing any new feature code or making non-trivial changes, state what you're
planning to build and wait for explicit approval. Do not start implementation until
confirmed.

## Git Workflow
- Treat `origin/main` as source of truth.
- Work on `main` directly unless explicitly asked for a branch.
- Sync local `main` from `origin/main` before editing or pushing.
