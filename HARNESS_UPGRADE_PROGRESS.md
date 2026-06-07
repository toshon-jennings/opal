# Perci Harness Upgrade Progress

Date: 2026-06-02

Scope requested: items 1-6 from "The Next Evolution of the AI Coding Harness" document.

Implemented in this pass:
- Durable harness memory module: `src/lib/harnessMemory.js`
- Budget governor module: `src/lib/budgetGovernor.js`
- Automatic model router module: `src/lib/modelRouter.js`
- Intent-first diff review module: `src/lib/diffReview.js`
- Mission transit graph module: `src/lib/transitMap.js`
- Mission Control now refreshes durable memory/reviews, shows intent review details, and renders a transit-style workflow graph.
- Code, Cowork, and Build modes now inject durable memory, budget instructions, and model-routing context before LLM calls.
- Terminal-backed Mission runs can now receive a structured cancel interrupt through `terminal-server.cjs`.
- Build is now retained as a first-class mode in the main mode switcher.
- Build UI was restyled to match Perci's dark workspace language: assistant rail, project file list, preview/code toolbar, variable-based surfaces, and dark-mode-aware Monaco.
- Chat/Cowork/Code/Build response routing was hardened so final answers are not trapped inside reasoning panels or dropped by malformed/unclosed thinking tags.
- Provider/API cancellation now uses `AbortController` signals across OpenAI-compatible, Gemini, Anthropic, Mistral, Ollama, LM Studio, Jan, and OpenRouter client calls.
- Chat, Code, Cowork, and Build modes now expose active stop controls that abort in-flight provider calls and record explicit cancelled outcomes where Mission runs exist.
- Harness memory now scores candidate quality, filters weak/generic/duplicate notes, and shows quality verdicts/reasons in Mission memory review before saving.
- Added a Vitest harness (`npm test`) with focused suites for the upgrade modules:
  - `test/abortPropagation.test.js`: verifies OpenAI/Groq/Mistral/OpenRouter/Anthropic `streamChat` forward the caller `AbortSignal` to `fetch`, that an aborted signal surfaces an `AbortError`, and that calls without a signal pass `undefined`.
  - `test/harnessMemory.test.js`: covers `evaluateMemoryQuality` scoring/verdicts, generic-outcome and duplicate penalties, `addHarnessMemory` weak-note rejection and same-run replacement, and `ingestRunMemory` signal filtering.
  - `test/harnessModules.test.js`: covers budget-governor limits/blocking, model-router complexity routing and key-gating, and diff-review parsing/validation/risk inference.

Validated:
- `npm run build` passed.
- `npm run lint` now passes with a repo-local ESLint config and build-output ignores.
- Browser QA on `http://127.0.0.1:5174/` verified Mission, Code, Cowork, and Build surfaces render.
- Build mode is now reachable from the main mode switcher and shows the Build Assistant shell, Preview/Code controls, and corrected prompt placeholder.
- Browser smoke tests verified Chat, Cowork, Code, and Build return visible responses after the reasoning-routing fix.
- Browser visual QA verified Build preview and code states after the UI restyle.
- `npm run build` and `npm run lint` passed after provider abort and memory-quality changes.
- In-app browser smoke on `http://127.0.0.1:5174/` verified the Build shell, Preview/Code controls, Generate/Cancel-capable button, and Mission memory quality verdict display.
- `npm test` (Vitest) passes: 29 tests across abort propagation, memory quality scoring, budget governor, model router, and diff review. `npm run lint` and `npm run build` still pass with the test suite and config in place.

Known follow-up:
- Terminal cancellation now preserves explicit `cancelled` status when the terminal later reports interrupt exit code 130.
- Provider-side billing/processing semantics can still vary after a request reaches a vendor, but Perci now aborts the browser fetch stream where the provider client supports it.
- Harness memory now dedupes by source run, skips low-signal generic completions, scores candidates, and requires Mission review for generated memory candidates.
- Certification-specific personas/workflows are intentionally deferred.
- Focused automated tests for abort propagation and memory quality scoring are now in place (Vitest, `npm test`).
- Next hardening target: extend coverage to the transit-map graph layout and the Mission Control wiring (component-level tests), and add a CI step that runs `npm test` on each change.
