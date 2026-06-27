# Perci Change Story (v0.28.1..HEAD)

Generated: 2026-06-24T02:34:17.452Z

Analyzed 2 commits, 135 changed file entries, 18408 additions, and 256 deletions.
GitHub compare: https://github.com/toshon-jennings/perci/compare/v0.28.1...HEAD
Graphify context: 423 nodes and 418 links from `/Users/toshonjennings/opal/docs/architecture/graphify-out/graph.json`.
Graphify coverage: 8/21 changed renderer code files matched the local index.
Graphify refresh recommended: 13 changed renderer code files were not in the current index. Run `graphify update docs/architecture/graphify-out` for a sharper architectural story.

## Narrative Read

This range reads as a broad Perci workspace expansion: Skills and Coding Expert Stack, Eidos embedded memory surface, Ensemble mode, and Electron IPC and desktop bridge.
The strongest first-class app signals are Wires ENSEMBLE, Wires MARKITDOWN, Defines ENSEMBLE, Defines MARKITDOWN, Wires BARS, and Wires CONCERNS; those indicate routing and desktop bridge work, not just isolated component files.
Validation evidence appears in Added ensemble tests and Adds executable assertions.
Graphify currently explains part of this story, but 13 changed renderer files are not in the local index yet; refresh Graphify before treating architecture-community labels as complete.

## Story Episodes

### Skills and Coding Expert Stack

Skills and Coding Expert Stack touched 89 added files. Detected signals include Added Skills Mode, Defines SkillsMode, Exports SkillsMode.

Evidence: 1 commit, 89 files, +13350/-0. Confidence: medium.

Detected changes:
- Added Skills Mode — New first-class mode component file.
- Defines SkillsMode — React component/function detected.
- Exports SkillsMode — React component export detected.
- Persists __codingExpertStack — Persistent storage key appears in added lines.
- Adds visual styling hooks — .skills-root, .skills-scroll, .skills-inner, .skills-header, .skills-header-left, .skills-refresh-btn

Key files:
- `src/components/SkillsMode.css` (A, +918/-0)
- `src/components/SkillsMode.jsx` (A, +818/-0)
- `.agents/skills/security-and-hardening/SKILL.md` (A, +461/-0)
- `.agents/skills/ci-cd-and-automation/SKILL.md` (A, +390/-0)
- `.agents/skills/test-driven-development/SKILL.md` (A, +383/-0)
- `.agents/skills/code-review-and-quality/SKILL.md` (A, +381/-0)
- `skills-lock.json` (A, +353/-0)
- `.agents/skills/performance-optimization/SKILL.md` (A, +350/-0)

Commits:
- 2026-06-23 ([0f11a2f](https://github.com/toshon-jennings/perci/commit/0f11a2f51205c9230be186859bfd499aa8c46975)): feat: add Ensemble, MarkItDown, and Skills modes; Mission Control fix; Localhost improvements

### Visual assets and styling

Visual assets and styling touched 7 added, 2 changed files. Detected signals include Adds ensemble-bg-dark.jpeg, Adds ensemble-bg-light.jpeg, Adds localhost-bg.jpeg.

Evidence: 2 commits, 9 files, +1647/-0. Confidence: medium.

Detected changes:
- Adds ensemble-bg-dark.jpeg — Visual asset included in the product surface.
- Adds ensemble-bg-light.jpeg — Visual asset included in the product surface.
- Adds localhost-bg.jpeg — Visual asset included in the product surface.
- Adds markitdown-bg.jpeg — Visual asset included in the product surface.
- Adds markitdown-logo.jpeg — Visual asset included in the product surface.
- Adds visual styling hooks — .dash-tile-lighthouse, .dash-tile-logo, .dash-tile-icon
- Adds visual styling hooks — .eidos-front-root, .eidos-front-bg, .eidos-front-orb, .eidos-front-orb-main, .eidos-front-orb-side, .eidos-front-grid
- Adds visual styling hooks — .skills-root, .skills-scroll, .skills-inner, .skills-header, .skills-header-left, .skills-refresh-btn

Key files:
- `src/components/SkillsMode.css` (A, +918/-0)
- `src/components/EidosMode.css` (A, +683/-0)
- `src/index.css` (M, +32/-0)
- `src/components/DashboardMode.css` (M, +14/-0)
- `src/assets/ensemble-bg-dark.jpeg` (A, +0/-0)
- `src/assets/ensemble-bg-light.jpeg` (A, +0/-0)
- `src/assets/localhost-bg.jpeg` (A, +0/-0)
- `src/assets/markitdown-bg.jpeg` (A, +0/-0)

Commits:
- 2026-06-23 ([50268d8](https://github.com/toshon-jennings/perci/commit/50268d89c3916767f48462a9d29ceb059a92852c)): feat(browser): add bookmarks, omnibox, find in page, and SSL bypass
- 2026-06-23 ([0f11a2f](https://github.com/toshon-jennings/perci/commit/0f11a2f51205c9230be186859bfd499aa8c46975)): feat: add Ensemble, MarkItDown, and Skills modes; Mission Control fix; Localhost improvements

### Eidos embedded memory surface

Eidos embedded memory surface touched 1 added, 1 changed files. Detected signals include Defines KpiCard, Adds visual styling hooks.

Evidence: 1 commit, 2 files, +1118/-36. Confidence: high.

Detected changes:
- Defines KpiCard — React component/function detected.
- Adds visual styling hooks — .eidos-front-root, .eidos-front-bg, .eidos-front-orb, .eidos-front-orb-main, .eidos-front-orb-side, .eidos-front-grid

Key files:
- `src/components/EidosMode.css` (A, +683/-0)
- `src/components/EidosMode.jsx` (M, +435/-36)

Commits:
- 2026-06-23 ([0f11a2f](https://github.com/toshon-jennings/perci/commit/0f11a2f51205c9230be186859bfd499aa8c46975)): feat: add Ensemble, MarkItDown, and Skills modes; Mission Control fix; Localhost improvements

### Ensemble mode

Ensemble mode touched 5 added files. Detected signals include Added Ensemble Mode, Exports buildContextBlock(), Exports buildResponsesBlock().

Evidence: 1 commit, 5 files, +1111/-0. Confidence: medium.

Detected changes:
- Added Ensemble Mode — New first-class mode component file.
- Exports buildContextBlock() — Shared library API export detected.
- Exports buildResponsesBlock() — Shared library API export detected.
- Exports createStreamModel() — Shared library API export detected.
- Exports DEFAULT_ENSEMBLE_PROMPTS — Shared library constant export detected.
- Exports ENSEMBLE_CONFIG_KEY — Shared library constant export detected.
- Exports MAX_PANEL_MODELS — Shared library constant export detected.
- Exports modelKey() — Shared library API export detected.

Key files:
- `src/components/EnsembleMode.jsx` (A, +665/-0)
- `src/lib/ensemble.js` (A, +288/-0)
- `test/ensemble.test.js` (A, +158/-0)
- `src/assets/ensemble-bg-dark.jpeg` (A, +0/-0)
- `src/assets/ensemble-bg-light.jpeg` (A, +0/-0)

Commits:
- 2026-06-23 ([0f11a2f](https://github.com/toshon-jennings/perci/commit/0f11a2f51205c9230be186859bfd499aa8c46975)): feat: add Ensemble, MarkItDown, and Skills modes; Mission Control fix; Localhost improvements

### Electron IPC and desktop bridge

Electron IPC and desktop bridge touched 2 changed files. Detected signals include Handles eidos:insights, Handles markitdown:describe-image, Handles markitdown:install-exiftool.

Evidence: 2 commits, 2 files, +1071/-0. Confidence: high.

Detected changes:
- Handles eidos:insights — Electron main-process IPC handler added.
- Handles markitdown:describe-image — Electron main-process IPC handler added.
- Handles markitdown:install-exiftool — Electron main-process IPC handler added.
- Handles markitdown:server-status — Electron main-process IPC handler added.
- Handles markitdown:start-server — Electron main-process IPC handler added.
- Handles skills:detect-agents — Electron main-process IPC handler added.
- Handles skills:get-coding-expert-status — Electron main-process IPC handler added.
- Handles skills:get-installed — Electron main-process IPC handler added.

Key files:
- `electron/main.cjs` (M, +1054/-0)
- `electron/preload.cjs` (M, +17/-0)

Commits:
- 2026-06-23 ([50268d8](https://github.com/toshon-jennings/perci/commit/50268d89c3916767f48462a9d29ceb059a92852c)): feat(browser): add bookmarks, omnibox, find in page, and SSL bypass
- 2026-06-23 ([0f11a2f](https://github.com/toshon-jennings/perci/commit/0f11a2f51205c9230be186859bfd499aa8c46975)): feat: add Ensemble, MarkItDown, and Skills modes; Mission Control fix; Localhost improvements

### Localhost browser mode

Localhost browser mode touched 1 added, 1 changed files. Detected signals include Wires LIGHTHOUSE, Defines LocalhostTab, Adds localhost-bg.jpeg.

Evidence: 2 commits, 2 files, +694/-101. Confidence: high.

Detected changes:
- Wires LIGHTHOUSE — New mode reference appears in added lines.
- Defines LocalhostTab — React component/function detected.
- Adds localhost-bg.jpeg — Visual asset included in the product surface.

Key files:
- `src/components/LocalhostMode.jsx` (M, +694/-101)
- `src/assets/localhost-bg.jpeg` (A, +0/-0)

Commits:
- 2026-06-23 ([50268d8](https://github.com/toshon-jennings/perci/commit/50268d89c3916767f48462a9d29ceb059a92852c)): feat(browser): add bookmarks, omnibox, find in page, and SSL bypass
- 2026-06-23 ([0f11a2f](https://github.com/toshon-jennings/perci/commit/0f11a2f51205c9230be186859bfd499aa8c46975)): feat: add Ensemble, MarkItDown, and Skills modes; Mission Control fix; Localhost improvements

### MarkItDown surface

MarkItDown surface touched 3 added files. Detected signals include Added Mark It Down Mode, Defines MarkItDownMode, Exports MarkItDownMode.

Evidence: 1 commit, 3 files, +349/-0. Confidence: high.

Detected changes:
- Added Mark It Down Mode — New first-class mode component file.
- Defines MarkItDownMode — React component/function detected.
- Exports MarkItDownMode — React component export detected.
- Adds markitdown-bg.jpeg — Visual asset included in the product surface.
- Adds markitdown-logo.jpeg — Visual asset included in the product surface.

Key files:
- `src/components/MarkItDownMode.jsx` (A, +349/-0)
- `src/assets/markitdown-bg.jpeg` (A, +0/-0)
- `src/assets/markitdown-logo.jpeg` (A, +0/-0)

Commits:
- 2026-06-23 ([0f11a2f](https://github.com/toshon-jennings/perci/commit/0f11a2f51205c9230be186859bfd499aa8c46975)): feat: add Ensemble, MarkItDown, and Skills modes; Mission Control fix; Localhost improvements

### Docs, release notes, and project continuity

Docs, release notes, and project continuity touched 3 changed files.

Evidence: 2 commits, 3 files, +246/-3. Confidence: high.

Key files:
- `HANDOFF.md` (M, +224/-0)
- `CHANGELOG.md` (M, +20/-1)
- `package.json` (M, +2/-2)

Commits:
- 2026-06-23 ([50268d8](https://github.com/toshon-jennings/perci/commit/50268d89c3916767f48462a9d29ceb059a92852c)): feat(browser): add bookmarks, omnibox, find in page, and SSL bypass
- 2026-06-23 ([0f11a2f](https://github.com/toshon-jennings/perci/commit/0f11a2f51205c9230be186859bfd499aa8c46975)): feat: add Ensemble, MarkItDown, and Skills modes; Mission Control fix; Localhost improvements

### Mission Control and validation history

Mission Control and validation history touched 1 changed file. Graphify matched 1 changed renderer file, so this is tied to indexed architecture rather than only path names. Detected signals include Defines RunContextMenu.

Evidence: 1 commit, 1 file, +109/-99. Confidence: high.
Graphify signal: 1 indexed file, 1 graph node, communities 3.
Indexed symbols/files: `components/MissionControl.jsx`.

Detected changes:
- Defines RunContextMenu — React component/function detected.

Key files:
- `src/components/MissionControl.jsx` (M, +109/-99)

Commits:
- 2026-06-23 ([0f11a2f](https://github.com/toshon-jennings/perci/commit/0f11a2f51205c9230be186859bfd499aa8c46975)): feat: add Ensemble, MarkItDown, and Skills modes; Mission Control fix; Localhost improvements

### Tests and validation harnesses

Tests and validation harnesses touched 1 added file. Detected signals include Added ensemble tests, Adds executable assertions.

Evidence: 1 commit, 1 file, +158/-0. Confidence: high.

Detected changes:
- Added ensemble tests — New focused test coverage.
- Adds executable assertions — labels responses A, B, … Z, AA; fills template placeholders; builds a context block, fencing files by path and skipping empties; anonymises panel responses by default

Key files:
- `test/ensemble.test.js` (A, +158/-0)

Commits:
- 2026-06-23 ([0f11a2f](https://github.com/toshon-jennings/perci/commit/0f11a2f51205c9230be186859bfd499aa8c46975)): feat: add Ensemble, MarkItDown, and Skills modes; Mission Control fix; Localhost improvements

### Mode routing and desktop window system

Mode routing and desktop window system touched 6 changed files. Graphify matched 4 changed renderer files, so this is tied to indexed architecture rather than only path names. Detected signals include Wires ENSEMBLE, Wires MARKITDOWN, Defines ENSEMBLE.

Evidence: 2 commits, 6 files, +73/-11. Confidence: high.
Graphify signal: 4 indexed files, 4 graph nodes, communities 6, 26, 35, 43.
Indexed symbols/files: `App.jsx`, `components/ModeSwitcher.jsx`, `components/windows/Dock.jsx`, `context/ModeContext.jsx`.

Detected changes:
- Wires ENSEMBLE — New mode reference appears in added lines. (5 files)
- Wires MARKITDOWN — New mode reference appears in added lines. (4 files)
- Defines ENSEMBLE — Mode enum-style entry appears in added lines.
- Defines MARKITDOWN — Mode enum-style entry appears in added lines.
- Wires BARS — New mode reference appears in added lines.
- Wires CONCERNS — New mode reference appears in added lines.
- Wires LIGHTHOUSE — New mode reference appears in added lines.
- Exports SKILLS_WINDOW_ID — Shared library constant export detected.

Key files:
- `src/components/ModeIcons.jsx` (M, +28/-0)
- `src/components/DashboardMode.jsx` (M, +17/-8)
- `src/App.jsx` (M, +18/-2)
- `src/context/ModeContext.jsx` (M, +6/-0)
- `src/components/ModeSwitcher.jsx` (M, +2/-1)
- `src/components/windows/Dock.jsx` (M, +2/-0)

Commits:
- 2026-06-23 ([50268d8](https://github.com/toshon-jennings/perci/commit/50268d89c3916767f48462a9d29ceb059a92852c)): feat(browser): add bookmarks, omnibox, find in page, and SSL bypass
- 2026-06-23 ([0f11a2f](https://github.com/toshon-jennings/perci/commit/0f11a2f51205c9230be186859bfd499aa8c46975)): feat: add Ensemble, MarkItDown, and Skills modes; Mission Control fix; Localhost improvements

### Shared renderer libraries

Shared renderer libraries touched 2 added files. Detected signals include Exports CAVEMAN_LEVELS, Exports cavemanDirective(), Exports PONYTAIL_LEVELS.

Evidence: 1 commit, 2 files, +88/-0. Confidence: high.

Detected changes:
- Exports CAVEMAN_LEVELS — Shared library constant export detected.
- Exports cavemanDirective() — Shared library API export detected.
- Exports PONYTAIL_LEVELS — Shared library constant export detected.
- Exports ponytailDirective() — Shared library API export detected.

Key files:
- `src/lib/caveman.js` (A, +44/-0)
- `src/lib/ponytail.js` (A, +44/-0)

Commits:
- 2026-06-23 ([50268d8](https://github.com/toshon-jennings/perci/commit/50268d89c3916767f48462a9d29ceb059a92852c)): feat(browser): add bookmarks, omnibox, find in page, and SSL bypass

### Renderer components

Renderer components touched 3 added files. Detected signals include Defines CavemanDropdown, Defines LevelDropdown, Defines PonytailDropdown.

Evidence: 1 commit, 3 files, +80/-0. Confidence: high.

Detected changes:
- Defines CavemanDropdown — React component/function detected.
- Defines LevelDropdown — React component/function detected.
- Defines PonytailDropdown — React component/function detected.

Key files:
- `src/components/LevelDropdown.jsx` (A, +50/-0)
- `src/components/CavemanDropdown.jsx` (A, +15/-0)
- `src/components/PonytailDropdown.jsx` (A, +15/-0)

Commits:
- 2026-06-23 ([50268d8](https://github.com/toshon-jennings/perci/commit/50268d89c3916767f48462a9d29ceb059a92852c)): feat(browser): add bookmarks, omnibox, find in page, and SSL bypass

### Repository maintenance

Repository maintenance touched 4 added, 1 changed files.

Evidence: 2 commits, 5 files, +23/-2. Confidence: medium.

Key files:
- `.codebase-memory/artifact.json` (A, +11/-0)
- `config/mcporter.json` (A, +7/-0)
- `package-lock.json` (M, +2/-2)
- `.codebase-memory/.gitattributes` (A, +3/-0)
- `.codebase-memory/graph.db.zst` (A, +0/-0)

Commits:
- 2026-06-23 ([50268d8](https://github.com/toshon-jennings/perci/commit/50268d89c3916767f48462a9d29ceb059a92852c)): feat(browser): add bookmarks, omnibox, find in page, and SSL bypass
- 2026-06-23 ([0f11a2f](https://github.com/toshon-jennings/perci/commit/0f11a2f51205c9230be186859bfd499aa8c46975)): feat: add Ensemble, MarkItDown, and Skills modes; Mission Control fix; Localhost improvements

### LLM clients, tools, and agent orchestration

LLM clients, tools, and agent orchestration touched 1 changed file. Graphify matched 1 changed renderer file, so this is tied to indexed architecture rather than only path names. Detected signals include Persists caveman_level_code, Persists ponytail_level_code.

Evidence: 1 commit, 1 file, +20/-2. Confidence: high.
Graphify signal: 1 indexed file, 1 graph node, communities 18.
Indexed symbols/files: `components/CodeMode.jsx`.

Detected changes:
- Persists caveman_level_code — Persistent storage key appears in added lines.
- Persists ponytail_level_code — Persistent storage key appears in added lines.

Key files:
- `src/components/CodeMode.jsx` (M, +20/-2)

Commits:
- 2026-06-23 ([50268d8](https://github.com/toshon-jennings/perci/commit/50268d89c3916767f48462a9d29ceb059a92852c)): feat(browser): add bookmarks, omnibox, find in page, and SSL bypass

### Chat Mode surface

Chat Mode surface touched 1 changed file. Graphify matched 1 changed renderer file, so this is tied to indexed architecture rather than only path names. Detected signals include Persists caveman_level_chat, Persists ponytail_level_chat.

Evidence: 2 commits, 1 file, +18/-2. Confidence: high.
Graphify signal: 1 indexed file, 1 graph node, communities 16.
Indexed symbols/files: `components/ChatMode.jsx`.

Detected changes:
- Persists caveman_level_chat — Persistent storage key appears in added lines.
- Persists ponytail_level_chat — Persistent storage key appears in added lines.

Key files:
- `src/components/ChatMode.jsx` (M, +18/-2)

Commits:
- 2026-06-23 ([50268d8](https://github.com/toshon-jennings/perci/commit/50268d89c3916767f48462a9d29ceb059a92852c)): feat(browser): add bookmarks, omnibox, find in page, and SSL bypass
- 2026-06-23 ([0f11a2f](https://github.com/toshon-jennings/perci/commit/0f11a2f51205c9230be186859bfd499aa8c46975)): feat: add Ensemble, MarkItDown, and Skills modes; Mission Control fix; Localhost improvements

### Persistence and local state

Persistence and local state touched 1 changed file. Graphify matched 1 changed renderer file, so this is tied to indexed architecture rather than only path names.

Evidence: 2 commits, 1 file, +12/-0. Confidence: high.
Graphify signal: 1 indexed file, 1 graph node, communities 3.
Indexed symbols/files: `lib/persistentStore.js`.

Key files:
- `src/lib/persistentStore.js` (M, +12/-0)

Commits:
- 2026-06-23 ([50268d8](https://github.com/toshon-jennings/perci/commit/50268d89c3916767f48462a9d29ceb059a92852c)): feat(browser): add bookmarks, omnibox, find in page, and SSL bypass
- 2026-06-23 ([0f11a2f](https://github.com/toshon-jennings/perci/commit/0f11a2f51205c9230be186859bfd499aa8c46975)): feat: add Ensemble, MarkItDown, and Skills modes; Mission Control fix; Localhost improvements

## Commit Ledger

- 2026-06-23 [50268d8](https://github.com/toshon-jennings/perci/commit/50268d89c3916767f48462a9d29ceb059a92852c): feat(browser): add bookmarks, omnibox, find in page, and SSL bypass
  - 16 files, +740/-60; surfaces: Localhost browser mode, Shared renderer libraries, Renderer components, Electron IPC and desktop bridge, LLM clients, tools, and agent orchestration
- 2026-06-23 [0f11a2f](https://github.com/toshon-jennings/perci/commit/0f11a2f51205c9230be186859bfd499aa8c46975): feat: add Ensemble, MarkItDown, and Skills modes; Mission Control fix; Localhost improvements
  - 119 files, +17668/-196; surfaces: Skills and Coding Expert Stack, Visual assets and styling, Eidos embedded memory surface, Ensemble mode, Electron IPC and desktop bridge

