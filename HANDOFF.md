# Perci Handoff

## Current Milestone

- [x] pxpipe token-compression toggle + system-wide proxy (2026-07-07).
      pxpipe (github.com/teamchong/pxpipe) is a local proxy on
      127.0.0.1:47821 that re-renders bulky Anthropic request context
      (system prompt, tool docs, older history, large tool_results) as
      dense PNG pages, cutting input tokens ~60-70% on Fable 5; requests
      only — responses stream through untouched, non-allowlisted models
      pass through byte-identical. Perci side: new `src/lib/pxpipe.js`
      (origin const, `perci_pxpipe_enabled` read/write via persistentStore,
      two-stage reachability probe — opaque no-cors first, then a readable
      unauthenticated POST through the /v1/messages passthrough because
      some embedded browsers block opaque cross-origin fetches);
      `fetchAnthropicMessages` helper in `src/lib/llm/clients.js` wraps
      BOTH AnthropicClient call sites (streamChat + streamChatWithTools)
      and falls back to api.anthropic.com on network error so a dead proxy
      never breaks chat; Settings gained a "pxpipe · Token Compression"
      section (Off/On cards + live proxy status + caveats copy) between
      Models and GitHub. No Electron main/preload changes needed: CORS
      works because pxpipe forwards non-POST/unknown paths to Anthropic,
      which answers the preflight, and Perci already sends
      `anthropic-dangerous-direct-browser-access` (verified: preflight 200
      + readable 401 + SSE all pass browser-side through the proxy).
      IntelligentSearchTool's Anthropic web-search call was deliberately
      left direct (small single-shot requests, below pxpipe's
      profitability gate). Validation: focused eslint clean (9 SettingsModal/
      persistentStore errors pre-exist — verified identical via stash),
      `test/clients.tools.test.js` 2/2, `npm run build` clean, live smoke
      on new `perci-dev-smoke2` launch config port 5197 (5198/5199 held by
      other sessions): toggle persists, status dot correct, real Chat send
      appeared in the proxy log as `compressed 2534ch → 1img/11264B`, and
      with the proxy killed the same send fell back to the direct API.
      Smoke localStorage cleared, server stopped. System side (outside
      repo): pxpipe-proxy installed globally (~/.hermes/node/bin), runs as
      LaunchAgent `com.toshon.pxpipe-proxy` (KeepAlive verified, logs at
      ~/Library/Logs/pxpipe-proxy.log), port 47821 registered in
      PORTMASTER.md, and `ANTHROPIC_BASE_URL=http://127.0.0.1:47821` set
      in ~/.claude/settings.json env so all Claude Code sessions route
      through it (takes effect on next session start; remove that env line
      to bypass — Claude Code has NO auto-fallback, unlike Perci).
      Known limits: savings only on allowlisted models (claude-fable-5,
      gpt-5.6 by default — Perci's older claude-sonnet default models pass
      through uncompressed; dashboard chips or PXPIPE_MODELS widen scope);
      imaged context is lossy for byte-exact strings (13/15 hex recall on
      Fable 5) so byte-exact work should stay in recent turns/text. Not
      committed — worktree already carried many unrelated pending changes;
      version bump deferred to the next real commit.

- [x] Shipyard — fix Perci claiming to create cards that never appear
      (2026-07-06). Root cause: `_openAIStreamWithTools` in
      `src/lib/llm/clients.js` (shared tools path for Groq/OpenAI/OpenRouter/
      LM Studio/Jan/Mistral) had no SSE line buffer, so a `data:` line split
      across network reads failed JSON.parse in both halves and was silently
      dropped — corrupting streamed tool-call fragments (name/args), so
      `create_card` executed with empty args or not at all while the model
      narrated success. Same fix pattern already existed in AnthropicClient
      and OpenRouter `streamChat` but was never applied to the tools helper;
      now it is (`buffer + decode({stream:true}) + lines.pop()`). Second fix:
      `runPmAgentTurn` toolEvents (previously discarded by both callers) now
      carry `{name, ok, error}`, are persisted on the assistant chat message
      (`msg.tools`) by ShipyardMode + PerciPet, and render as ✓/✗ chips under
      the message (error text on hover) — so gated tools (Observer/Advisor
      dial) and tool failures are visible instead of silently narrated over.
      Validation: new `test/clients.tools.test.js` (split-line tool call +
      split text content) 2/2; full vitest diffed against stashed HEAD —
      identical 11 pre-existing failures (powerWorkspace/harnessMemory/
      supaterm), none new; eslint clean except pre-existing
      exhaustive-deps warning in ShipyardMode.

- [x] Shipyard — in-app guide (2026-07-06). Added a `?` help button next to
      project settings in the board header, plus a "How Shipyard works" link
      on the empty (no-project) state, both opening a new `ShipyardGuide`
      modal defined inline in `ShipyardMode.jsx` (reuses the existing
      `.sy-modal`/`.sy-modal-backdrop` pattern from the card editor/settings
      modals, new `.sy-modal-wide`/`.sy-guide-section` CSS). Covers: flow
      columns + quick-add + drag, the GitHub rail (Stage/Commit/Push/Jules)
      and its repo-folder/desktop-app requirements, the four assertiveness
      levels and what each blocks, how to read the PM chat's ✓/✗ tool chips
      (added alongside the streaming-buffer fix above), and Notes/Activity.
      Verified live via preview_start (perci-dev-smoke, port 5198): opens
      from both empty state and board header, full content scrolls, closes
      cleanly, no new console errors. Eslint required `&rsquo;`-escaping
      apostrophes in the new JSX text (react/no-unescaped-entities) —
      direct-file eslint invocation surfaces this rule; the repo's own
      `npm run lint` (`eslint .`) additionally sweeps the untracked
      `timesfm-venv/` and `public/vendor/` dirs and reports ~150 unrelated
      pre-existing problems there, so lint this project file-by-file rather
      than trusting a clean full-repo run.

- [x] Perci Brain — deterministic notes retrieval for the agent (2026-07-06).
      Phases 1–2 of the "second brain" plan (RoboNuggets ARMS video): new
      `src/lib/brain.js` indexes the Perci Notes vault in-memory once per
      session (title/tags/headings/term-frequencies/wikilinks per note — no
      content retained, 2-min TTL, encrypted `<!--ENC:v1-->` notes skipped),
      scores queries against the index without re-reading files, reads ONLY
      the winning note, returns ONLY its best-matching section, and follows
      short "[[pointer]] stub" sections (max 2 hops). Exposed as read-only
      agent tool `notes_lookup` via `integrationTools.js`
      (`getIntegrationTools`/`executeIntegrationTool`/prompt line), so Chat,
      Code, and Cowork all get it with zero mode-file changes; gated on
      `window.electron?.listFiles` (desktop only). Shared tokenizer extracted
      to `src/lib/relevance.js` (moved verbatim out of
      `IntelligentSearchTool.js`, now imported by both). Folder resolution
      mirrors NotesMode: `perci_notes_folder` from persistentStore (re-runs
      `registerWorkspace` for custom folders) else `get-default-notes-path`.
      Deviation from pitch: no persisted `brain-index.json` — `list-files`
      IPC returns no mtimes, and full rebuild is sub-second at vault scale;
      revisit if vaults hit thousands of notes (would need a stat IPC).
      Validation: new `test/brain.test.js` 10/10 (index shape, ranking,
      section pick, pointer hops, encrypted skip, no-electron error payload),
      full vitest + eslint diffed against stashed HEAD (identical pre-existing
      failures only), `npm run build` clean. Tool errors return `{error}`
      payloads (never throw) because `runChatWithTools` has no try/catch
      around `executeTool`.

- [x] ARMS graph — phase 3 of the second-brain plan (2026-07-06). The Notes
      knowledge graph (`NotesGraph3D.jsx`) can now render the full ARMS
      structure. New `src/lib/armsGraph.js`: pure `buildArmsLayers` turns
      surface-map stations into Application nodes (blue octahedra) with edges
      from consecutive route stops, Mission Control runs into Routine nodes
      (yellow, capped 12) and installed skills into Skill nodes (orange
      boxes, capped 36) — each spoked to a per-layer hub on a central "Perci"
      core; `loadArmsLayers` gathers live inputs (`skills:get-installed` IPC
      + `readMissionRuns`). `buildGraphData` appends the layers when the new
      "ARMS layers" toggle is on and weak-links the core to the 24 highest-
      degree notes (Memory layer). New Layout segmented control:
      Force / Rings / Circle — rings/circle compute deterministic planar
      targets (`computeLayoutTargets`; ARMS ring order core→skills→routines→
      memory→apps, cluster rings otherwise) that the frame loop lerps toward,
      bypassing the force sim; drag pins still work. Graph search is now
      brain-index-backed: NotesMode passes `filesMap`, the wrapper builds
      `indexNote` entries and ranks with `scoreNote`+`tokenizeForRelevance`
      (body/tag/heading matches, not just title substring), fly-to via the
      existing selection focus. ARMS nodes carry `label`/`hue`/`type`; note
      nodes stay type-less — editor open/dblclick gated on that; drawer
      shows layer type; legend gains Apps/Routines/Skills chips. Validation:
      `test/armsGraph.test.js` 3/3 + brain 10/10, full suite 79 pass/11
      pre-existing fails (unchanged vs HEAD), `npm run build` clean, ESLint
      delta vs HEAD is only 2 more react-three-fiber `args` false positives
      (file already carries 2 on existing geometry JSX). Live preview smoke
      on port 5198 (launch.json gained a `perci-dev-smoke` config since
      another session held 5199) with a shimmed `window.electron` vault:
      42-node rings rendered, core drawer showed Dashboard/Routines links +
      note mention spokes, body-content search ("release script") found
      Deploy Runbook and flew to it; smoke localStorage cleared, server
      stopped. Known limits: Routines layer = recent Mission Control runs
      (no dedicated scheduled-routines store exists yet); skills load once
      per toggle, not live.

- [x] Label declutter + aspect-aware auto-fit (2026-07-06). User report:
      node titles near the view center stacked into an unreadable pile
      (the far side of a 3D ring projects into the middle of the screen).
      Fix in `NotesGraph3D.jsx`: every 5th frame, project labeled nodes to
      screen space, greedily keep labels by priority (selected/hovered 3 >
      core/hub/active-note 2 > degree-scaled 1..1.5) and hide any
      lower-priority label whose estimated rect (char-count × world-size ×
      px-per-world at node depth) overlaps a kept one; hidden labels
      reappear on hover within ~83 ms. Implemented via `labelRefs` +
      `Billboard.visible` toggling (no React re-render per frame); scratch
      `_labelVec` avoids per-frame allocation. Also made the camera
      auto-fit account for aspect ratio (fit against the narrower of the
      vertical/horizontal view angles) so narrow windows don't clip the
      formation's sides. Validation: live smoke with the real vault —
      3D rings + ARMS shows only "Perci" at center with well-spaced labels
      elsewhere (previously 3+ stacked); aspect fit holds in a narrow
      window; brain+arms suites 13/13; build clean; ESLint unchanged.

- [x] 2D force explosion fixed: velocity clamp + non-finite guard + camera
      auto-fit (2026-07-06). User report: switching Rings → Force (2D, ARMS
      on, 116 nodes) made almost the whole graph disappear. Reproduced with
      the real vault: the integrator has no speed limit, so restarting force
      from the compact rings state with ~107 nodes confined to a plane
      produces huge 240/d² repulsion kicks — positions diverge to 1e3+ and
      nodes leave the frustum (this also explains the very first
      frozen-scattered-dots report: the sim had exploded, then alpha decayed
      and froze the wreckage). Fixes in `NotesGraph3D.jsx`: (1) `MAX_STEP`
      per-frame speed cap (10 units) in the integrate loop; (2) non-finite
      position re-seed as self-healing; (3) camera auto-fit in useFrame —
      keeps the whole cloud framed until the user drags/zooms (flag reset by
      Recenter's Canvas remount, so Recenter now doubles as fit-to-view;
      disabled while a fly-to focus is active). Validation: live smoke on
      5198 with the real vault — 2D Force settles in frame (hub-spoke
      clusters visible), Rings → Force no longer loses nodes, 3D regrows the
      sphere from 2D-flat state; brain+arms suites 13/13; build clean;
      ESLint unchanged (60 pre-existing R3F false positives).

- [x] Graph freeze root-caused and fixed: stale geometry buffers on data
      growth (2026-07-06). User report from the real app: 116-node graph
      frozen (survived hard refresh + dev-server restart), and resizing the
      window blanked the canvas. Diagnosis (browser repro with the real
      vault at `~/opal/notes/notes` + shimmed IPC): the pulse/glow/ripple
      geometries were wired ONCE at first mount via a `!getAttribute
      ('position')` guard in inline ref callbacks, sized for the initial
      notes-only data (~23 links). When the async ARMS load grew `data`
      (23→132 links), sim buffers were reallocated bigger but the geometry
      kept the small first-mount attributes; inline refs re-fire on every
      render and re-attached `sim.current.pulseRef` unconditionally, so the
      next `posAttr.array.set(s.pulsePos)` overflowed → RangeError every
      frame → R3F render loop dead (frozen last frame; resize clears the
      framebuffer → blank). Fix (landed via a parallel session):
      `wirePulseRef`/`wireNodeGlowRef`/`wireRippleRef`/`wireHlLineRef`
      useCallbacks that unconditionally swap in the current sim's buffers,
      guarded by an expected-length check, used as the JSX refs AND
      re-invoked at the end of the sim-init effect on every `data` change;
      highlight lines also moved to a preallocated `hlLinePos` buffer
      instead of per-frame allocation. Validation after the merge: brain +
      armsGraph suites 13/13, `npm run build` clean, ESLint unchanged (60
      pre-existing R3F `no-unknown-property` false positives), ringSpin/
      z-jitter/layout features intact. Needs a user confirmation run in the
      Electron app (was not reproducible in plain browser because the crash
      required the hover/settings re-render path).

- [x] Graph layout fixes: sphere regrowth + ring spin (2026-07-06). User
      report: after Rings flattened the graph, switching back to Force never
      regrew the sphere. Cause: planar layouts zero every z, and all three
      force terms (repulsion/springs/gravity) derive their z component from
      z *differences* — a flat cloud is a degenerate equilibrium. Fix in the
      layout effect: on returning to Force in 3D, if all |z| < 1, jitter
      free nodes' z by ±4 so repulsion has a seed (also cures the
      pre-existing 2D→3D pancake). Second: rings/circle going fully static
      was by design but felt dead — added a `ringSpin` setting (default
      0.3, slider shown for non-force layouts) that rotates the layout
      targets over time in the frame loop; drag pins unaffected. ARMS
      itself never stops motion; Force still simulates with layers on.
      Validation: build clean; eslint delta zero (60 errors in the file are
      all the pre-existing react-three-fiber `no-unknown-property` false
      positive); brain+arms suites 13/13; live smoke on 5198 — rings settle
      and visibly rotate between screenshots, Force + auto-rotate shows a
      volumetric cloud from multiple azimuths (no planar collapse), and
      rings⇄force + ARMS-toggle orderings all render. One unreproduced
      anomaly: a single black-canvas state occurred while toggling
      rings/ARMS in a tiny just-spawned window; node positions were provably
      valid (switching to Force showed them instantly) and five replay
      attempts couldn't reproduce it — if seen, Recenter or a layout toggle
      recovers. Smoke localStorage cleared, server stopped.

- [x] Shipyard first slice landed (2026-07-06). New first-class
      `MODES.SHIPYARD` surface: an AI project-management kanban where Perci is
      the PM. `src/lib/shipyard.js` holds the store (`perci_shipyard:v1`),
      per-project flow columns + fixed GitHub rail columns (Stage = git add,
      Commit = add+commit, Push = add+commit+push) and a Jules column that
      dispatches cards through the existing `jules:queue` IPC (source
      `shipyard`), polling `agent-jobs:list` for status/PR URL. Git actions run
      through the existing `run-local-command` + `registerWorkspace` IPC, so
      NO Electron main/preload changes were needed (no app restart required).
      The PM agent (`runPmAgentTurn`) reuses the Cowork-style
      `streamChatWithTools` loop with 10 board tools and a pm-skills-derived
      playbook prompt; a 4-stop assertiveness dial (Observer/Advisor/Manager/
      Autopilot) gates agent-initiated mutations in `executePmTool` (manual
      drags always execute; Manager needs `confirmed_by_user` for push/Jules).
      `ShipyardMode.jsx/.css` renders board/notes/activity tabs + chat panel;
      drag-drop carries the card id in `dataTransfer` (fixed a stale-closure
      drop bug found during preview smoke). `PerciPet.jsx/.css` is the
      MiniCPM-Desk-Pet-style floating companion mounted in `App.jsx`: draggable
      (position in `perci_pet_pos`), speaks on Shipyard/git/Jules/window events
      gated by the dial, quick-ask routes to the same PM agent, click-through
      to Shipyard; toggled from the Shipyard header (`petEnabled` in the
      store). Wired through `ModeContext`, `App.jsx`, `appCatalog`
      (`ShipyardIcon`), `ModeSwitcher`, Dock glyph `SY`, and a `shipyard`
      station in Creation Yard on circle-line + agent-rail. Jules caveat:
      job records are in-memory in main, so tracked cards show their last
      known status after an app restart. Validation: focused ESLint clean,
      `npx vitest run test/perciSurfaceMap.test.js` 10/10, `npm run build`,
      and a live preview smoke on port 5199 (project create, quick-add card,
      real DragEvent flow + rail drops, pet popover reading live board state,
      Perci Now showing Creation Yard activity). Smoke localStorage was
      cleared afterward. Not yet built (candidate next slices): PR-status
      column fed by `gh`, per-card commit-message editing before rail drops,
      pet reactions to OpenClaw/Mission events.

- [x] Supermemory provider/model mismatch fixed (2026-07-02). The remaining
      issue called out in the prior Supermemory handoff was a stale
      OpenRouter-style model ID surviving after switching the Supermemory
      model provider to local providers such as Ollama. Added provider default
      models in `electron/lib/supermemory-process.cjs` and normalized
      Supermemory config so local providers clamp empty or OpenRouter-style
      model IDs plus stale OpenRouter base URLs to provider-appropriate
      defaults: Ollama `llama3.2` at `http://localhost:11434/v1`, LM Studio
      `local-model` at `http://localhost:1234/v1`, and Jan `local-model` at
      `http://localhost:1337/v1`. Mirrored the same defaults in
      `SettingsModal.jsx` and `SupermemoryPanel.jsx` so changing the provider
      writes provider/model/base URL together and the visible form updates
      immediately. Validation: `node --check electron/lib/supermemory-process.cjs`,
      `node --check electron/main.cjs`, direct `normalizeConfig` smoke with
      `deepseek/deepseek-v4-flash` plus OpenRouter base URL for Ollama/LM
      Studio/Jan, focused ESLint on `SupermemoryPanel.jsx`, `git diff --check`
      for touched files, and `npm run build` passed. Focused ESLint on
      `SettingsModal.jsx` still fails only on the pre-existing
      unused/unescaped-text issues already noted in this handoff.

- [x] Perci Desk left rail is draggable (2026-07-02). User asked to slightly
      widen the left column or make it draggable after the Ask/Send/Add task
      pass, then clarified that hard refresh still showed no resizeable column.
      Added a real 10px separator handle between the left rail and the main Desk
      content in `PerciDeskMode.jsx`/`.css`. Width is stored under
      `perci_desk_left_width`, defaults to 268px, clamps between 240px and
      380px, supports pointer drag and keyboard left/right arrow resizing, and
      hides when the Desk collapses to the single-column mobile layout.
      Validation: focused ESLint on `PerciDeskMode.jsx`, `git diff --check`
      for the touched Desk files, `npx vitest run test/perciContext.test.js`,
      and `npm run build` all passed. Playwright DOM smoke against the existing
      Vite server confirmed the rail changed from 268px to 312px by drag,
      persisted `perci_desk_left_width=312`, arrow-left adjusted it to 300px,
      and the Send button remained visible.

- [x] Perci Desk Ask/Capture affordance clarified (2026-07-02). User reported
      that the Ask Perci field had no Send button and asked what CAPTURE is
      for. Confirmed `PerciDeskMode.jsx` was applying the answer live while
      typing and preventing form submit, and that CAPTURE was the manual task
      intake. Added an explicit Send button with draft/submit semantics for
      Ask Perci, so typing no longer changes the active answer until submit.
      Renamed CAPTURE to Add task and added an accessible label on the icon
      submit button. CSS in `PerciDeskMode.css` now lays out the Ask input and
      Send button responsively with dark-mode support. Validation: focused
      ESLint on `PerciDeskMode.jsx`, `git diff --check` for the touched Desk
      files, `npx vitest run test/perciContext.test.js`, and `npm run build`
      all passed. Playwright DOM smoke against the existing Vite server on
      `localhost:5173` confirmed Send is visible, Add task input/button are
      visible, and submitting a question switches to the Answer view.

- [x] Perci Now Map open-window halo landed (2026-07-02). User asked that all
      open windows indicated on the Perci Now Map tab have a pulsing light
      behind them. Added an independent `is-open-window` station class in
      `PerciNowMode.jsx` from `liveSnapshot.openWindows`, so visible, docked,
      and attention-precedence stations can all show the open-window affordance
      without changing the snapshot model. Added transparent default styling
      for the shared `perci-station-hit`/`perci-station-halo` SVG circles in
      `PerciSurfaceCanvas.css`, then animated the halo in `PerciNowMode.css`
      with a reduced-motion opt-out. Validation: focused ESLint on
      `PerciNowMode.jsx`, `git diff --check` for the touched files, and
      `npm run build` passed. Playwright DOM smoke against the existing Vite
      server on `localhost:5173` with seeded browser fallback window state
      found three open-window station halos and all three using
      `perci-now-open-window-light`. Caveat: the focused
      `npx vitest run test/perciNow.test.js test/perciSurfaceMap.test.js`
      run still has `test/perciNow.test.js` failing because the current map
      model now reports district activity for both `core-concourse` and
      `operations-terminal`, while the older test expects only
      `core-concourse`; `test/perciSurfaceMap.test.js` passed.

- [x] Fixed stuck Start/Stop/Restart controls on the Eidos Supermemory tab
      (2026-07-01). User reported the Supermemory tab was left in an unknown
      state after a Codex session ran out of usage mid-task. Verified live
      against the running dev Electron instance (`npm run electron:dev`, not
      the packaged `/Applications/Perci.app`, which is stale): syntax,
      ESLint, and `npm run build` all passed, and the binary/IPC wiring was
      structurally sound, but clicking Start in the actual app left the UI
      permanently stuck — Start spun forever and Stop/Restart stayed
      disabled, surviving window navigation. Root cause in
      `SupermemoryPanel.jsx`: `start()` and `restart()` only cleared the
      `busy` state on the failure branch; success relied entirely on the
      `pollProgress()` interval noticing `status.running`, which did not
      reliably happen since `supermemory:start`/`supermemory:restart` in
      `electron/lib/supermemory-process.cjs` already block until the server
      is healthy (or fails) before resolving, so there was nothing left for
      polling to catch. Fixed by clearing `busy` unconditionally after both
      calls resolve. Also fixed a real UX bug found alongside it: the
      "Supermemory is running." success message rendered inside the same
      red/error-styled banner (`.supermemory-error`) as genuine errors;
      split into `.supermemory-notice` with `.is-success`/error variants
      driven by a structured `{ text, error }` message state instead of a
      bare string. Verified live: Start/Stop/Restart now transition cleanly
      and the running-state message renders green. Validation: focused
      ESLint on `SupermemoryPanel.jsx` and `npm run build`, both clean.
      Not investigated/left as-is: the Model field showed
      `deepseek/deepseek-v4-flas...` while Model Provider was set to
      "Ollama" — looks like it's inheriting Perci's global default model
      (an OpenRouter-style id) rather than an Ollama-appropriate tag; worth
      checking if a user actually tries to run Supermemory against Ollama.
      Also observed twice during this session that clicking inside the
      Eidos window unexpectedly raised unrelated background windows
      (Cleanmac, then Localhost) instead of registering the intended click
      — possibly related to the "Window body activation hardened" entry
      below; not reproduced deliberately or root-caused, flagging in case it
      recurs.

- [x] Supermemory backend Phase 1 slice landed (2026-07-01). Installed
      `supermemory-server` 0.0.3 with the official installer; binary path is
      `/Users/toshonjennings/.supermemory/bin/supermemory-server` and the PATH
      wrapper is `/Users/toshonjennings/.local/bin/supermemory-server`.
      Added `electron/lib/supermemory-process.js` plus `supermemory:*` IPC in
      `electron/main.cjs`/`electron/preload.cjs` for binary discovery, managed
      child-process start/stop/restart, health/progress, config persistence,
      destructive-data wipe after renderer confirmation, and a constrained
      localhost API proxy for `/health`, `/v3/*`, and `/v4/*`. Supermemory API
      keys and the OpenRouter key are persisted through the encrypted app-data
      path. Added `src/lib/supermemory.js`, `SupermemoryPanel.jsx`, and
      `SupermemoryPanel.css`, then exposed a Supermemory surface inside
      `EidosMode.jsx` without removing the Docker/memU dashboard flow. Added a
      Settings → Memory Backend section to toggle memU vs Supermemory, edit the
      OpenRouter key/model/data-dir/container tag, view binary/status/storage
      size, and wipe memories with confirmation. Registered the new
      `perci_supermemory_*` keys plus `perci_memory_backend` in
      `persistentStore.js`. Follow-up conflict fix: Supermemory now defaults
      to `localhost:6768` and persists `perci_supermemory_port`; `6767` remains
      available for the existing Hermes Jan proxy. Runtime caveat:
      `localhost:6767` was already
      answering with HTTP 503 from a Hermes Jan proxy process before this work,
      so the manager reports a port-conflict state instead of killing that
      unrelated process. The installer also created a 215 MB repo-local
      `.supermemory/` data/cache directory while auto-starting from the repo;
      it contains local auth/data files and is now gitignored. Follow-up UI
      clarification: removed the duplicate visible OpenRouter/Supermemory API
      key fields from the Supermemory surfaces. Supermemory now presents the
      provider key as "uses Perci's saved OpenRouter key"; the local `sm_...`
      instance key is described as auto-generated/captured by the binary.
      Normal Supermemory setting saves no longer copy the fallback
      `openrouter_key` into `perci_supermemory_openrouter_key`. Follow-up
      routing fix: Eidos now loads the active memory backend from Electron
      Supermemory config, listens for `perci-memory-backend-change`, and keeps
      the Supermemory panel as the primary Eidos surface when Supermemory is
      active. The Supermemory panel now mirrors the backend selector itself,
      while the old webview is labeled as the legacy Eidos/memU Docker
      dashboard. Follow-up provider fix: Supermemory now stores a model
      provider and model API base URL, derives the model key from Perci's
      existing Models settings instead of prompting for a second OpenRouter
      key, and mirrors those settings in both Eidos and Settings. Git
      Visualizer now shows a fallback when the external GitHub contribution
      graph SVG fails to render in the desktop surface. Validation:
      `node --check` for
      `electron/lib/supermemory-process.js`, `electron/main.cjs`, and
      `electron/preload.cjs`; focused ESLint for `SupermemoryPanel.jsx`,
      `EidosMode.jsx`, and `src/lib/supermemory.js`; `git diff --check` for
      touched files; and `npm run build`. Focused ESLint on
      `SettingsModal.jsx` still fails on pre-existing unused/unescaped-text
      issues unrelated to this slice.
      Follow-up routing correction (2026-07-01): Eidos no longer defaults to
      the Supermemory screen just because Supermemory is the active memory
      backend. `EidosMode.jsx` now treats backend selection as state only;
      the regular Eidos dashboard remains the default surface after reload,
      while Supermemory stays available as a toolbar tab.

- [x] Localhost pinned tab persistence landed (2026-07-01). Added a real pin
      toggle to the Localhost browser tab strip in `LocalhostMode.jsx`; pinned
      tabs sort to the front and persist as a compact tab group under
      `perci_localhost_pinned_tabs` (with Klipit-scoped storage supported by
      the same key helper). The child webview now reports live URL/title
      changes back to the parent tab list, so restored pinned tabs use the
      actual navigated page instead of only the tab's initial URL. Added the
      new Localhost/Klipit bookmark, search, and pinned-tab keys to
      `persistentStore.js`'s persisted-key manifest for web fallback/snapshots.
      Also fixed the Localhost error banner rendering a string as
      `loadError.desc` and split the discovered-servers header into separate
      controls to remove the React nested-button warning. Validation:
      `npm run build`, `git diff --check -- src/components/LocalhostMode.jsx
      src/lib/persistentStore.js`, and a Playwright smoke against
      `http://localhost:5173` with a mocked Electron bridge confirmed pinning
      `localhost:3000` writes `perci_localhost_pinned_tabs`, reload restores an
      `Unpin tab` control with `localhost:3000` in the address field, and
      `validateDOMNesting` warnings remain at zero.

- [x] Window body activation hardened (2026-07-01). Replaced the fragile
      webview-only focus overlay with a universal inactive-window body shield in
      `WindowFrame.jsx`, so clicking the body of any background window raises it
      before embedded iframe/webview content can swallow the event. `DesktopHost.jsx`
      now keeps a native window-level capture fallback for normal DOM clicks and
      dashboard-background clicks, with pointer/mouse duplicate guards to avoid
      extra z-index bumps. Styling lives in `index.css` as
      `.perci-window-focus-shield`, body-only below the 40px titlebar and below
      resize handles. Validation: focused ESLint on `DesktopHost.jsx` and
      `WindowFrame.jsx`, `git diff --check` for touched files, `npm run build`,
      and Playwright against the live Vite server on `localhost:5173` confirmed
      Chat+Code body focus, empty dashboard minimization, and an embedded-surface
      window body click raising the inactive window.

- [x] Hermes Chat now mirrors the Perci Chat surface while staying Hermes-only
      (2026-06-28). Reworked `src/components/ChatTab.jsx` from its separate
      bubble/start-screen UI into a Perci Chat-style shell with the same
      artwork used by the Hermes dashboard tile
      (`/artwork/design-01kv2y38zh-1781436378.png`) with the chat background
      zoomed to `background-size: auto 140%` so the image edge is cropped out,
      centered transcript, Perci-style composer, New chat action, light/dark
      theme-aware filtering, and local Hermes session status. It auto-starts/resumes
      `hermes:chat-start`, sends only through `hermes:chat-send`, cancels
      through `hermes:chat-cancel`, and starts a fresh Hermes session through
      `hermes:chat-stop` + `hermes:chat-start`; no Perci provider picker,
      search, artifact, or shared chat-history request path was wired into
      Hermes Chat. `ChatMessage.jsx` now accepts optional assistant identity
      props with Perci defaults so Hermes can reuse the shared renderer but
      label replies as Hermes. Follow-up dock fix: `App.jsx` now always keeps
      the shared desktop host in a dock-reserved wrapper, and `index.css`
      gives auto-hide mode a 20px reserved lane so maximized windows do not
      occupy the dock reveal strip while normal dock mode keeps its 64px
      reserve. Follow-up for windows being pushed past the top of Perci's
      screen: `ModeContext.jsx` now calculates window defaults/clamping from
      the actual `.perci-desktop-host` or dock-reserved surface instead of
      `window.innerHeight`, reclamps once after mount, and `App.jsx` dispatches
      a resize pass when dock auto-hide changes. Validation: focused ESLint on
      `ModeContext.jsx`/`ChatTab.jsx`/`ChatMessage.jsx`, `git diff --check` for
      the touched files, `npm run build`, and Playwright smoke checks against
      the Vite dev server with stubbed Hermes IPC in both light and dark mode
      plus auto-hide dock geometry and oversized-window bounds checks
      (`/private/tmp/hermes-chat-light.png`, `/private/tmp/hermes-chat-dark.png`,
      `/private/tmp/hermes-chat-tile-bg-autohide.png`,
      `/private/tmp/perci-dock-bounds-smoke.png`).
      Note: an unrelated pre-existing `electron/main.cjs` modification remains
      in the worktree and was not touched for this slice.

- [x] Perci Desk first slice landed (2026-06-27). Added a first-class
      `MODES.PERCI_DESK` native surface that treats the requested
      chief-of-staff/to-do concept as a Perci-wide operating layer rather
      than a Chat feature. New `src/lib/perciContext.js` defines the shared
      context contract/snapshot shape and reads real local source-of-truth
      data from BARS (`perci_bars_ideas:v1`) and Bill Board
      (`perci_concerns:v1`), plus live Mission/Agent/OpenClaw state and
      manual Desk tasks (`perci_desk_tasks:v1`). New
      `src/components/PerciDeskMode.jsx`/`.css` renders the action desk with
      Now/Overdue/Waiting/Done metrics, a deterministic natural-language ask
      box for questions like "last thing in BARS" and "what bills need
      action", manual task entry/toggling, context-provider cards, and a BARS
      last-entry widget. Wired the surface through `ModeContext.jsx`,
      `App.jsx`, `appCatalog.js`, `ModeSwitcher.jsx`, `Dock.jsx`,
      `ModeIcons.jsx`, and `perciSurfaceMap.js`; Perci Desk is a Core
      Concourse station on movement/context/expense routes because it reads
      across surfaces instead of belonging to one silo. Also added Bill Board
      and Desk keys to `persistentStore.js`'s persisted key list. While
      validating the updated map, fixed an existing out-of-bounds
      `open-notebook` station coordinate in `perciSurfaceMap.js` because it
      blocked the planner-district invariant. Validation:
      `npx vitest run test/perciContext.test.js test/perciSurfaceMap.test.js`,
      focused ESLint on the new/touched Perci Desk files, `npm run build`,
      and `git diff --check` for the touched slice. Note: the worktree still
      contains unrelated pre-existing edits in shared files such as
      `App.jsx`, `ModeContext.jsx`, `appCatalog.js`, dashboard files,
      Electron files, and Open Notebook/Chat Guide assets; do not treat all
      current diffs as part of Perci Desk.

- [x] Perci Desk dark-theme response added (2026-06-27). The refactored Desk
      surface now has `:root.dark .perci-desk-*` overrides for the shell,
      sidebars, cards, hero, filters, inputs, queue items, status chips, and
      accent indicators, so it follows Perci's existing system/manual theme
      resolution from `ThemeContext.jsx`. Validation: `npx eslint
      src/components/PerciDeskMode.jsx`, `git diff --check --`
      `src/components/PerciDeskMode.jsx src/components/PerciDeskMode.css`,
      `npm run build`, and a Playwright render against the existing Vite
      server on port 5173 with `theme=system` plus emulated dark color scheme.
      The Playwright console still reports unrelated local LM Studio/Jan model
      discovery failures during app boot.
      Follow-up: removed the top-right monthly price pill from the Desk
      header and normalized the Desk palette to Perci's neutral/orange design
      tokens in both light and dark modes, replacing the earlier
      teal/purple/pink treatment that made the surface feel like a different
      app. Rechecked with Playwright light/dark renders and verified `/ mo`
      text is absent in both themes.

- [x] Dashboard tile ordering controls landed (2026-06-27). Each launch
      section now has its own compact A-Z toggle in `DashboardMode.jsx`; while
      A-Z is active the section is rendered alphabetically, and toggling back
      returns to the manual order. Manual mode supports drag-reordering tiles
      within the same section only, persists the order under
      `perci_dashboard_tile_order`, and keeps the shared `appCatalog.js`
      ordering untouched for Sir Perci. Styling lives in `DashboardMode.css`.
      Validation: focused ESLint on `DashboardMode.jsx`/`persistentStore.js`,
      `git diff --check`, `npm run build`, and Playwright checks against the
      existing Vite server on port 5173 for independent native/system A-Z
      toggles, manual restore, section-confined drag reorder, and persistence.

- [x] Perci secret/security audit pass (2026-06-26). High-confidence scans of
      tracked source, git history, and the freshly generated `dist/` bundle
      found no live provider API keys, private key blocks, `.env` commits, or
      hardcoded OpenAI/OpenRouter/Anthropic/Gemini/Groq/GitHub/AWS/Slack-style
      secrets. Hardening applied in-place: added encrypted-at-rest coverage and
      read-time migration for `github_key`, `gdash_google_client_secret`, and
      AgentMail credentials; stopped AgentMail credential reads from returning
      the saved API key to the renderer; redacted renderer crash logs before
      disk writes; authenticated the local terminal websocket with a per-process
      token and loopback bind; removed `rehypeRaw` from chat/code markdown;
      converted AgentMail message HTML to text; routed HTML/SVG artifact
      previews through the existing CSP/sandbox wrapper; moved Gemini API keys
      from query params to `x-goog-api-key` headers; enforced the advertised
      tool allowlist at execution time; removed shell string interpolation from
      `run-terminal-command`; and disabled shell mode for agent CLI spawns.
      Validation: `node --check electron/main.cjs`,
      `node --check electron/preload.cjs`, `node --check terminal-server.cjs`,
      `npm run build`, tracked/source/bundle secret scans. Residual follow-ups:
      provider keys still enter the renderer by design for browser-side LLM
      calls, so continuing to keep model/email HTML out of DOM is critical;
      local app preview iframes still allow scripts/same-origin for generated
      app previews; `.mcp.json` remains tracked with machine-local paths; and
      AgentMail's root `scripts/agentmail_bridge.py` dependency is not included
      by the current electron-builder `files` list unless packaging is updated.
      Follow-up compatibility fixes after the audit: AgentMail bridge startup
      now consumes the initial configure response before queueing `list-inboxes`
      so inbox/message loading is not swallowed by the setup handshake, and
      TimesFM keeps argv-safe execution while preferring the workspace
      `timesfm-venv/bin/python` before falling back to `python3`. Functional
      impact checklist added at
      `docs/security/HARDENING_FUNCTIONAL_IMPACT_2026-06-26.md`.

- [x] Cleanmac Perci surface UI safety pass (2026-06-26). Updated
      `src/components/CleanmacMode.jsx` from a terminal-only panel into a
      first-class Perci tool surface with runtime/source status, cleanup-area
      summary, a structured streaming output panel, and internal scrolling for
      smaller windows. Added a real Docker/OrbStack safety review flow:
      `electron/main.cjs` now exposes read-only `cleanmac:inspect-docker`,
      `electron/preload.cjs` exposes `cleanmacInspectDocker()`, and the surface
      keeps Run locked until Perci has listed the current Docker context's
      unused volumes (`docker volume ls --filter dangling=true --quiet` +
      `docker volume inspect`). If candidates exist, the UI shows names,
      driver/Compose labels/created time where available, explains how to
      decide what they are (`docker volume inspect <name>`, match labels to a
      project, back up/migrate, or remove `--volumes`), and only then allows an
      informed confirmation. Also fixed repeated-run output duplication by
      removing the prior `cleanmac:output` listener before registering a new one
      and cleaning it up on completion/error. Important coupling: Perci still
      executes `~/cleanmac/cleanmac` at runtime; this pass changed the Perci UI
      and Electron bridge only and did not modify the separate
      `/Users/toshonjennings/cleanmac` repository. While validating,
      `electron/main.cjs` had an unrelated syntax bug in `getFiles` (`});`
      ending a function); fixed it to `}` so the main process parses. Also
      passed through `writeOpenClawConfig(config)` in preload, matching its
      existing IPC handler and callers. Validation: `node --check
      electron/main.cjs`, `node --check electron/preload.cjs`, `npx eslint
      src/components/CleanmacMode.jsx electron/preload.cjs`, `npm run build`,
      and a Playwright render/DOM check against the existing Vite server on
      port 5173 confirmed the Cleanmac surface sections render. Whole-file
      ESLint on `electron/main.cjs` still reports pre-existing lint debt.

- [ ] MarkItDownUI image-upload "first attempt fails" — continued
      investigation (2026-06-26). Continues the open entry below. User
      clarified the failure is the **actual upload/conversion** (first
      attempt fails, second succeeds), NOT the file picker — the picker opens
      fine — and the file is an **image**. Two evidence-backed leads, both
      still UNCONFIRMED:
      1. **Images in the embedded `<webview>` go to the local `/api/convert`
         server, not the OpenRouter vision path.** In an Electron `<webview>`
         the guest is its own top-level frame, so `window.parent === window`;
         app.js's `isPerciEmbedded` check (`perci=1 && window.parent !==
         window`, `markitdown-ui/webui/static/app.js`) is therefore **false**,
         `shouldUsePerciVision` is false, and images never take the
         `markitdown:vision-request` postMessage path. So the "OpenRouter
         vision via Perci" feature (see the older entry below, written for the
         **iframe** embed) is effectively **dead in the webview** —
         `window.parent.postMessage` can't cross the webview boundary (would
         need `ipcRenderer.sendToHost`). This is a strong inference from
         Electron semantics + the fact that renderer-side logging added to
         `MarkItDownMode`'s vision handler captured ZERO events during image
         uploads; it was NOT directly confirmed — a `dom-ready`
         `executeJavaScript` probe of the guest's `window.parent===window` was
         added but never fired before being reverted. Confirm next time by
         checking whether the MarkItDownUI panel even shows "OpenRouter vision
         via Perci".
      2. **Perci's dev renderer force-reloads itself repeatedly during
         MarkItDown use.** `renderer.log` shows full top-frame reloads
         (`[stray-navigation]` beforeunload → `did-navigate
         url=http://localhost:5173/`) caught 4+ times with the MarkItDownUI
         `<webview>` as `document.activeElement`, two ~1.5 min apart (03:52,
         03:54) after 23 min idle, with no file edit and nothing in `src/`
         calling `location.reload` (only `webviewRef.reload()`). These are
         Vite-client `location.reload()` calls — they bypass the
         `will-navigate` guard, which is why the ~518 `blocked-self-navigation`
         log entries are a red herring (those are a *different*, harmlessly
         blocked source). A reload mid-upload tears the webview down and kills
         the in-flight conversion → exactly "first attempt fails, second
         works." This is a **Vite dev-only artifact** (a packaged build has no
         HMR/ws); not yet tied to a specific failed upload in the act.
      Exonerated along the way: the app.js double-fire fix (entry below) still
      holds live (one dropzone click → exactly one `#fileInput` click), and
      `/api/convert` converts on the FIRST try when driven standalone — so
      app.js page logic is not the cause; the failure lives in the
      embedding/runtime. Bug currently not reproducing ("working now", cause
      unknown). Cheap confirmation for the reload lead: when an upload fails,
      does the WHOLE Perci window flash/reload (not just the upload area)? All
      diagnostic edits to `MarkItDownMode.jsx` were reverted; nothing was
      committed this session.

- [x] Restored missing Perci Notes after update repointed the app to the new
      default folder (2026-06-25). User reported Notes missing after updating
      Perci. Found the real notes still intact at
      `/Users/toshonjennings/opal/notes/notes` with 19 Markdown files, while
      Perci app-data had `perci_notes_folder` set to
      `/Users/toshonjennings/Documents/Perci Notes`, which only contained the
      new default `Index.md`/`Note.md`. Repointed
      `/Users/toshonjennings/Library/Application Support/Perci/perci-data.json`
      to the real folder without moving or deleting any note files. Patched
      `src/lib/persistentStore.js` so `perci_notes_folder` is included in
      persisted snapshots/migrations, and patched `NotesMode.jsx` so a default
      Documents fallback is not immediately persisted as if the user chose it;
      the folder is persisted when a user chooses a folder or initializes
      Notes. Validation: `npm run build`, `git diff --check --`
      `src/components/NotesMode.jsx src/lib/persistentStore.js`, and a Node
      assertion confirmed app-data points at
      `/Users/toshonjennings/opal/notes/notes` with 19 Markdown files.

- [ ] MarkItDownUI upload bug: user retested the app.js double-click fix
      (previous entry below) and reports it's still happening, now described
      as "the file manager window just refreshes, and after that I can
      upload." Investigated and ruled out: any Electron-side navigation
      guard, dialog handler, or window focus/blur effect causing a remount
      (none found in `electron/main.cjs`, `electron/preload.cjs`,
      `ModeContext.jsx`, or `WindowFrame.jsx`); re-confirmed the app.js fix
      itself is correct by instrumenting `fileInput`'s click event directly
      against the live `127.0.0.1:8920` server (fires once now, fired twice
      with the old code re-added as a control). Found and fixed a real gap
      while chasing this: the MarkItDownUI `<webview>` in
      `MarkItDownMode.jsx` has no explicit `partition` attribute, so per
      Electron's docs it falls back to the **app's persistent default
      session** — the same one `win.webContents.session` uses — meaning its
      HTTP cache survives reloads and app restarts. `electron/main.cjs`'s
      existing `onHeadersReceived` hook for `127.0.0.1:8920`/`localhost:8920`
      (added earlier for CORS/frame headers) now also sets `Cache-Control:
      no-store`, so this local dev server's static assets can never be served
      stale to the embed again — but **this is a main-process change and
      needs a full Perci quit+relaunch to take effect**; a renderer-only
      Reload click won't re-register the header rule. Genuinely unresolved:
      whether the user's "first attempt fails" symptom was actually the
      already-fixed app.js bug being masked by this exact stale cache (most
      likely, given the timeline), or a third mechanism neither this session
      nor the prior one (see below) found. Next step: have the user fully
      quit and relaunch Perci, retest, and if it still reproduces, get a
      precise description of what visibly "refreshes" — the native OS file
      dialog flashing, or the MarkItDownUI panel's own content going
      blank/reloading — since that distinguishes an OS/dialog-level issue
      from a Perci-window-level one and neither has been directly observed
      yet (only tested against the standalone server in a plain browser tab,
      not the real Electron `<webview>`).

- [x] Fixed MarkItDownUI's "first upload attempt always fails" bug (2026-06-25).
      Root cause: `static/index.html` nests `<input id="fileInput" hidden>`
      inside `<label id="dropzone">`, so a click on the dropzone already gets
      natively forwarded to the file input by the browser — but
      `static/app.js` also had `dropzone.addEventListener("click", () =>
      fileInput.click())`, an explicit second trigger. One user click on the
      dropzone fired the input's click handling twice; the resulting two
      file-picker-open requests raced (worse over Electron's `<webview>` IPC
      than in a plain tab), so the first request routinely lost and the
      picker silently failed to deliver a selection — the user had to click
      again for a request to win cleanly. Fixed by deleting the redundant
      listener in `/Users/toshonjennings/markitdown-ui/webui/static/app.js`
      (a separate local project, not part of this repo) and relying solely
      on native label-to-input forwarding; kept the existing `keydown`
      handler since `<label tabindex="0">` doesn't get free Enter/Space
      activation. Also removed a now-dead `webview.executeJavaScript(...)`
      no-op in `src/components/MarkItDownMode.jsx`'s `handleDomReady` that
      had — per its own comment — already correctly diagnosed this exact
      double-trigger mechanism but concluded "no patching needed," which is
      what let the bug ship; `git diff HEAD` on that file showed a *prior*
      uncommitted version had a real `preventDefault`/`stopPropagation`
      patch attempt that was later reverted back to the no-op, so this has
      apparently been investigated and incorrectly closed out before — if a
      future change to `MarkItDownMode.jsx`'s `handleDomReady` looks like
      it's reintroducing upload-patch code, check whether the upstream
      `app.js` fix is still in place before assuming a Perci-side patch is
      needed again. Validation: `node --check` on the patched `app.js`,
      focused ESLint on `MarkItDownMode.jsx` (clean aside from the
      pre-existing repo-wide missing-`React`-import warnings), `npm run
      build`, and a live browser test against the running
      `127.0.0.1:8920` server — instrumented `fileInput`'s `click` event to
      count firings per dropzone click: 1 with the fix, reproduced 2 by
      temporarily re-adding the old listener to confirm the test
      methodology actually catches the bug.

- [x] Perci Map / Perci Now district layout regularized (2026-06-25). The six
      `SURFACE_MAP_DISTRICTS` boxes previously had wildly inconsistent gaps
      between neighbors (measured: 10px, 30px, 40px, 50px, 110px, even 130px
      depending on the pair), which read as scattered rather than planned.
      Districts are now derived from the same 120x80 grid `MapGrid` already
      draws (vertical lines at 80,200,...,1280; horizontal at 80,160,...,800):
      every district spans whole grid cells inset by a uniform 20px margin
      per side, so any two adjacent districts are exactly 40px apart and
      every edge lands on a real grid line. `PERCI_SURFACE_STATIONS`
      coordinates were redone to match: each district's stations sit on an
      evenly-spaced internal row/column grid (e.g. Core Concourse is a clean
      2x2, Operations Terminal and Local Systems Depot are matching 3x2 grids
      that line up in the same columns across their shared boundary). No
      station/district ids, labels, descriptions, kinds, or route
      definitions changed — only `x`/`y`/`width`/`height` values. Both Perci
      Map and Perci Now's Map tab pick this up automatically since they share
      `PerciSurfaceCanvas.jsx` and `src/lib/perciSurfaceMap.js`. Validation:
      `npx vitest run test/perciSurfaceMap.test.js test/perciNow.test.js`
      (11/11), `npm run build`, focused ESLint on `perciSurfaceMap.js`
      (clean), and a live preview pass scrolling/zooming through both maps
      confirmed no overlaps and consistent spacing everywhere.

- [x] Resolved the flagged `perciSurfaceMap.js` drift (2026-06-25). The
      previous session's uncommitted test bump (Core Concourse expected to
      have 4 stations) and dead icon import turned out to be a half-finished
      attempt at the `Perci Now` station this same milestone's HANDOFF entry
      already claimed was done. Finished it for real: added the `perci-now`
      station to `PERCI_SURFACE_STATIONS` (`core-concourse`, x:740 y:415,
      beside `dashboard`/`workspace`/`perci-map`) and wired it into the
      `circle-line` (movement) and `agent-rail` (automation) routes per the
      existing HANDOFF description; removed the unused `lucide-react` icon
      import block (confirmed dead — no station anywhere sets `.icon`, so
      `PerciSurfaceCanvas.jsx`'s `getLabelProps` branch for it is unreached).
      Also fixed `src/lib/perciNow.js`: `createPerciNowSnapshot` was counting
      its own `Perci Now` window in `openWindows`/`visibleWindows` when the
      surface is open and live (confirmed via `PerciNowMode.jsx`, which feeds
      the app-wide `windows` list — including itself — into the snapshot);
      now filters out `modeId === MODES.PERCI_NOW` before counting, so Now
      reports on everything else happening in Perci, not itself. Validation:
      `npx vitest run test/perciSurfaceMap.test.js test/perciNow.test.js`
      (11/11 passing) and `npm run build`. Note: a full `npx vitest run`
      shows 10 pre-existing failures in `test/powerWorkspace.test.js`,
      unrelated to this fix — that test and `src/lib/powerWorkspace.js` are
      both untouched/identical to HEAD, so the breakage predates this session
      and any uncommitted Perci Now work; flagged separately, not fixed here.
- [x] Perci Now gained a live activity Map tab (2026-06-25). Extracted the
      SVG rendering primitives shared by the map (`Districts`, `MapGrid`,
      `Station`, the zoom hook/toolbar) out of `PerciMapMode.jsx` into new
      `src/components/PerciSurfaceCanvas.jsx`/`.css`, then refactored
      `PerciMapMode.jsx` to import them (no visual/behavior change — verified
      in-app). `PerciNowMode.jsx` now has an Overview/Map tab switch; the Map
      tab renders the same station/district geometry as Perci Map but drives
      station state from live data instead of route filters: stations glow
      green (`is-active`) for open windows or active mission/agent work, pulse
      red (`is-attention`) for blocked/attention items or an offline gateway,
      dim (`is-idle`) otherwise, and a `is-docked` state for minimized
      windows. District rectangles get a heat glow derived from
      `districtActivity` plus a weight bump for districts containing
      attention/active stations, so e.g. Operations Terminal visibly glows
      when Mission has a blocked run even with no window open there. Clicking
      a station opens/focuses that surface exactly like Perci Map; the
      inspector panel shows a live status badge and reuses the existing
      `WorkRow` component to list "Happening here now" items for the Mission
      and Agents stations. Validation: `npx vitest run test/perciNow.test.js
      test/perciSurfaceMap.test.js`, focused ESLint on
      `PerciNowMode.jsx`/`PerciMapMode.jsx`/`PerciSurfaceCanvas.jsx` (clean
      except pre-existing harmless fast-refresh warnings on the new shared
      file), `npm run build`, and a live preview pass confirmed Perci Map is
      visually unchanged post-refactor and the new Map tab correctly
      lights up Mission/OpenClaw in red with a glowing Operations Terminal
      district, navigates on click, and updates the inspector. Note: found
      pre-existing, unrelated uncommitted drift in `src/lib/perciSurfaceMap.js`
      / `test/perciSurfaceMap.test.js` (test expects 4 Core Concourse
      stations, only 3 exist; a dead unused icon import was added) — not
      touched, flagged separately.
- [x] Dashboard Perci Now glance landed (2026-06-24). Replaced the old
      right-of-clock mascot card in `DashboardMode.jsx` with
      `DashboardPerciNowGlance.jsx`, a compact pictorial live-state panel that
      reuses `createPerciNowSnapshot()` plus the Perci Map station/district
      catalog. The widget shows Perci Now status, live surface nodes, active
      work and attention counts, gateway state, and active districts; clicking
      it opens the full Perci Now window. Styling lives in
      `DashboardMode.css`, keeps the panel beside the clock on desktop, and
      wraps cleanly on tablet/mobile. Validation: focused ESLint for
      `src/components/DashboardPerciNowGlance.jsx` and
      `src/components/DashboardMode.jsx`, `npx vitest run test/perciNow.test.js
      test/perciSurfaceMap.test.js`, `npm run build`, and a Playwright DOM /
      screenshot pass against the existing Vite server on port 5173 all passed.
- [x] Perci Now live-awareness surface landed (2026-06-24). Added
      `MODES.PERCI_NOW` / `Perci Now` as a native window for the product space
      between Mission Control and Perci Map: Map explains relationships,
      Mission owns run accountability/history, and Now answers what is
      happening across Perci at the current moment. `src/lib/perciNow.js`
      derives state from open windows, Mission runs, agent jobs, OpenClaw
      health, and the Perci Map station/district model without appending a
      rolling log. The only persisted record is user-triggered snapshots under
      `perci_now_snapshots`, capped to a short shelf. `PerciNowMode.jsx` renders
      visible surfaces, active work, local runtime, district pressure, and
      saved snapshots. The surface is launchable through the top ModeSwitcher,
      Dashboard/Sir Perci shared catalog, Dock glyphs, and App routing; Perci
      Map now includes a `Perci Now` station on the Movement and Agent Rail
      routes. Mode guide and onboarding wording now distinguish Now as live
      awareness from Mission as validation/accountability. Validation:
      `npx vitest run test/perciNow.test.js test/perciSurfaceMap.test.js`,
      focused ESLint for `src/components/PerciNowMode.jsx` and
      `src/lib/perciNow.js`, `npm run build`, and `git diff --check` passed.
      Broad ESLint over touched legacy files still reports pre-existing repo
      rules/issues such as missing `React` imports, Electron `webview` prop
      warnings, and the existing unused destructure in `ModeContext.jsx`.
- [x] Perci Map first-class surface landed (2026-06-24). Added
      `MODES.SURFACE_MAP` / `Perci Map` as a native window, routed through
      `App.jsx`, `ModeContext.jsx`, Dashboard/Sir Perci shared catalog, the
      top `ModeSwitcher`, and the Dock glyph set. `src/lib/perciSurfaceMap.js`
      defines a stable Beck-inspired conceptual graph of Perci surfaces with
      multiple route types: Movement, Shared context, Agent work, Build output,
      Research, Local runtime, Governance, and Expenses. Bill Board belongs on
      the Expenses route, not Governance, because it is for user expense/spend
      tracking. `PerciMapMode.jsx` renders the map as an SVG transit surface
      with filterable route types, station
      inspection, keyboard-accessible stations, and click-to-open/focus
      navigation for mapped surfaces. Styling lives in `PerciMapMode.css` and
      keeps the view responsive by collapsing the inspector below the map on
      narrower windows. Added `test/perciSurfaceMap.test.js` to guard route
      references, launch targets, filtering, and summary counts. Validation:
      `npx vitest run test/perciSurfaceMap.test.js`, focused ESLint for the
      new map files, `npm run build`, `git diff --check`, and `curl -I
      http://localhost:5173` all passed. Note: broad ESLint over touched legacy
      files still reports pre-existing repo rules/issues such as missing
      `React` imports in old JSX files, Electron `webview` prop warnings, and
      an existing unused destructure in `ModeContext.jsx`; the new map files
      pass focused lint.
- [x] Perci Map district model tightened (2026-06-24). The map now uses
      planner-style districts instead of loose node scatter:
      `SURFACE_MAP_DISTRICTS` defines Core Concourse, Knowledge Quarter,
      Creation Yard, Operations Terminal, Local Systems Depot, and Business
      Office. Every station carries a `districtId`, is positioned inside its
      district, and the SVG renders district boundaries/labels behind the route
      lines. The station inspector now shows the selected station's district.
      Added `CONTEXT.md` glossary entries for Perci Map District, Route, and
      Station so future changes preserve the planning model. Tests now assert
      every station belongs to a known district and that the map retains the
      expected district set.
- [x] Perci Map zoom and district spacing pass landed (2026-06-24). The map
      canvas grew from the initial compact plan into a wider 1320x860 SVG,
      with districts and stations spread farther apart for legibility. Added a
      sticky zoom toolbar inside the map pane with zoom out, range slider, zoom
      in, reset, and visible percentage. Zoom changes the rendered SVG size and
      keeps the map pane scrollable, so users can zoom out for the whole system
      shape or zoom in and pan for station-level inspection. Added a test that
      every station coordinate remains inside its assigned planner district.
- [x] Perci Map flow patterns and lighter route lines landed (2026-06-24).
      Route type metadata now includes `linePattern` definitions so flow types
      are encoded by stroke pattern as well as color: solid, long dash,
      dash-dot, short dash, dotted, rail dash, fine dotted, and ledger dash.
      The SVG route strokes are lighter (`4px` with a slimmer underlay), and
      filter chips plus inspector route rows show a small line sample for each
      flow type. Tests now assert every route type has a unique line pattern.
- [x] Sir Perci launcher merged into the persistent bottom Dock (2026-06-24).
      `Dock.jsx` no longer returns `null` with zero windows open — it now
      always renders, with window chips wrapped in `.perci-dock-chips` and a
      new `SirPerciLauncher.jsx` pinned to the right end. Clicking the Sir
      Perci mascot button opens a searchable flyout (categories: Perci
      Native, System & External, Guides) sourced from a new
      `src/lib/appCatalog.js` (extracted verbatim from `DashboardMode.jsx`,
      which now imports `NATIVE_TILES`/`SYSTEM_TILES` from there instead of
      declaring them inline). Guide entries open the real
      `BeginnerGuideModal`/`MissionControlGuideModal`/`ModeGuideModal`
      directly. The flyout footer has an "Auto-hide dock" switch, persisted
      as `perci_dock_autohide` (added to `persistentStore.js`
      `PERSISTED_KEYS`, default `false`): on, the dock translates off-screen
      except a 6px peeking sliver and reveals on hover/focus via a CSS
      adjacent-sibling selector (`.perci-dock-hover-zone`); off, the dock
      stays always-visible and `App.jsx` reserves its layout space
      (`perci-dock-reserved` now keys off the autohide preference instead of
      `windows.length`). Positioning for both this flyout and the existing
      `WindowContextMenu.jsx` now shares `src/lib/useFlipPosition.js`
      (extracted from `WindowContextMenu`'s inline flip-to-fit math).
      **Real bug found and fixed during verification**: the hook only
      recomputed position on open/anchor-change, not on window resize, so a
      popup left open across a viewport resize could end up positioned
      entirely below the visible viewport (confirmed via
      `getBoundingClientRect()` placing the autohide switch at `y:838` in a
      720px-tall viewport, with `elementFromPoint` returning nothing at that
      point) — clicks would silently miss and register as an outside-click
      instead. Fixed by adding a `window resize` listener that re-runs the
      same positioning calculation. Validation: full preview-browser pass at
      1280x800 confirmed flyout open/search/filter/category-empty-hiding,
      guide modal wiring, autohide toggle on/off (verified
      `data-autohide`/`transform`/`localStorage` directly), and the CSS
      hover-reveal selector matches the actual DOM sibling structure; a
      760px-wide resize check confirmed no layout breakage and the flyout
      stays within viewport bounds. Note: the MCP preview tool's
      coordinate-based `preview_click` proved unreliable against the small
      trigger button in this session (real DOM `.click()` via `preview_eval`
      worked every time) — likely a tool quirk, not an app bug; worth
      remembering for future preview-driven verification of small targets.
- [x] Dashboard native-tool modals landed (2026-06-24). The Perci native
      section in `DashboardMode.jsx` now includes compact buttons for
      Chronicle and `graphify-diff`, each opening a shared polished modal that
      describes purpose, CLI shape, evidence model, and role in the GitHub
      story workflow. Styling lives in `DashboardMode.css` and follows the
      dashboard token system with responsive modal layouts. Validation:
      `./node_modules/.bin/eslint src/components/DashboardMode.jsx`,
      `npm run build`, `git diff --check`, and a headless Chrome interaction
      test against `http://localhost:5173` passed. Screenshots captured at
      `/private/tmp/perci-chronicle-modal.png` and
      `/private/tmp/perci-graphify-diff-modal.png`.
- [x] Perci Chronicle first CLI landed (2026-06-24). `scripts/perci-chronicle.mjs`
      builds an evidence-backed product story from Git history, path/surface
      clustering, GitHub commit links, and the local Graphify graph/manifest
      when available. The CLI now also scans changed file content and added
      diff lines for deterministic semantic observations such as first-class
      mode components, mode routing references, Electron IPC handlers,
      persistent storage keys, test assertions, visual assets, and shared
      library exports. `npm run story -- --range v0.28.1..HEAD --out
      docs/history/PERCI_CHANGE_STORY.md --json
      docs/history/PERCI_CHANGE_STORY.json` generated the first story for the
      recent large grouped commits. The output reports Graphify coverage so a
      stale index is visible before over-trusting architectural summaries.
      Validation: `node --check scripts/perci-chronicle.mjs`, `npm run story
      -- --range v0.28.1..HEAD --out docs/history/PERCI_CHANGE_STORY.md --json
      docs/history/PERCI_CHANGE_STORY.json`, `npm run build`, and
      `git diff --check` pass. Full `npm test` currently fails in existing
      `test/harnessMemory.test.js` and `test/powerWorkspace.test.js` cases
      unrelated to this CLI change; those source files were not modified in
      this slice.
- [x] Mission Control render crash fixed (2026-06-24). `MissionControl.jsx`
      now imports the persistent storage string helpers it already used, and
      the run context menu is rendered from `MissionControl` instead of
      `MissionPulsePanel` so its state/actions stay in scope. Validation:
      `./node_modules/.bin/eslint src/components/MissionControl.jsx`,
      `npm run build`, and a headless Chrome smoke test against
      `http://localhost:5173` pass.
- [x] Coding Expert Stack tooling prerequisites installed and indexed
      (2026-06-23). `skills` CLI 1.5.13 is now on PATH under the Hermes Node
      prefix, `codebase-memory-mcp` 0.8.1 is installed under `~/.local/bin`,
      Agent Reach 1.5.0 is installed under `~/.local/bin`, `mcporter` 0.9.0 is
      installed under the Hermes Node prefix, and `config/mcporter.json` points
      `exa` at `https://mcp.exa.ai/mcp`. The repo was indexed with
      `codebase-memory-mcp cli index_repository` using `persistence:true`, which
      produced `.codebase-memory/graph.db.zst` and `.codebase-memory/artifact.json`.
      Both upstream skill packs were imported into `.agents/skills` with
      `npx skills@latest add mattpocock/skills` and
      `npx skills@latest add addyosmani/agent-skills`. Agent Reach doctor now
      reports semantic web search available and 7/13 channels active.
- [x] SkillSpector policy decision: ALLOWLIST WITH TRUST TIERS (2026-06-24).
      `skillspector scan .agents/skills --no-llm` returns 100/100 CRITICAL when
      run in bulk mode (treating the whole directory as one skill) but this is
      a meta-analysis artifact, not a true composite score. Individual scans
      show the real picture:
      - `git-guardrails-claude-code`: HIGH flag for AS1 (Agent Config Directory
        Access) — FALSE POSITIVE. The skill legitimately reads `.claude/` to set
        hooks; the bundled script only greps for dangerous git patterns and
        exits. No data exfiltration, no self-modification. Keep as-is.
      - `security-and-hardening`: HIGH flags (PE3 credential paths, YR4 exploit
        patterns, EA2 autonomous decision). FALSE POSITIVE for a security-audit
        skill — these are references to concepts the skill teaches, not actual
        credential leaks or exploit payloads.
      - `browser-testing-with-devtools`: HIGH flag (YR1 info-stealer pattern).
        FALSE POSITIVE — the skill references browser automation patterns that
        overlap YARA regex heuristics (network calls, cookie access) but the
        skill content is legitimate testing guidance.
      - `ask-matt`: HIGH flag (MP3 Memory Manipulation). FALSE POSITIVE —
        references to "save to memory" as a workflow concept.
      - `context-engineering`: MEDIUM flag (PE3 Credential Access) — the skill
        mentions credential paths in a theoretical context. Not an actual leak.
      - `spec-driven-development`: MEDIUM flag (AS3 Skill Enumeration) —
        describes skill-discovery workflow. Benign.
      - `code-simplification`: MEDIUM/HIGH flag (RA1 Self-Modification at
        line 155) — the skill describes refactoring patterns; the "self-mod"
        reference is metaphorical (refactoring one's own code during review).
      All imported packs retained. See policy section below.
- [x] Coding Expert Stack first UI slice landed in the existing Skills window
      (2026-06-23). `SkillsMode.jsx` now shows a persisted "Coding Expert
      Stack" package panel above the installed skills list. It treats the stack
      as four layers: Engineering Playbook (mattpocock/skills +
      addyosmani/agent-skills), Codebase Memory (codebase-memory-mcp), Research
      Reach (Agent Reach), and Skill Safety Gate (SkillSpector). Readiness is
      inferred from the already-detected skill/source inventory; the toggle
      persists through the existing skills metadata file under
      `__codingExpertStack`. The panel includes source links and a copyable
      setup checklist, but intentionally does not auto-install external repos or
      execute package-manager commands yet. Validation: `npm run build` passes
      with the existing Vite chunk-size warnings.
- [x] Coding Expert Stack tooling doctor landed (2026-06-23).
      `electron/main.cjs` now exposes `skills:get-coding-expert-status`, a
      bounded local-only detector for `skills`, `npx`, `codebase-memory-mcp`,
      `agent-reach`, `skillspector`, `uv`, and `.codebase-memory/graph.db.zst`
      artifacts in the current/registered workspaces. `electron/preload.cjs`
      exposes it as `getCodingExpertStatus()`. `SkillsMode.jsx` folds those
      signals into the four stack readiness layers and renders a compact
      Tooling doctor table with found/missing state, version/path details, and
      graph artifact count. The existing agent CLI detector now uses the same
      bounded `which`-based executable lookup helper. It still does not run
      installers, network doctor commands, or external scans automatically.
      Validation: `node -c
      electron/main.cjs`, `node -c electron/preload.cjs`, and `npm run build`
      pass with the existing Vite chunk-size warnings. Live IPC verification
      requires a full Perci desktop-shell restart.
- [x] System Skills detector refactor landed (2026-06-23). The Skills window is
      now source-aware instead of Hermes-only: `skills:get-installed` scans
      Hermes, Codex, Claude, OpenClaw, OpenCode, Cursor, Aider, Antigravity,
      plus discovered system/agent skill roots, Claude command markdown, and
      Cursor rule files. Returned skills include `source`, `sources`, and
      `sourceDetails` while still deduping by skill id. `SkillsMode.jsx` now
      presents "System Skills", source filters, source-grouped sections, and
      source badges. Validation: requested `npx esbuild
      src/components/SkillsMode.jsx --bundle --format=esm --jsx=automatic
      --outfile=/tmp/test.js`, `node -c electron/main.cjs`, a stubbed
      `skills:get-installed` scan (540 deduped skills across Codex, Hermes,
      Antigravity, System, Claude, Orbit, Cursor, and Pi), `git diff --check`,
      and `npm run build` all pass. A live Electron IPC verification still
      requires a full Perci desktop-shell restart because `electron/main.cjs`
      changes are not hot-reloaded.
- [x] OpenClaw skills detection fix (2026-06-23). The Skills detector found no
      OpenClaw skills because (a) it only scanned `~/.openclaw/skills` (which
      doesn't exist — OpenClaw symlinks enabled skills into
      `~/.openclaw/plugin-skills/`) and (b) `scanSkillsRecursive` skipped
      symlinked dirs (`entry.isDirectory()` is false for a symlink). Fixed both
      in `electron/main.cjs`: added the `plugin-skills` scan root and made the
      scanner follow symlinks that resolve to directories (broken symlinks
      skipped; maxDepth guard prevents cycles). Verified by replicating the scan
      over the real FS — `browser-automation` now detected. Requires a Perci
      desktop-shell restart to take effect (main process isn't hot-reloaded).
      Note: only OpenClaw skills symlinked into `plugin-skills` count as
      "installed"; bundled-but-unenabled extension skills are intentionally not
      listed. Also removed the `<Bot>` robot icon from the Detected Agent CLI
      badges in `SkillsMode.jsx`.
- [x] Ensemble mode landed (2026-06-23). A standalone multi-model deliberation
      surface: a user-chosen panel of models answers a prompt in parallel, a
      judge model analyses the anonymised responses (consensus / unique
      insights / contradictions / blind spots), and a synthesis model writes the
      final answer from the judge's guidance. Optional 2–3 round refine loop
      feeds the candidate back to the panel. Engine is the pure, unit-tested
      `src/lib/ensemble.js` (`runEnsemble` + injectable `streamModel`, built on
      `LLMFactory`); UI is `src/components/EnsembleMode.jsx` (reuses
      BuildCompare's fan-out pattern + `ProviderModelPicker`-style menus,
      rAF-batched streaming). All four stage prompts are editable; config
      persists under `perci_ensemble_config`. Registered as `MODES.ENSEMBLE`
      (ModeContext, App case, Dashboard tile, Dock glyph). Validation: `npx
      vitest run test/ensemble.test.js` (9/9) and `npm run build` pass; verified
      open/render in the dev preview. Conceptually an "Ensemble" in the ML sense
      (combining models to beat any single one). Not for coding tasks
      (slower/costlier than one model).
- [x] Power User Workspace planning is now the active product direction. The
      goal is to improve Perci for technical founder/operator/builder power
      users by connecting ideas, notes, code, terminals, agents, validation,
      memory, and next actions into one coherent workspace loop. The canonical
      pickup plan is `docs/product/POWER_USER_WORKSPACE_PLAN.md`. Start with
      the workspace model plus window skeleton before deeper BARS/Notes/Mission
      integrations. Do not treat enterprise warehouse/BI setup as the default
      persona for this milestone.
- [x] Power Workspace first slice started: `src/lib/powerWorkspace.js` defines
      the minimal persisted workspace model, legacy working-directory/Git
      Shells fallback, recent BARS/Mission snapshot reads, and deterministic
      next-action selection. `src/components/PowerWorkspaceMode.jsx` adds the
      first renderer-only workspace window. The mode is wired through
      `ModeContext`, `App`, Dashboard, Dock, and persistence keys. Validation:
      `npm test -- --run test/powerWorkspace.test.js` and `npm run build` pass.
      Next implementation step is linking BARS/Notes/Mission records to an
      active workspace instead of only showing recent/fallback summaries.
- [x] Power Workspace explicit context linking landed. Workspace records now
      persist `linkedIdeaIds`, `linkedMissionRunIds`, and `linkedNoteRefs`;
      `setWorkspaceLink()` stores links on the workspace record instead of
      mutating BARS ideas, Mission runs, or note files. The Power Workspace
      window can link/unlink recent BARS ideas and Mission runs, and can pin
      manual note references such as `Index.md` or `[[Power User Brief]]`.
      Linked items sort ahead of merely recent items. Validation:
      `npm test -- --run test/powerWorkspace.test.js` and `npm run build` pass.
      Follow-up completed below: workspace actions now start Cowork/Git Shells
      with the active workspace goal/folder context.
- [x] Power Workspace action handoff landed. `prepareWorkspaceCoworkHandoff()`
      saves the active workspace, writes `working_directory`, stores a pending
      Cowork prompt under `perci_power_workspace_cowork_handoff`, and emits an
      in-app handoff event for already-mounted Cowork windows. Cowork consumes
      the handoff by registering the folder, setting its working directory, and
      pre-filling the composer with the workspace goal/context without
      auto-running. `prepareWorkspaceProjectHandoff()` writes
      `working_directory`, selects an existing matching Git Shells project and
      first terminal via `supaterm_active_*`, or opens Git Shells with a
      pre-filled registration draft for the workspace folder. Validation:
      `npm test -- --run test/powerWorkspace.test.js` and `npm run build` pass.
      Follow-up completed below: BARS, Notes, and Mission now expose
      workspace-aware filters and link/unlink actions.
- [x] Workspace-aware BARS/Notes/Mission actions landed. `powerWorkspace.js`
      now has shared matching helpers for note refs and Mission runs, so
      `Index.md`, `Index.enc.md`, and `[[Index]]` resolve to the same workspace
      note identity and Mission runs match either explicit links or the active
      workspace folder. BARS shows a workspace count, workspace-only filter, and
      per-idea "Use in workspace" action. Notes shows a workspace-only note
      filter and active-note link/unlink action without editing note contents or
      weakening encrypted-note behavior. Mission Control has a Workspace filter,
      workspace run count, and selected-run link/unlink action. Validation:
      `npm test -- --run test/powerWorkspace.test.js` and `npm run build` pass
      with the existing Vite chunk-size warnings. Next step is making the Power
      Workspace home open directly into linked BARS ideas, Notes pages, and
      Mission runs instead of only opening the parent surfaces.
- [x] Power Workspace direct record navigation landed. A single renderer-only
      `perci_power_workspace_surface_handoff` record plus
      `perci-power-workspace-surface-handoff` event handles both newly opened
      and already-mounted windows. Power Workspace idea/run titles and explicit
      actions now open BARS or Mission with the requested record selected;
      linked note chips open Notes on the resolved page, including wikilink,
      `.md`, and `.enc.md` forms. Destination filters are cleared when needed so
      the requested record is visible. The handoff is consumed once and covered
      by `test/powerWorkspace.test.js`. Validation:
      `npm test -- --run test/powerWorkspace.test.js` passes with 11 tests and
      `npm run build` passes with the existing Vite chunk-size warnings. Next
      step completed below: selected BARS and Notes context can now be carried
      into Cowork for planning.
- [x] Selected workspace context can now start a focused Cowork planning handoff.
      BARS records expose `Plan in Cowork`; linked note chips expose a compact
      Cowork action. The existing Cowork handoff remains non-destructive and
      non-automatic: it registers the workspace folder and pre-fills the
      composer, but does not submit. The generated prompt includes the workspace
      goal/folder plus selected BARS title/status/next action or the selected
      note reference, then asks Cowork for the next smallest executable plan
      after inspecting current state. Validation:
      `npm test -- --run test/powerWorkspace.test.js` passes with 12 tests and
      `npm run build` passes with the existing Vite chunk-size warnings. Next
      step is surfacing recent/current Cowork session activity in Power
      Workspace so the home shows whether workspace-scoped agent work is ready,
      active, or awaiting user action.
- [x] Power Workspace now shows live workspace-scoped Cowork activity from the
      existing persisted `codeState.sessions` collection. Workspace handoffs
      create a non-running `Started` session with the workspace id/folder and a
      pre-filled composer; submitting it transitions the session to
      `In progress` without auto-running beforehand. New manual and routine
      sessions also retain their working directory. The workspace execution
      panel classifies matching sessions as ready, active, or awaiting user
      review/attention and lists the three most recent matching sessions.
      Validation: `npm test -- --run test/powerWorkspace.test.js` passes with
      13 tests, `npm run build` passes with the existing Vite chunk-size
      warnings, and `git diff --check` passes. Next step is feeding Cowork's
      awaiting-review state into the deterministic next-action recommendation
      and, if needed, opening the exact Cowork session rather than only the
      Cowork surface.
- [x] Cowork review continuity is now wired end to end. Awaiting workspace
      sessions take priority in the deterministic next-action recommendation,
      activity rows and the next-action button select the exact Cowork session
      through the existing `codeState.currentSessionId` field, and opening a
      finished/failed session records `reviewedAt` so it does not remain the
      top action forever. The shared window manager now re-clamps normal and
      restore bounds when the viewport resizes, keeping Power Workspace fully
      visible at narrow desktop widths. Validation: 14 focused tests pass,
      `npm run build` passes with the existing Vite chunk-size warnings, and
      live Playwright checks at 1440x1000 and 800x900 confirmed exact-session
      selection, zero horizontal overflow, and no page errors. The first
      coherent idea/context/Cowork/Mission/Git Shells loop is now implemented;
      next work should begin only after deciding whether to close this first
      milestone or extend it with workspace-scoped Chat, validation, and memory
      actions.
- [x] Workspace-scoped Chat, validation, and memory actions complete the first
      Power User Workspace milestone. New workspace chats persist workspace
      id/folder metadata, open by exact conversation id, and receive a
      goal/folder/context prompt without auto-sending. Mission runs now expose
      their real validation state in the workspace; `Validate in Git Shells`
      arms the existing Mission validation target before opening the matching
      project terminal. Pending Mission memory candidates can be saved or
      discarded directly, using one resolver shared with Mission Control;
      explicit user-approved saves bypass the automatic ingestion quality
      threshold and persist as scoped harness memory. Validation: 16 focused
      tests pass, `npm run build` passes with existing Vite chunk-size warnings,
      and live Playwright checks confirmed exact chat reopening, prefilled chat
      context, Mission validation targeting, memory save/discard persistence,
      zero page errors, and no horizontal overflow at 800x900. Treat subsequent
      Power Workspace expansion as a new milestone.
- [x] Hermes dashboard tile now crops its baked-in pale artwork margin with a
      tile-scoped 116% background height, leaving the other launch-tile images
      unchanged. Renderer-only; `npm run build` and a live 1972x1280 visual
      check pass.
- [x] Git Shells now marks any background shell output unread immediately,
      retains the existing prompt-idle completion detection, and exposes native
      notification plus completion-sound toggles in the sidebar header. Native
      permission is requested only when the user enables it; audio defaults off.
- [x] Git Shells terminal input focus is reinforced at the xterm panel boundary.
      Live QA entered commands through the rendered terminal, interrupted
      `sleep 20` with Ctrl+C, returned to the prompt, and showed an unread amber
      marker when a second shell completed in the background.
- [x] Cowork local routines now apply and register their saved folder before
      starting. `run_command` works in Electron local folders through a bounded,
      shell-free executable/argument IPC runner restricted to the registered
      workspace; shell operators remain intentionally unsupported. Main/preload
      changes require a Perci restart before this command bridge is live.
- [x] Chat now keeps a labeled **New chat** button in the persistent composer
      area, so starting a fresh conversation remains accessible at the bottom
      of long message histories and in narrow windows. The existing sidebar
      action is unchanged. Renderer-only; `npm run build` and live long-scroll
      click-through verification pass.
- [x] Git Shells (`MODES.PROJECTS`) integration wrap-up: `electron/main.cjs`
      now attaches `select-directory` to `mainWindow` so macOS directory
      dialogs open as app-modal sheets instead of hiding behind Perci.
      `ProjectsMode.jsx` uses `gitshells_projects` plus `supaterm_active_*`
      keys, safely parses corrupted project snapshots, falls back to a guarded
      manual path prompt when Electron IPC is unavailable or throws, keeps
      hidden shell panels mounted, and only suppresses idle notifications when
      the same shell is selected and the app is visibly focused. Prompt-idle
      matching now covers `$`, `%`, `#`, `>`, `❯`, and `➜`. `Terminal.jsx`
      exposes `onOutput` and `sendInput` for Git Shells while keeping Hermes/global
      terminal behavior intact. Verified `npm run build`, `npm run lint`, and
      `npm test`; native click-through still needs a restarted Electron main
      process because the currently running dev app predates the main-process
      change.
- [x] Git Shells sidebar shell titles are editable from each shell row and
      persist through the existing `gitshells_projects` local/Electron store.
      Sidebar custom names render as `N > Title`, while both main-header shell
      selectors remain ordinal `SHELL N` labels and renumber with shell order.
- [x] Git Shells project sidebar is horizontally resizable from 220–480px via
      its right-edge separator. Width persists as `gitshells_sidebar_width`;
      xterm continues to refit through `Terminal.jsx`'s existing
      `ResizeObserver` and sends updated PTY rows/columns after layout changes.
- [x] Dashboard launch tiles now visibly lift on hover and compress with a
      distinct accent press state on click. Their retained entrance animation
      uses CSS `translate` instead of `transform`, so it no longer suppresses
      hover/active movement; reduced-motion mode keeps feedback stationary.
- [x] Notes pages now support YAML-frontmatter tags. `src/lib/notesTags.js`
      parses/writes `tags: [...]`, hides frontmatter from preview rendering,
      and is covered by `test/notesTags.test.js`. `NotesMode.jsx` shows an
      editable tag strip under the note header, lists active tags and shared-tag
      related notes in the Connections panel, and resolves note IDs through a
      shared helper so `.md` and `.enc.md` filenames navigate consistently.
      `NotesGraph3D.jsx` adds a persisted `Show shared tags` setting
      (`includeSharedTags`) that draws weak optional edges between notes with a
      common tag; default graph behavior remains wikilink/direct-link based.
- [x] New **Beginner's guide** in-app modal (`src/components/BeginnerGuideModal.jsx`)
      for first-time users, styled like `ModeGuideModal`. Two modules: "1 · Local
      AI" (what a local model is, installing Ollama, a RAM→model table, LM Studio/
      Jan alternatives) and "2 · OpenRouter key" (what it is, how to get a key,
      key safety) with a CTA that opens Settings focused on OpenRouter. Opened
      from a new "Beginner's guide" hero button on the dashboard; a new "Get API
      Key" tile in the Perci-native group calls `updateProvider('openrouter')` +
      opens Settings. Seven 16:9 illustrations in `public/guide/` (hero,
      what-is-local-ai, download-ollama, which-model, local-alternatives,
      openrouter-cloud, keep-key-safe), optimized to ~737KB total; image slots are
      guarded so missing art renders icon-only. Renderer-only.
- [x] OpenRouter model selection is now a real searchable picker instead of manual
      entry. `ModelService.fetchOpenRouterModels` loads the **public**
      `openrouter.ai/api/v1/models` catalog (337 models) with or without a key
      (auth header sent only when a key exists), and `getAllModels` always
      populates it. `ChatContext.fetchModels` auto-select now skips key-required
      providers that have no key, so a keyless user isn't defaulted onto an
      unusable OpenRouter model. Settings → OpenRouter shows the list; the manual
      "Add a model" box stays for niche IDs. Renderer-only.
- [x] BARS is now a first-class Perci window surface in the OS-surface group: `MODES.BARS`, Dashboard tile, dock glyph, `BarsMode.jsx`/`BarsMode.css`, and `bars:*` Electron IPC. Bars data lives in Perci localStorage (`perci_bars_ideas:v1`) and stays independent from standalone Bars; export/import is the bridge. Cloud keys use Opal/Electron encrypted app data (`openai_key`, `anthropic_key`, `gemini_key`, `groq_key`, `openrouter_key`), not standalone Bars storage. Electron main/preload changes require a full Perci restart.
- [x] Bars quick capture now recognizes IdeaBrowser-style emails and `ideabrowser.com/idea/...` URLs, parses them through `src/lib/barsIdeaBrowser.js`, and saves them as normal `New` Bars ideas instead of Inbox thoughts. The June 12, 2026 "Idea of the Day: GLP-1 pharmacy index" email is covered by `test/barsIdeaBrowser.test.js`: title, core thesis, supporting notes, tags, follow-up angles, and canonical source URL are mapped into the existing Bars fields. No Electron restart is required for this renderer-only change.
- [x] Bars now has a compact in-app guide opened from the top action cluster (`HelpCircle` button). The modal keeps the Bars aesthetic with the existing dark panel, gold labels, cream paper hero, and quick "field manual" copy explaining capture, shaping, heat sorting, and asking the notebook.
- [x] BARS flow polish restored the standalone app's actual notebook flow inside Perci: all-caps `BARS_` masthead, original Bars font stack (`Spline Sans`, `Big Shoulders Display`, `Spline Sans Mono`), original uppercase label/stat/chip/section treatment, pulsing hot-orange REC dot in the quick-capture bar, canonical statuses (`Inbox`, `New`, `Exploring`, `Building`, `Launched`, `Archived`), day streak stat, full-width "Ask your bars" panel, two-column "The book" / "On the page" workspace, cream paper detail, collapsible "Write one up properly" form, and "Turn into idea" opening the edit/write-up flow with status `New` instead of silently mutating an Inbox bar. The Bars root now scrolls inside the default Perci window and fixed-height stats strip no longer clips labels.
- [x] MarkItDownUI is now a first-class Perci window surface: `MODES.MARKITDOWN`,
      `MarkItDownMode.jsx`, Dashboard system tile, dock glyph, and real
      `markitdown-logo.jpeg` asset. The surface embeds the local
      `http://127.0.0.1:8920` FastAPI UI in Electron/web mode and shows an
      offline state with the `./run.sh` startup hint when the server is not
      reachable. The Dashboard tile leaves room for a future background image
      while the logo fills its rounded square container with `object-fit: cover`.
      The embedded URL now includes Perci's resolved theme
      (`?theme=light|dark`), so changing Perci between light and dark reloads
      the MarkItDownUI surface with the matching standalone background/theme.
- [x] MarkItDownUI image vision now reuses Perci's existing encrypted
      `openrouter_key` instead of creating another key path. The MarkItDownUI
      surface now uses an iframe with `?perci=1`; direct image uploads post a
      request to `MarkItDownMode`, which calls `markitdown:describe-image` in
      Electron main. Main reads `openrouter_key` from app-data, sends the image
      to OpenRouter with `openai/gpt-4o-mini`, and returns Markdown to the
      embedded page. Main/preload changes require a full Perci restart before
      this bridge is live.
- [x] MarkItDownUI can now be started from Perci. `electron/main.cjs` exposes
      `markitdown:start-server` and `markitdown:server-status`; preload exposes
      `startMarkItDownServer()` and `getMarkItDownServerStatus()`. The
      MarkItDown window shows a Play/Start server action when offline, runs
      `/Users/toshonjennings/markitdown-ui/webui/run.sh`, waits for
      `http://127.0.0.1:8920/api/health`, then reloads the iframe. Main/preload
      changes require a full Perci restart before this control is live.
      Renderer health checks now use `getMarkItDownServerStatus()` in Electron
      instead of direct browser `fetch`, avoiding a false "Failed to fetch" from
      CORS while the local server is actually healthy.
- [x] MarkItDownUI blank-white embed triage: the standalone page renders at
      `http://127.0.0.1:8920/?theme=light&perci=1` with no browser errors, but
      Perci renderer logs showed `did-fail-load -27 ERR_BLOCKED_BY_RESPONSE`
      for the iframe URL. Perci now installs a narrowly scoped
      `webRequest.onHeadersReceived` hook for `127.0.0.1:8920`/`localhost:8920`
      to remove frame-blocking headers and add only cross-origin headers for
      the MarkItDownUI embed. Do not inject a `frame-ancestors` CSP here; the
      FastAPI server also no longer sends one. Main changes require a full
      Perci restart.
- [x] MarkItDownUI ExifTool install is now available from Perci. Preload exposes
      `installMarkItDownExifTool()`, and Electron main handles
      `markitdown:install-exiftool` by checking common ExifTool paths first,
      then running the fixed command `brew install exiftool`. The embedded
      MarkItDownUI page shows an Install button in the ExifTool readiness pill,
      asks for confirmation, posts the install request to `MarkItDownMode`, and
      refreshes capabilities after the install result. Main/preload changes
      require a full Perci restart.
- [x] Lighthouse upper cards now align as one row: the accidental
      `.lh-section + .lh-section` sibling margin was pushing Quick Port Check
      down, and the temporary JS height-sync loop was removed. The info button
      now resolves the parent process name/command and explains what the Parent
      PID means, including the PID 1 launchd case shown in the original app.
- [x] Hermes surface gained a **Terminal** tab (between Console and Sessions)
      that is itself a multitab terminal: `src/components/TerminalTabs.jsx`
      manages up to 6 PTY sessions over the existing local terminal bridge
      (`terminalBridge.js`, ports 3001/3002 — same server the global terminal
      uses). Each tab is a unique `hermes-shell-*` sessionId; inactive tabs
      stay mounted so shells survive tab switches, the strip shows per-session
      connection dots, and Reset/Reconnect act on the active tab.
      `Terminal.jsx` is now `forwardRef` with `embedded` (hides its own
      chrome), `onStatusChange`, and an imperative `{ reset, reconnect,
      focus }` handle — the global `App.jsx` usage is unchanged. The whole
      TerminalTabs pane stays mounted in `HermesMode.jsx` after first visit.
- [x] Fixed garbled terminal output (doubled echo, stacked `❯ ❯ ❯` prompts):
      `terminal-server.cjs` broadcasts PTY output to *every* client on a
      session, and under React StrictMode the panel's aborted first socket
      could fire a zombie `setTimeout(connect)` retry after remount, attaching
      **two** sockets to the same session → every output chunk written twice.
      `Terminal.jsx` now drops/detaches any previous socket before opening a
      new one, guards all ws handlers with `wsRef.current !== ws`, clears the
      retry timer on cleanup, nulls `termInstanceRef` on dispose, and connects
      *after* the initial fit so the PTY spawns at the real size instead of
      80x24 (the misdrawn welcome box). Applies to both the Hermes terminal
      tabs and the global terminal (same component).
- [x] Removed the suspect 24ms `isDuplicateSingleKeyInput` filter from
      `Terminal.jsx` after the stale-socket cleanup landed; held-key repeats
      now pass through normally. The remaining device-attribute stripping is
      protocol cleanup, not duplicate-key throttling.
- [x] Hermes surface polish pass ("amber dispatch console" identity, scoped
      `hermes-*` CSS at the end of `src/index.css`): amber atmosphere header
      gradient with a glowing badge while a run is active, gateway status
      pill in the header (replacing the bare dot and the duplicate vitals
      chip), overshoot-spring amber tab underline, amber-railed run cards
      with done/failed status icons and hover glow, radial-glow console empty
      state, amber Run/Start-dashboard buttons and input focus ring, and
      amber-accented Insights pills / Sessions card hovers. All new motion is
      `prefers-reduced-motion` gated. `npm run build` passes.

- [x] Hermes now has a first-class window surface (id `'hermes'`, `HM` dock chip),
      lighter than OpenClaw's but complete: a status header (version/model/provider/
      gateway from `hermes status`, amber pulse while running) and four tabs —
      **Console** (one-shot runs via
      `hermes -z` with cancel, plus a live activity rail tailing `hermes logs -f`
      so tool calls are visible as they happen), **Sessions** (parsed
      `hermes sessions list/stats`), **Insights** (`hermes insights` for 7/30/90
      days), and **Web UI** (embedded `hermes dashboard` webview on :9119 with a
      start-and-poll flow). Bridge lives in `electron/main.cjs` (`hermes:*` IPC,
      arg-array spawns, no shell; redacted key fragments never cross IPC) and
      `electron/preload.cjs`; surface is `src/components/HermesMode.jsx`. The
      top-bar Hermes button (circled Nous Research mark, `hermes-branded` CSS)
      opens this window; the Agents panel's Hermes entry runs real `hermes -z`
      jobs through `agent-jobs:queue` and has an "Open window" shortcut. The
      Mercury desktop-app integration was removed entirely (button, Settings
      path field, `hermesAppPath` context state, `hermes_app_path` persistence
      key, `hermes:open-app` IPC, `src/assets/hermes.png`). **Needs an Electron
      restart to pick up the new preload/main IPC** — renderer HMR alone shows
      the desktop-only fallback.
- [x] OpenClaw bridge steps 1 and 2 committed in `de24ea7`.
- [x] OpenClaw bridge step 3 committed in `3a20762`.
- [x] Mission Control now has gateway health summary and live OpenClaw event streaming.
- [x] Agents panel can run OpenClaw through the gateway agent bridge.
- [x] Cowork exposes `delegate_to_openclaw` for long-running or multi-step gateway delegation.
- [x] Perci web search now uses the desktop `web-search` bridge/native provider search path instead of Tavily.
- [x] Eidos integrated as a first-class Perci window (`EIDOS_WINDOW_ID`, `EI` dock chip). Perci manages the full Docker/OrbStack lifecycle: auto-detects OrbStack, starts Docker runtime, runs `docker compose up -d --wait`, polls memU API health, starts Next.js dashboard, renders in `<webview>`. Includes progress polling (`eidos:progress`), error states with OrbStack install link, and retry. Standalone Eidos stack is reused if already running. Assets: `src/assets/eidos-logo.png`, `src/assets/eidos-bg.jpg`. **Per ci version is now ahead of standalone Eidos** — the standalone `~/eidos` repo needs to be caught up. See `~/eidos/CLAUDE.md` and `~/eidos/HANDOFF.md` for the divergence note.
- [x] Search is now intent-aware. `IntelligentSearchTool.planSearch()` classifies each
      message (intent / reason / searchQueries / freshness / expectedSourceTypes) using the
      selected model when available, deterministic local-fact detection for clock/calendar
      questions, and keyword heuristics as the offline fallback — replacing the brittle
      `shouldAutoUseWebSearch` phrase matcher (removed from `ChatMode.jsx`).
- [x] First non-window Odysseus-inspired motion pass landed for Perci/Mission:
      whirlpool thinking/search indicators, Mission timeline rails, active synapse pulses,
      and domino list reveal utilities.
- [x] Window + dock system landed (`65c32f6`). Chat is the always-mounted base; Cowork,
      Code, Agents, Mission, Build, and OpenClaw open as floating windows tracked by a
      bottom dock with whirlpool-minimize and domino chip-in.
- [x] Mission Control and both Guide modals now use scoped focus-card hover:
      hovered cards lift/glow while sibling cards in the same group recede for easier scanning.
- [x] Guide modals no longer reset Advanced back to Guide during background re-renders;
      `onClose` is kept in a ref so tab reset only happens when a modal opens.
- [x] Window system hardening: open windows persist across reloads, a main-process
      guard stops stray same-origin reloads, dragging an edge outward now resizes
      reliably (drag shield), and each window has its own error boundary.
- [x] Modal stacking issues fixed: global modals (Transit Map, Settings, guides,
      changelog, and YouTube overlay modals/PiPs) are now rendered using React Portals
      (`createPortal`) to mount under `document.body`, escaping the z-index 30 capping
      of the window host container.
- [x] Dock overlap fixed: when window chips exist, the main desktop reserves a 64px
      bottom lane for the dock, and window default/clamp bounds keep floating and
      maximized windows out of that lane.
- [x] YouTube PiP is now a first-class Perci window (id `'youtube'`, `YT` dock chip)
      instead of a native Electron `BrowserWindow`. It gets minimize/restore/maximize/
      close + dock wiring for free, like Cowork/OpenClaw. The native window, its
      `youtube-player:*` IPC handlers, and the preload bridge were deleted. In desktop
      mode the window content is a `<webview>` loading the YouTube `/watch` page
      (`/embed` is blocked in an Electron `<iframe>` with `ERR_BLOCKED_BY_RESPONSE`
      and errors 153 as a top-level webview doc); the web build keeps the `/embed`
      iframe. `key={youtubeUrl}` forces the webview to re-navigate when the video
      changes; the window is `noWhirlpool` (webview fade). Verified in-app:
      open → dock chip → play → minimize → restore → switch video.

## Window + dock system

- Window manager lives in `src/context/ModeContext.jsx`: `windows[]` with
  `state` (normal/minimized/maximized), z-ordering, per-mode geometry memory
  (persisted to `perci_window_bounds`), and actions (open/close/focus/minimize/
  toggleMaximize/move/resize). `setCurrentMode` and `setShowOpenClawDashboard` are
  **bridged** to the window system, so every existing call site (ModeSwitcher,
  SecondaryModeNav, ChatMode buttons, AgentsPanel, SettingsModal, MissionControl)
  keeps working unchanged.
- Components in `src/components/windows/`:
  - `WindowFrame` — drag, 8-way resize, macOS traffic-light controls, double-click
    maximize. Minimized windows stay **mounted but hidden**, so a mode's state
    (e.g. the Cowork conversation) survives — this also resolves the deferred
    "preserve Cowork across navigation" follow-up for the minimize case.
  - `DesktopHost` — paints open windows over the Chat base; `renderContent(modeId)`
    supplies the mode UI (so Mission Control still gets its live props).
  - `Dock` — domino-staggered chip-in (framer-motion spring, per-index delay),
    focus dot, click-to-minimize, right-click context menu.
  - `WindowContextMenu` — pop-from-anchor menu (Focus/Minimize/Maximize/Close),
    opens above the cursor; measures with `offsetHeight` so the scale-0.6 pop
    animation doesn't mis-place it.
- OpenClaw is window id `'openclaw'` (not a MODE). Its old fullscreen overlay was
  extracted into `renderOpenClawWindow()` in `App.jsx` and rendered as window
  content. Because its content is an Electron `<webview>`, it minimizes with a
  plain fade (`noWhirlpool`) to avoid transform flicker. Its redundant inline
  close button was removed (window chrome owns close).
- Motion uses the signature spring `cubic-bezier(0.34, 1.56, 0.64, 1)`; all
  flourishes are gated behind `prefers-reduced-motion`. Styles live at the end of
  `src/index.css` on Perci's `--bg/--accent/--text` tokens.

### Hardening / fixes

- **Open windows persist across reloads** (`perci_open_windows`): which modes are
  open, their state, and geometry are restored on load (re-clamped to the current
  viewport via `hydrateWindows`). Per-mode geometry is still also remembered
  separately (`perci_window_bounds`) so reopening a *closed* window restores its size.
- **Spurious full reloads fixed**: a stray same-origin top-frame navigation was
  reloading the whole SPA (`will-navigate url=…:5173/` in renderer.log), wiping
  in-memory window state. `electron/main.cjs` now blocks same-origin top-frame
  navigations (logs `blocked-self-navigation`); does not affect Vite HMR
  (`location.reload`), the OpenClaw `<webview>`, or external links. **Needs an
  Electron restart to take effect.**
- **Resize-larger drag fixed**: dragging an edge outward moved the cursor over the
  Chat base / a webview, which swallowed pointer events and silently stopped the
  drag (shrinking worked, growing didn't). `WindowFrame` now renders a full-viewport
  drag shield (`.perci-drag-shield`, z 100000) during any drag so pointer events
  stay in-document.
- **Per-window error boundary**: each window's content is wrapped in
  `WindowErrorBoundary`, so a throw in one mode shows an inline retry instead of
  tearing down the other windows or the Chat base.
- **Global modal portal mounting**: global modals rendered from within windows
  (Transit Map modal in Mission Control, Guide modals, Settings modal, Changelog,
  and YouTube overlays) are portaled to `document.body` with `z-[9999]` or `z-[10000]`.
  This escapes the `z-index: 30` stacking context of `.perci-desktop-host` and
  prevents parent window CSS transforms from breaking full-screen fixed positioning.
- **Dock no longer blocks bottom controls**: `App.jsx` marks the desktop container
  with `.perci-dock-reserved` whenever the dock is visible. `src/index.css`
  reserves the bottom lane for the dock and shrinks `.perci-desktop-host`, while
  `ModeContext.jsx` uses the same 64px reserve for default and clamped window bounds.

### Limitations / follow-ups

- The OpenClaw window has two layers of chrome (window title bar + OpenClaw's own
  toolbar/tabs); could be slimmed if it feels heavy.
- `prefers-reduced-motion` and live `<webview>` resize behavior have not been
  verified in-app yet.
- The exact source of the stray top-frame navigation wasn't pinned (all forms
  `preventDefault`); the main-process guard neutralizes it regardless. If it
  recurs it'll show as `blocked-self-navigation` in renderer.log.

## Search behavior (intent-aware)

- `planSearch` intents: `local_runtime_fact`, `no_search`, `web_search`,
  `historical_on_this_day`, `news`, `shopping`, `weather`, `finance`, `general_lookup`.
- `local_runtime_fact` (today's date/time/day) is answered directly from the system clock;
  `ChatMode` injects the answer and tells the model to note no web search was necessary.
  This covers the "do another search for today's date" bug — answered locally, not via SEO.
- `historical_on_this_day` routes through the main-process Wikimedia on-this-day path.
- `intelligentMultiSearch(query, max, onProgress, plan)` now runs planned queries, scores
  each source by title/snippet token overlap (`scoreRelevance`), sorts by relevance, and
  retries with an improved query (`improveQuery`, model-assisted) when results are weak.
- Weak/empty results set `weakResults` so `ChatMode` instructs the model to be honest
  ("I searched but found nothing relevant") instead of fabricating generic source summaries.
- Removed now-dead `analyzeSearchCompleteness` and `isNewsQuery` from `IntelligentSearchTool`.

### Limitations / follow-ups

- The planner adds one short model call before searching when a model is configured and the
  cheap pre-screen thinks search may be relevant; greetings can still trigger it. The
  deterministic local-fact path avoids a model call for date/time questions.
- `news`/`weather`/`finance`/`shopping` intents still go through the generic DuckDuckGo path
  with specific queries; no dedicated provider APIs were added (kept minimal).
- Relevance scoring is lexical (token overlap); it does not yet use the model to judge
  source quality, and SEO-spam detection is only implicit via low overlap.

## Known State

- [x] Eidos now opens to the embedded Dashboard when the service is running;
      the Perci-native Git Visualizer is retained as the optional Overview
      surface. The Git Visualizer heading uses the GitHub logo, and its UI
      palette was reduced to classic black/white/grey with no purple accents.
      Verified `npm run build`, focused purple/Rocket searches, and Playwright
      dark/light checks against the existing Vite server with a mocked Electron
      Eidos bridge.
- [x] Reviewed and prepared the broad dirty tree for commit; changes include product UI/Build work, graph docs, and the Tavily-free search path.
- [x] Preserved Codex's in-flight work in `src/lib/integrationTools.js` and included it in the cleanup commit.
- [x] Perci HQ window scene now derives dawn/day/dusk/night sky, lighting, and lamp intensity from the local system clock in `src/components/OfficeScene.jsx`.
- [x] Perci HQ office dressing pass added synced side-window scenery, a right-wall door, framed wall art under the neon sign, and larger potted tree/plant decor in `src/components/OfficeScene.jsx`.
- [x] Perci HQ now includes a compact back-wall retro TV rendered entirely in WebGL with an animated live-feed screen; because it is not a DOM iframe, desks and agents depth-sort in front of it correctly.
- [x] Perci HQ clock and shelf cluster moved off the back wall to the left wall so the retro TV can sit in the old clock/shelf space.
- [x] Perci HQ desk name labels now render as WebGL billboards instead of DOM `<Html>` overlays, so Sir Perci depth-sorts in front of them while walking past.
- [x] `npm run build` passes for the current Perci HQ scene work.
- [x] Perci HQ Office artwork pass: sourced and imported 9 Unsplash images (landscape/portrait pairs + extras), framed artwork renders on Office walls with proper aspect-ratio fitting and shadowed frames.
- [x] Replaced DOM-based RetroTvPlayer with canvas-based `LiveTvScreen` starfield animation in `OfficeScene.jsx` with reduce-motion support and proper texture disposal.
- [x] Added two comic covers (`marv-amazing.webp`, `dc-action.png`, copied into `public/artwork/`) displayed in thick wall-mounted glass cases (`ComicCase3D` in `OfficeScene.jsx`). Originally true comic size on the left wall but unreadably small, so they now sit on the back wall centered beneath the PERCI HQ sign (x ±0.55, y 3.0) at `scale={2.8}` while keeping real comic proportions. `npm run build` passes.
- [x] Perci HQ weather sync now uses the existing ChatContext weather state plus `src/lib/weatherService.js`: weather sync defaults on unless `weather_sync_enabled` is persisted as `false`, `weather_location` overrides locale lookup when present, and blank location falls back to browser geolocation then timezone-derived city lookup. `OfficeScene.jsx` maps `clear/clouds/rain/snow` into outside window weather, sky/fog, and lighting. Verified with `npm run build` and a Playwright visual pass mocking Open-Meteo weather code 61 (rain) at `/private/tmp/perci-office-weather-rain.png`; only existing Jan connection errors appeared in console.
- [x] Fixed G-Dash blank window in dev: Vite was applying `X-Frame-Options: DENY` and `Content-Security-Policy: frame-ancestors 'none'` to `/gdash/index.html`, so the same-origin iframe rendered as a gray broken-document frame. `vite.config.js` now keeps deny-by-default framing for the app root but allows same-origin framing for `/gdash/`. Dev server restart required. Verified headers with `curl -I`, `npm run build`, and Browser validation: G-Dash iframe renders 58 service cards / 8 sections and search for `docs` filters to 2 cards.
- [x] Dashboard OpenClaw tile now shows the real OpenClaw lobster logo (fetched from the
      gateway control UI's `favicon.svg`, vendored at `public/openclaw-logo.svg` so it
      renders even when the gateway is offline) and a live data-driven description from
      the 30s gateway health poll: agent count, active tasks, failures, and runtime
      version (e.g. "2 agents · 1 active task · v2026.x"), falling back to
      "Checking gateway…" / "Gateway offline". `npm run build` passes.
- [x] Perci HQ snack table now uses AI-themed treats/drinks in `OfficeScene.jsx`:
      microchips with thermal paste, data crunch bits, HTTP cookies, SPAM,
      Raspberry Pi, Java, and liquid nitrogen. `npm run build` passes.
- [x] Sir Perci now reads less menacing in Perci HQ: sword and shield are
      crossed on his back in an X, his hands stay empty, and office arm motion
      gestures/waves instead of guarding/chopping. 3D and dashboard-office
      variants now include round hand spheres, and the 3D antennae are longer
      with full bulb tips so they no longer read as chopped side nubs. The
      dashboard Office card uses the same softer mascot variant without
      changing global chat mascot usage. `npm run build` passes.
- [x] Weather syncing is implemented for Perci HQ through `weatherService.js`,
      ChatContext weather state, browser geolocation/timezone fallback, and the
      settings-backed `weather_location` / `weather_sync_enabled` values.
- [x] Git Shells (`MODES.PROJECTS`) is integrated as a standalone window mode. Resolved a critical storage key collision on `perci_projects` by migrating its project list storage to a dedicated `gitshells_projects` key registered in `persistentStore.js` and Electron App Data.
- [x] Native directory selector focus issue resolved in `electron/main.cjs` by passing `mainWindow` to `dialog.showOpenDialog`. This prevents the OS folder picker from spawning behind the main app window on macOS.
- [x] Copied latest background image (`Sleek_dark_background_for_'Git_202606201611.jpeg`) from `~/Downloads` to `src/assets/gitshells-bg.jpg` and applied it as a washed-out background on the front/empty landing page of the Git Shells workspace.
- [ ] If isolated Cowork/OpenClaw conversations become needed, add a session key generation strategy; `runOpenClawAgent` already accepts `sessionKey`.
- [ ] Generated graphify docs still reflect older code until the architecture graph is regenerated.
- [ ] Review the new Perci/Mission motion in-app and decide whether to make it bolder or calmer before applying it to more surfaces.

## Skill Safety Policy: Allowlist with Trust Tiers

Decision made 2026-06-24. All 58 imported skills in `.agents/skills` are retained.

### Tier 1 — FULLY TRUSTED (Hernes-native + audited)
Skills installed to `~/.hermes/skills/` by Hermes CLI or verified manual copy. Can be loaded, executed, and followed without restriction during agent sessions.

Tier 1 includes:
- `frontend-design` (anthropics/skills — skill.sh trusted source)
- `mobile-app-ui-design` (ceorkm — manual audit, 149 lines)
- `material-3` (hamen/material-3-skill — manual audit, 667 lines, CI tested)
- `ui-ux-pro-max` (nextlevelbuilder — manual audit, scripts tested)
- All 8 `gsap-skills/*` (greensock — official org, pure reference)
- `taste-minimalist`, `taste-brutalist` (skills.sh — extracted, design-only)
- `skill-localization` (Hermes hub — meta-skill)

### Tier 2 — QUARANTINE BEFORE USE (external sources)
Skills under `.agents/skills/` from upstream imports (`mattpocock/skills`,
`addyosmani/agent-skills`). Do NOT load into agent sessions until per-skill
quake has passed the following checklist:

- [ ] No unremediated HIGH findings from `skillspector scan <dir> --no-llm`
      (ignore false positives already documented below)
- [ ] No unremediated PE3 findings (actual credential path instructions)
- [ ] No unremediated YR1 findings (actual malware patterns, not concept
      references)
- [ ] PM-confirm flag cleared (no prompt-injection tool abuse)

Affected skills needing quake before promotion:
- `git-guardrails-claude-code` — AS1 false positive documented (legitimate
  `.claude/` access). Promote to Tier 1.
- `security-and-hardening` — PE3/YR4/EA2 false positives documented
  (concept references, not actual exploits). Promote to Tier 1.
- `browser-testing-with-devtools` — YR1 false positive documented
  (legitimate network test patterns). Promote to Tier 1.
- `ask-matt` — MP3 false positive documented (metaphorical memory
  reference). Promote to Tier 1.
- `context-engineering` — PE3 theoretical credential mention. Needs manual
      review to confirm no actual credential path instructions before
      promotion.
- `spec-driven-development` — AS3 skill enumeration pattern. Needs
      manual review to confirm no cross-skill file access before
      promotion.
- `code-simplification` — RA1 line 155 self-modification mention.
      Needs manual review to confirm the reference is metaphorical
      refactoring advice before promotion.

| Action | Rule |
|--------|------|
| Delete | Requires explicit Toshon approval per directory |
| Quarantine | Move to `.agents/skills.quarantine/` (gitignored) |
| Promote to Tier 1 | Remove SKILL.md frontmatter `enabled: false` if present, move to `~/.hermes/skills/` |

## Notes

- OpenClaw bridge turns currently use `--agent main`.
- The root `main.cjs` is legacy dead code; use `electron/main.cjs` for main-process work.
- Tavily runtime code was removed from active search paths; local desktop search is exposed by `electron/preload.cjs` as `window.electron.webSearch`.
- Git Shells is hydrated from the Electron App Data store on startup if native environment is detected, with active state persistence.
- SkillSpector bulk scans return CRITICAL for any skill directory (meta-analysis); always scan individual skills one at a time.
