# Perci Codebase Graph Analysis — 2026-06-07 (Updated)

## Graph Stats

| Metric | Previous | Current | Delta |
|--------|----------|---------|-------|
| Nodes  | 502      | 514     | +12 |
| Edges  | 1012     | 1047    | +35 |
| Communities | 32  | 31      | -1 (consolidation) |
| Source files | 65   | 68      | +3 |

### What changed since last graph
- **+12 nodes, +35 edges**: New window/dock system (`65c32f6`) and Odysseus motion pass (`fa63cc0`) added UI infrastructure. CoworkMode fix (`06afe83`) added session lifecycle tracking.
- **32→31 communities**: Consolidation — "Session Lifecycle Tracking" absorbed into "Code and Cowork Modes". Cleaner boundaries.
- **65→68 source files**: 3 new files added to `src/`.

## Architecture Map (31 Communities)

### Core Runtime
1. **Mission Event Logging** — `appendMissionRunEvent()` still #1 hub (19 edges). Central event bus.
2. **App Core and Providers** — `useMode()` grew to 17 edges (was 13), now the #2 hub. Window/dock system connects here.
3. **UI Navigation and Settings** (37 nodes, cohesion 0.06) — Largest community. Mode switcher, settings modal, API key nav, routines.

### AI/LLM Layer
4. **LLM Provider Clients** — Factory pattern: Anthropic, Gemini, Groq, Jan, OpenAI, DeepSeek.
5. **Model Capabilities Service** — `ModelService` (14 edges). Audio/image/video detection.
6. **Intelligent Search Tool** — Tavily client, intent classification, relevance scoring.

### User-Facing Features
7. **Chat and Attachments** — ChatMode, ArtifactPanel, attachment system.
8. **Code and Cowork Modes** (31 nodes) — CodeMode, CoworkMode, connectors, schedules, permissions.
9. **Mission Execution UI** — MissionControl component, run visualization.
10. **Search Progress UI** — ResearchProgress, formatElapsed, RESEARCH_PHASES.

### Safety/Security
11. **Artifact Preview Security** — Sandbox iframe, CSP, budget enforcement.
12. **Diff and Intent Review** — Risk inference, validation, intent parsing.
13. **Mode Error Handling** — Error boundaries per mode.

### New/Notable Communities
- **Session Lifecycle Tracking** — New from CoworkMode fix. Job navigation without cancellation.
- **Mission Transit Mapping** — Transit map for mission state transitions.
- **Mission Validation Logic** — Validation rules for mission runs.

## Key Insights

1. **`appendMissionRunEvent()` remains the spine** (19 edges). Unchanged — the event bus is stable.
2. **`useMode()` jumped from 13→17 edges**. The window/dock system added connections. It's now the primary UI routing hub.
3. **Zero import cycles.** Still clean after 3 new commits.
4. **Lowest-cohesion communities**: UI Navigation (0.06), Code and Cowork (0.06). These are the broadest surfaces — expect them to grow.
5. **Community labeling is now working** — all 31 communities have meaningful names (previous run had a JSON parse error in labeling).

## Comparison: Previous vs Current

| Aspect | Previous | Current |
|--------|----------|---------|
| Top hub | `appendMissionRunEvent()` (19) | `appendMissionRunEvent()` (19) — unchanged |
| #2 hub | `useChat()` (14) | `useMode()` (17) — grew |
| Largest community | Mission Run Management (44) | UI Navigation and Settings (37) |
| Import cycles | 0 | 0 |
| Unlabeled communities | 0 (after fix) | 0 |
