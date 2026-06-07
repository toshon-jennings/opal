# Graphify — Codebase Knowledge Graph

## What This Is

A queryable knowledge graph of the Perci (Perci) renderer codebase, built with
[graphify](https://github.com/anthropics/graphify). It maps files, functions,
imports, and calls into a graph database you can query with natural language.

## Output Location

```
docs/architecture/graphify-out/
├── graph.json          # Full graph data — query with `graphify query`
├── graph.html          # Interactive visual graph (open in browser)
├── GRAPH_REPORT.md     # Auto-generated report: hubs, communities, gaps
└── manifest.json       # Per-file AST/semantic hashes for incremental updates
```

## How to Query

```bash
# From the repo root — uses the OpenRouter provider configured in ~/.graphify/providers.json
export OPENAI_API_KEY="your-openrouter-key"
export GRAPHIFY_OPENAI_MODEL="deepseek/deepseek-chat"

# Natural-language query
graphify query "how does the OpenClaw integration connect to Mission Control?" \
  --graph docs/architecture/graphify-out/graph.json

# Path finding between two symbols
graphify path "App.jsx" "MissionControl.jsx" \
  --graph docs/architecture/graphify-out/graph.json

# Explain a specific symbol (connections, community, callers)
graphify explain "appendMissionRunEvent()" \
  --graph docs/architecture/graphify-out/graph.json
```

## How to Update

```bash
# Incremental update — only re-extracts changed files (SHA256 cache)
graphify update docs/architecture/graphify-out

# Full re-extract (e.g. after major refactors)
graphify extract . --out docs/architecture/graphify-out --backend openrouter
graphify cluster-only docs/architecture/graphify-out
```

## What's Indexed

- `src/` — all `.jsx`, `.js`, `.ts`, `.tsx` files (564 nodes, 1066 edges, 37 communities)
- **Not indexed:** `electron/` (`.cjs` files — graphify's AST parser skips CommonJS)

For the Electron main process (`electron/main.cjs`, `electron/preload.cjs`),
read the source directly. That's where the OpenClaw IPC bridge lives.

## Key Findings (2026-06-06)

- `appendMissionRunEvent()` is the #1 most-connected function (19 edges) — the
  central event bus for all mission runs including gateway health checks
- `useMode()` is a cross-community hub (13 edges, bridges 7 communities)
- `getIntegrationTools()` connects ChatMode, CodeMode, CoworkMode, and the agent
  tool loop
- The OpenClaw integration is **monitoring + config + diary** — not an agent
  bridge. No session bridging, no WebSocket subscription, no shared tool surface.
  See the full audit in the workspace memory.

## Provider Config

Uses OpenRouter via `~/.graphify/providers.json`:
- Backend: `openrouter`
- Model: `deepseek/deepseek-chat`
- Env key: `OPENAI_API_KEY` (set to your OpenRouter key)
