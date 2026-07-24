Original prompt: I want a site where a digital "cell" evolves, lives. I want to see it onscreen and watch it grow, seemingly naturally.

## Progress

- [x] Ground the simulation loop in the supplied synthetic-cell paper.
- [x] Create the standalone browser surface under `public/cell/`.
- [x] Add feeder vesicles, metabolism, growth, genome health, waste, and division.
- [x] Add inherited mutations and persistent browser storage.
- [x] Add deterministic `render_game_to_text` and `advanceTime` hooks.
- [x] Validate the production build.
- [x] Run the Playwright interaction loop and inspect screenshots.
- [x] Verify light and dark modes.
- [x] Keep both daughters as independently living cells after division.
- [x] Add click-to-observe selection and population telemetry.
- [x] Add bounded resource competition and population persistence.
- [x] Validate multi-cell growth, division, selection, and reload behavior.

## Notes

- The original build follows one continuing lineage and fades the second daughter;
  the current milestone replaces that simplification with a persistent population.
- Normal culture perfusion sustains the cell; the feeder button adds an optional nutrient pulse.
- A full population-selection view can build on this first lineage simulation later.
- `node --check public/cell/cell.js`, `git diff --check`, and `npm run build` pass.
- Deterministic lifecycle validation reached generation 4 with three divisions.
- Persistence validation advanced a fresh specimen from generation 1 to 3 with one
  mutation, reloaded the page, and restored the exact specimen and lineage state.
- Light and dark full-page screenshots show readable theme-aware controls and telemetry.
- No page or console errors were emitted by the standalone cell surface.
- Direct `file://` validation exposed that a module script was unnecessary and
  blocked by standard Chromium local-file rules; the page now uses `defer`
  so it works directly from disk without a server.
- The original version-1 singleton save migrates into a version-2 population
  without losing the founding specimen, generation, divisions, mutation, or
  uptake trait.
- Division-phase validation captured visible membrane constriction and then
  confirmed population 1 -> 2 with both generation-2 daughters retained.
- Click selection moved the inspector to a daughter and persisted the selected
  specimen across reload together with the whole population.
- A direct-file stress pass reached 8 living cells, 7 divisions, generation 4,
  4 mutated descendants, and 4 independently reproducing cells without errors.
- The culture is bounded at 28 cells; feeder supply is shared, and uptake
  mutations influence which cells capture the finite vesicle stream.
