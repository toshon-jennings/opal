# Perci Product Upgrade Checklist

Purpose: durable handoff for improving Perci from the local Odysseus and Orbit references.
This file is for any agent continuing the work if chat context is lost.

## Current State

- Primary repo: `/Users/toshonjennings/opal`.
- Odysseus reference repo: `/Users/toshonjennings/odysseus`.
- Orbit reference repo: `/Users/toshonjennings/toshi_bot`.
- Generated Odysseus Graphify graph:
  `docs/architecture/odysseus-graphify/graphify-out/graph.json`.
- Opal renderer Graphify graph:
  `docs/architecture/graphify-out/graph.json`.
- The working tree was already dirty before this checklist was created. Do not revert unrelated changes.
- Repo rule: edit only the main project at `/Users/toshonjennings/opal`, not a worktree.

## Product Direction

Use Orbit as the reference for shell/windowing:

- Persistent window store.
- Window frames with move, resize, minimize, maximize, close.
- Taskbar/task strip for open windows.
- Context menus on taskbar/window items.
- A registry that maps app IDs to surfaces.

Use Odysseus as the reference for rich AI/tool surfaces:

- Deep Research as a real job surface, not just a prompt prefix.
- Polished animated progress states.
- Source counts, elapsed timers, phases, cancellation, retry, and result affordances.
- Dedicated tool panels that feel alive and operational.

Do not blindly port code. Perci is React/Vite/Electron; prefer small React-native adaptations that match the existing codebase.

## Reference Files

Orbit window system:

- `/Users/toshonjennings/toshi_bot/lib/window-manager.ts`
- `/Users/toshonjennings/toshi_bot/app/components/DesktopHost.tsx`
- `/Users/toshonjennings/toshi_bot/app/components/WindowFrame.tsx`
- `/Users/toshonjennings/toshi_bot/app/components/WindowRegistry.tsx`
- `/Users/toshonjennings/toshi_bot/app/components/TaskStrip.tsx`
- `/Users/toshonjennings/toshi_bot/app/components/ContextMenu.tsx`
- `/Users/toshonjennings/toshi_bot/app/globals.css`, starting near `OS SHELL`

Odysseus research/product surfaces:

- `/Users/toshonjennings/odysseus/static/js/research/panel.js`
- `/Users/toshonjennings/odysseus/static/js/research/jobs.js`
- `/Users/toshonjennings/odysseus/static/js/researchSynapse.js`
- `/Users/toshonjennings/odysseus/routes/research_routes.py`
- `/Users/toshonjennings/odysseus/static/js/cookbook.js`
- `/Users/toshonjennings/odysseus/static/js/compare/index.js`
- `/Users/toshonjennings/odysseus/static/js/modalManager.js`
- `/Users/toshonjennings/odysseus/static/js/tileManager.js`

Perci files likely involved first:

- `src/components/ChatMode.jsx`
- `src/components/SearchProgress.jsx`
- `src/components/SearchIndicator.jsx`
- `src/lib/IntelligentSearchTool.js`
- `src/index.css`
- Later shell work: `src/context/ModeContext.jsx`, `src/components/SecondaryModeNav.jsx`, `src/App.jsx`

## Recommended Order

### Phase 1: Deep Research Theater

Goal: make Perci's existing Deep Research feel first-class without changing backend behavior.

- [x] Inspect current Deep Research flow in `src/components/ChatMode.jsx`.
- [x] Inspect `src/lib/IntelligentSearchTool.js` progress payload shape.
- [x] Replace or extend `SearchProgress.jsx` with a richer research run card.
- [x] Show phases: planning/decomposing, searching, reading, synthesizing, complete/error.
- [x] Show elapsed timer while research is active.
- [x] Show current query and accumulated source count.
- [x] Add subtle animated source nodes or phase timeline using existing `framer-motion`.
- [x] Preserve existing normal web-search display.
- [x] Preserve artifact creation behavior for completed research papers.
- [x] Decouple Deep Research from Tavily so it can run as model-only research when no live web provider is configured.
- [x] Add provider-native live web search for OpenAI and Anthropic when their API keys are configured.
- [x] Add local-model-compatible no-key web search through the Electron desktop bridge.
- [x] Prevent unconfigured GitHub integration tools from intercepting ordinary search questions.
- [x] Auto-route obvious current/historical lookup questions into web search.
- [x] Surface web-search failures instead of silently falling through to a tool-less model answer.
- [x] Resolve relative dates like `today` before web search and instruct the model to answer only from search context.
- [x] Route `this day in history` / `on this day` prompts to Wikimedia's no-key on-this-day feed before generic search.
- [ ] Verify live visual behavior in the app with an actual or simulated Deep Research run.
- [ ] Ensure reduced-motion CSS remains acceptable.
- [x] Run `npm run build`.

Completion criteria:

- A user who clicks Deep Research sees an obvious live research experience.
- The experience is visibly better than the current plain search progress.
- No new provider/backend dependency is introduced.
- Tavily remains optional; lack of Tavily must not block Deep Research.
- Web search should not silently fall through to a tool-less model when no live web provider is available.
- Local models in the desktop app should still have a no-key search path.

### Phase 2: Orbit-Style Window Foundation

Goal: create Perci's shell foundation before porting more tool surfaces.

- [ ] Add a small React window store patterned after Orbit's `window-manager.ts`.
- [ ] Add a shared `ContextMenu` component.
- [ ] Add `WindowFrame` with move, resize, minimize, maximize, close.
- [ ] Add `TaskStrip` showing open windows.
- [ ] Add a simple registry for app/window IDs.
- [ ] Start with one low-risk surface, probably Artifacts or a Mission detail window.
- [ ] Do not convert every Perci mode at once.
- [ ] Run `npm run build`.

Completion criteria:

- Opening one registered surface creates a window.
- Window state survives focus/minimize/maximize/close interactions.
- Task strip reflects open/minimized windows.
- Context menu supports focus, minimize/restore, maximize/restore, close.

### Phase 3: Convert Product Surfaces

Goal: make Perci feel like a coherent desktop AI workspace.

- [ ] Convert Research results into a registered window.
- [ ] Convert Artifact detail/preview into a registered window if it fits.
- [ ] Add context menus to Agents jobs or Mission run rows where useful.
- [ ] Consider a Compare surface inspired by Odysseus after the window foundation exists.
- [ ] Keep Build untouched unless the user explicitly asks.

## Deferred / Do Not Do Tonight

- Do not port Odysseus email yet. It is a full IMAP/SMTP/account/security surface.
- Do not port Odysseus Cookbook wholesale. Its model serving, GPU, remote host, and task tracking scope is large.
- Do not replace Perci's navigation model in one pass.
- Do not add Google/Gmail/Calendar UI unless the user explicitly reopens that scope.
- Do not treat Tavily as the only acceptable live-web provider; add provider-native search adapters instead.
- Do not edit root `main.cjs`; AGENTS says it is a legacy orphan.

## Validation Notes

- Minimum validation for UI-only changes: `npm run build`.
- If Electron main/preload changes are made, also run:
  - `node -c electron/main.cjs`
  - `node -c electron/preload.cjs`
- If running Perci dev server, use main project only.
- If an IPC change appears not to work, fully restart Perci; renderer refresh is not enough for Electron main-process handler changes.

## Latest Working Conclusion

Best immediate slice: build "Deep Research Theater" first.

Reason: Perci already has a Deep Research core loop and `framer-motion`, so a visible upgrade can land quickly. The Orbit-style window system is strategically important, but it should come after the first visible win so the project has momentum and a clearer shell target.

## 2026-06-07 Update

Implemented first Deep Research Theater pass:

- `src/components/ChatMode.jsx` now tracks `searchMode` (`web` or `research`) and passes it to `SearchProgress`.
- Deep Research progress now seeds a planning step, preserves the current query, and records richer phase/search events.
- `src/components/SearchProgress.jsx` keeps the existing compact web-search display for normal searches.
- `src/components/SearchProgress.jsx` now renders a dedicated Deep Research card for research mode, with phase tiles, elapsed timer, query, source/query/output metrics, and a collapsible recent-events list.
- `npm run build` passed.

Follow-up decoupling:

- `src/components/ChatMode.jsx` now lets `Deep Research:` run without `apiKeys.tavily`.
- The Deep Research sparkle button only toggles web search on when Tavily is configured.
- `src/lib/IntelligentSearchTool.js` now has a model-only Deep Research path for Ollama, LM Studio, Jan, and API-key-backed hosted providers.
- Live web search still uses the existing Tavily client; provider-native search adapters are the next architectural improvement.
- `npm run build` passed after the decoupling.

Native search follow-up:

- `src/lib/IntelligentSearchTool.js` now uses OpenAI Responses API web search when OpenAI is the selected provider and no Tavily key is configured.
- `src/lib/IntelligentSearchTool.js` now uses Anthropic's hosted web search tool when Anthropic is the selected provider and no Tavily key is configured.
- `src/components/ChatMode.jsx` now treats OpenAI/Anthropic API keys as live-web capable for the search toggle.
- If the web-search toggle is on but neither Tavily nor a supported provider-native search path is configured, Perci now returns an explicit configuration message instead of sending the prompt to a tool-less model.
- `npm run build` passed after native OpenAI/Anthropic search wiring.

Local search follow-up:

- `electron/main.cjs` now exposes a bounded `web-search` IPC handler that fetches DuckDuckGo's no-key HTML results and returns normalized sources.
- `electron/preload.cjs` exposes `window.electron.webSearch`.
- `src/lib/IntelligentSearchTool.js` now uses the desktop search bridge when Tavily/provider-native search is unavailable.
- `src/components/ChatMode.jsx` now counts the desktop bridge as live-web capable, so Ollama/LM Studio/Jan can use web search inside the Electron app.
- Because this touches Electron main/preload, restart the desktop dev app before testing; renderer HMR is not enough.
- `node -c electron/main.cjs`, `node -c electron/preload.cjs`, and `npm run build` passed.

Tool-routing fix:

- A local-model test for `What happened on this day in history today?` returned `GitHub token is not configured in Settings.`
- Root cause: GitHub integration tool schemas were still offered to the model even when no GitHub token was configured.
- `src/lib/integrationTools.js` now filters integration tools by configured API keys when keys are passed.
- `src/components/ChatMode.jsx`, `src/components/CodeMode.jsx`, and `src/components/CoworkMode.jsx` now pass `apiKeys` into `getIntegrationTools`.
- `node -c electron/main.cjs` and `npm run build` passed after this fix.

Search routing fix:

- A follow-up local-model test returned an apology about no real-time or historical-data access.
- Root cause: Chat still only entered the search branch when the web-search toggle was on, and search failures were caught with `console.error` before falling through to the model.
- `src/components/ChatMode.jsx` now auto-routes obvious current/historical lookup questions, including `today`, `on this day`, `this day in history`, and `what happened`, into web search.
- Search failures now stop the turn and show `Web search failed before the model answered: ...` instead of letting the model answer without context.
- `node -c electron/main.cjs`, `node -c electron/preload.cjs`, and `npm run build` passed after this fix.

Date/citation fix:

- A follow-up local-model answer used January 25 for a `today` history query and included uncited, incorrect event/date pairings.
- Root cause: `fallbackReformulation()` replaced `today` with `latest`, losing the exact calendar date before search; the final prompt also did not strongly forbid answering from memory when search context was weak.
- `src/lib/IntelligentSearchTool.js` now resolves relative date queries before every provider search. For `this day in history` / `on this day`, it appends the current month/day to the search query.
- `src/components/ChatMode.jsx` now adds the current local date to the search-context prompt and tells the model to treat web-search context as source of truth, cite sources inline, and avoid answering from memory if context is missing or mismatched.
- `node -c electron/main.cjs`, `node -c electron/preload.cjs`, and `npm run build` passed after this fix.

Dedicated history-source fix:

- A follow-up answer for June 6 only found holidays (`National Day of Sweden`, `Queensland Day`) from generic search results.
- Root cause: DuckDuckGo HTML search is too generic for "this day in history" and can rank date/holiday pages above event feeds.
- `electron/main.cjs` now detects `this day in history`, `on this day`, and `historical events` queries and uses Wikimedia's no-key `/onthisday/events/{month}/{day}` feed first.
- Generic DuckDuckGo HTML search remains the fallback for other local no-key searches, and also if the Wikimedia feed fails.
- `node -c electron/main.cjs`, `node -c electron/preload.cjs`, and `npm run build` passed after this fix.

Next best continuation:

- Add Gemini Google Search grounding as the next provider-native search adapter.
- Restart Perci desktop dev app and verify local-model web search with: `What happened on this day in history today?`
- Run Perci locally and visually verify the Deep Research progress card during a local-model live-web run and, if available, a hosted-provider native-search run.
- Polish any cramped mobile layout or theme contrast issues found in the live UI.
- Then begin the Orbit-style window foundation.
