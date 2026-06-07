# Perci Codebase Graph Analysis — 2026-06-07

## Graph Stats

| Metric | Old (Jun 6) | New (Jun 7) | Delta |
|--------|-------------|-------------|-------|
| Nodes  | 564         | 502         | -62 (dedup + pruning) |
| Edges  | 1066        | 1012        | -54 |
| Communities | 37     | 32          | -5 (consolidation) |

### What changed
- **62 fewer nodes, 37→32 communities**: Graphify re-extracted clean from `src/` only. Previous graph included external/cached nodes from other projects. The consolidation from 37→32 communities reflects cleaner boundaries after the recent refactors.
- **Net -54 edges**: Some dead code paths removed, but the core architecture is denser — the same functionality is more tightly connected.

## Architecture Map (32 Communities)

### Core Runtime
1. **Mission Run Management** (44 nodes) — `appendMissionRunEvent()` is the #1 hub (19 edges). Central event bus connecting every mode (Chat, Code, Cowork, Build) to mission tracking, memory ingestion, and gateway health.
2. **App Layout and Providers** (32 nodes) — `LLMFactory` bridges this to Chat, Search, Cowork, Code. Contains Theme, Mode context providers, terminal bridge, build generation.
3. **Mode Navigation and Context** (7 nodes, cohesion 0.25) — `useMode()` is a cross-community hub bridging 7 communities. Clean switching between Chat/Code/Cowork/Build.

### AI/LLM Layer
4. **LLM Client Integration** (16 nodes, cohesion 0.18) — `clients.js`: Anthropic, Gemini, Groq, Jan, OpenAI, DeepSeek. Clean factory pattern.
5. **Model Capability Service** (10 nodes) — `ModelService` bridges to API key storage. Detects audio/image/video support, fastest-model selection.
6. **Model Routing Logic** (12 nodes, cohesion 0.24) — `chooseModelForTask()`, complexity classification, provider/model picking.
7. **Intelligent Search Tool** (4 nodes) — Tavily client, relative date resolution. Tightly scoped.

### User-Facing Features
8. **Chat and Attachment System** (27 nodes) — ChatMode, ArtifactPanel, attachment preview/formatting. `executeIntegrationTool()` connects chat to the agent tool loop.
9. **Cowork Mode and Routines** (6 nodes) — Routines, triggers, schedule pills, local agent tools.
10. **Code Editor and Permissions** (7 nodes) — CodeMode, editor error boundary, permissions, file save tracking.
11. **Budget and Token Governance** (8 nodes, cohesion 0.27) — Budget prompt builder, iteration tracking, response recording.

### Safety/Security
12. **Console Secret Redaction** (5 nodes, cohesion 0.38) — `installRedactedConsole()`, secret patterns. High cohesion = well-isolated security boundary.
13. **Diff and Intent Review** (7 nodes, cohesion 0.39) — Risk inference, validation, intent parsing. Very cohesive.
14. **API Key and Routine Storage** (16 nodes) — Local key snapshot, clear, provider key management.

### New in Latest Commits (since Jun 6)
- **`AgentsPanel.jsx`** (26 edges) — Largest new component. Job status tracking, agent definitions, model hints, attention/active/completed job state machines. Connects to 4 status constants + 3 agent config objects.
- **`buildGeneration.js`** (5 edges) — Build code generation prompt, file parsing, provider key requirements. Used by BuildMode + BuildCompare.
- **`previewSecurity.js`** (13 edges) — Sandbox iframe generation, CSP headers, budget enforcement, CDN allowlist. Connects BuildMode, BuildCompare, ArtifactPanel, preview-generator.
- **`MissionControl.jsx`** (71 lines new) — UI component for run visualization.

### Uncommitted Changes (in flight)
18 files modified, ~1,374 insertions / 270 deletions:
- Major: `SearchProgress.jsx` (+205 lines), `IntelligentSearchTool.js` (+441/-), `BuildContext.jsx` (+174), `index.css` (+182), `BuildMode.jsx` (+188/-), `ChatMode.jsx` (+94/-)
- These are active development — not yet reflected in the graph. Need `graphify update` after commit.

## Key Insights

1. **Mission Control is the spine.** `appendMissionRunEvent()` (19 edges) touches every mode and feeds memory ingestion. Any change here cascades.
2. **`useMode()` is the router.** 13 edges bridging 7 communities. Mode switches are clean with no import cycles.
3. **`AgentsPanel` is the biggest new surface.** 26 edges — it's where job monitoring, agent status, and model resolution converge. Has the most internal constants (AGENT_DEFINITIONS, AGENT_MODEL_HINTS, etc.) — potential area to extract into a dedicated config module.
4. **No import cycles detected.** Clean dependency graph.
5. **47 isolated nodes** — mostly status constants (ACTIVE_JOB_STATUSES, etc.) that should be consumed by AgentsPanel but may not have direct import edges in the AST.
6. **Low-cohesion communities** (Mission Run Management 0.06, App Layout 0.07, Chat 0.06) are the areas most likely to benefit from further modularization.

## Recommended Next Queries

```bash
# After committing current work:
graphify update docs/architecture/graphify-out

# Explore specific areas:
graphify explain "SearchProgress" --graph docs/architecture/graphify-out/graph.json
graphify explain "IntelligentSearchTool" --graph docs/architecture/graphify-out/graph.json
graphify path "AgentsPanel.jsx" "MissionControl.jsx" --graph docs/architecture/graphify-out/graph.json
```
