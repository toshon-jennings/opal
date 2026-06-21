# Perci Power User Workspace Plan

## Objective

Build a Power Workspace layer that makes Perci coherent for technical founder/operator/builder power users.

The first target user is not an enterprise analytics operator. The first target user is a builder who moves across ideas, notes, code, local terminals, AI agents, research, validation, and product decisions. Perci should help them keep the full loop visible:

```text
idea -> context -> plan -> agent work -> validation -> memory -> next action
```

## Product Thesis

Perci already has many of the right surfaces: Chat, Cowork, Code, Agents, Mission Control, Git Shells, Notes, BARS, Lighthouse, Hermes/OpenClaw, and a native window system. The power-user gap is continuity. These surfaces need to behave like one project operating system, not adjacent tools.

The Power Workspace should answer six questions when a user opens Perci:

1. What am I working on?
2. Why does it matter?
3. What context do I already have?
4. What did the agents do recently?
5. What is blocked or needs validation?
6. What should I do next?

## Non-Goals

- Do not start with enterprise warehouse workflows, BigQuery, Snowflake, Databricks, or BI-dashboard integration.
- Do not redesign every Perci mode at once.
- Do not introduce speculative cross-app architecture.
- Do not share storage between standalone Bars and Perci BARS. Export/import remains the boundary unless Toshon explicitly changes that decision.
- Do not edit the legacy root `main.cjs`; Electron work belongs in `electron/main.cjs` and `electron/preload.cjs`.
- Do not make destructive changes to local projects, containers, services, app data, or notes.

## Current Product Evidence

- Window/mode system: `src/context/ModeContext.jsx`, `src/App.jsx`, `src/components/windows/`.
- Dashboard launch surface: `src/components/DashboardMode.jsx`.
- Project terminals: `src/components/ProjectsMode.jsx`, `src/components/Terminal.jsx`, `src/lib/terminalBridge.js`.
- Cowork sessions and routines: `src/components/CoworkMode.jsx`.
- Mission history, validation, and memory candidates: `src/components/MissionControl.jsx`, `src/lib/missionControl.js`.
- BARS idea notebook: `src/components/BarsMode.jsx`, `src/components/BarsMode.css`.
- Notes/wiki context: `src/components/NotesMode.jsx`, `src/components/NotesGraph3D.jsx`, `src/lib/notesTags.js`.
- Agent launcher/job bridge: `src/components/AgentsPanel.jsx`, `electron/main.cjs`, `electron/preload.cjs`.
- External GitHub tool layer: `src/lib/integrationTools.js`.

## Recommended First Slice

Create a first-class Power Workspace Home for one active project.

Minimum useful version:

- Shows active project name, folder, and goal.
- Shows linked or recent BARS ideas.
- Shows linked or recent Notes pages.
- Shows recent Chat/Cowork sessions.
- Shows recent Mission runs and validation state.
- Shows active Git Shells for that project.
- Shows a concise “Next action” panel.
- Offers one workflow action: continue current project or turn selected idea/context into a build plan.

Keep the first slice narrow. The goal is to prove one coherent project loop before expanding to automation, sync, or multi-project intelligence.

## Workstreams

### 1. Workspace Model And Persistence

Goal: define the minimal project/workspace record that other surfaces can read.

Likely files:

- `src/context/ModeContext.jsx`
- `src/lib/persistentStore.js`
- Possibly a new `src/lib/powerWorkspace.js`
- Possibly a new context under `src/context/`

Expected behavior:

- A workspace has an id, name, folder path, goal, optional description, and timestamps.
- The active workspace persists locally and hydrates through existing persistence conventions.
- Existing `working_directory`, Git Shells project records, and project memory should be reused where practical instead of duplicating state.

Acceptance criteria:

- Reloading Perci preserves the active workspace.
- Existing Git Shells/Cowork working-directory behavior is not broken.
- Corrupted stored workspace data falls back safely instead of crashing.

Validation:

- `npm run build`
- focused localStorage/electron-store hydration checks where applicable

### 2. Power Workspace Home UI

Goal: add the visible home surface for the active workspace.

Likely files:

- `src/context/ModeContext.jsx`
- `src/App.jsx`
- `src/components/DashboardMode.jsx`
- New `src/components/PowerWorkspaceMode.jsx`
- New CSS or scoped styles near the component or in `src/index.css`
- `src/components/windows/Dock.jsx`

Expected behavior:

- The workspace opens as a normal Perci window/mode and appears in the dock.
- It summarizes the active workspace, recent context, recent runs, and next action.
- It should feel like a command surface, not a dashboard full of decorative cards.

Acceptance criteria:

- Dashboard tile opens the workspace window.
- Dock chip works.
- Window reload persistence works.
- Empty state is useful for a new user.
- The UI is readable in a typical desktop window without requiring full screen.

Validation:

- `npm run build`
- focused manual or Playwright check: open Dashboard -> open Power Workspace -> verify dock/window/empty state

### 3. BARS Integration

Goal: surface idea context without violating the standalone/Perci storage boundary.

Likely files:

- `src/components/BarsMode.jsx`
- New or existing BARS utility functions
- Power Workspace component from Workstream 2

Expected behavior:

- Power Workspace can show recent or selected Perci BARS ideas.
- It does not read standalone Bars storage.
- It does not create shared storage between standalone Bars and Perci BARS.
- It should support an obvious “use this idea as workspace context” path, even if the first implementation is a simple local link/reference.

Acceptance criteria:

- Recent Perci BARS ideas appear in the workspace home when present.
- Empty state explains how to capture/select an idea.
- No standalone Bars data path is introduced.

Validation:

- `npm run build`
- create/read a Perci BARS idea locally and verify it appears or can be linked

### 4. Notes Integration

Goal: let workspace context include project notes without changing the notes storage model.

Likely files:

- `src/components/NotesMode.jsx`
- `src/lib/notesTags.js`
- Power Workspace component from Workstream 2

Expected behavior:

- Power Workspace can show recent notes or notes tagged/linked to the active workspace.
- Existing YAML-frontmatter tag behavior remains intact.
- Encrypted note behavior is not weakened.

Acceptance criteria:

- Tagged or recent notes can be displayed as workspace context.
- Locked/encrypted notes remain protected.
- Notes navigation still resolves `.md` and `.enc.md` consistently.

Validation:

- `npm test -- --run` if notes tests are relevant
- `npm run build`

### 5. Mission And Validation Integration

Goal: make the workspace home show what agent work happened and what needs trust/validation.

Likely files:

- `src/lib/missionControl.js`
- `src/components/MissionControl.jsx`
- Power Workspace component from Workstream 2

Expected behavior:

- Workspace shows recent Mission runs relevant to the active folder/project when possible.
- It highlights blocked runs, validation-needed runs, and memory candidates.
- It links or opens Mission Control for deeper inspection.

Acceptance criteria:

- Recent runs appear in the workspace home.
- “Needs validation” and blocked states are visible.
- No mission history data is deleted or migrated destructively.

Validation:

- `npm run build`
- create or inspect existing local Mission run records and verify summary rendering

### 6. Git Shells And Cowork Integration

Goal: connect execution surfaces to the active workspace.

Likely files:

- `src/components/ProjectsMode.jsx`
- `src/components/CoworkMode.jsx`
- `src/components/Terminal.jsx`
- Power Workspace component from Workstream 2

Expected behavior:

- Power Workspace shows the active project terminal context.
- It can open Git Shells for the active workspace.
- It can start or continue a Cowork session scoped to the active folder/goal.
- Routine/job status should be visible, but durable routine redesign is a later step unless needed for the first slice.

Acceptance criteria:

- Opening Git Shells from Power Workspace targets the active project when possible.
- Starting Cowork from Power Workspace includes the active folder/goal context.
- Existing terminal sessions are not reset unnecessarily.

Validation:

- `npm run build`
- manual Electron check if any preload/main bridge behavior changes

### 7. Next Action Engine

Goal: provide a small, transparent “what next?” recommendation without creating a black-box planner.

Likely files:

- Power Workspace component from Workstream 2
- Possibly `src/lib/powerWorkspace.js`
- Possibly `src/lib/missionControl.js`

Expected behavior:

- Produces a deterministic next-action suggestion from local visible state.
- Examples:
  - “Select a BARS idea to turn into a plan.”
  - “Validate the latest Cowork run.”
  - “Open Git Shells for this project.”
  - “Write a workspace goal.”
  - “Review pending memory candidate.”
- Avoids pretending to know more than the available state supports.

Acceptance criteria:

- Empty workspace produces useful setup guidance.
- Workspace with recent runs produces a validation/review-oriented next action.
- Workspace with idea/note context but no plan suggests planning/build workflow.

Validation:

- unit tests for deterministic recommendation helper if extracted
- `npm run build`

## Suggested Agent Task Cards

Use these as separable assignments.

### Task A: Workspace Data Model

- Build the minimal active workspace model and safe persistence helpers.
- Do not add UI beyond small debug/consumer hooks if needed.
- Acceptance: active workspace can be created, saved, read, and safely normalized after reload.

### Task B: Power Workspace Window Skeleton

- Add `MODES.POWER_WORKSPACE` or equivalent naming chosen by Toshon.
- Wire mode, title, dashboard tile, dock chip, and empty-state component.
- Acceptance: window opens, docks, persists, and builds.

### Task C: Context Summary Cards

- Render workspace goal/folder plus recent ideas, notes, Mission runs, and Git Shell status.
- Use existing stores and helpers first.
- Acceptance: missing data produces useful empty states, not errors.

### Task D: BARS And Notes Linking

- Add a minimal way to associate a Perci BARS idea and/or note with the active workspace.
- Avoid standalone Bars storage.
- Acceptance: linked items survive reload and appear in Power Workspace.

### Task E: Mission/Git Shells/Cowork Actions

- Add actions to open Mission, open Git Shells, and start/continue Cowork in the workspace context.
- Acceptance: action buttons route to the right Perci surfaces without resetting unrelated state.

### Task F: Next Action Recommendation

- Add deterministic helper that picks one next action from workspace state.
- Acceptance: helper has focused tests for empty, idea-only, run-needs-validation, and blocked-run cases.

### Task G: QA/Handoff Pass

- Run build/tests appropriate to touched files.
- Update `HANDOFF.md` with completed and remaining slices.
- Note any dead, unused, or unclear code found while touching the area.

## Coordination Rules For Multiple Agents

- Work in the main repo at `/Users/toshonjennings/opal`; do not use worktrees.
- Keep changes narrow and surface-owned. Avoid broad style rewrites.
- Before editing shared surfaces (`ModeContext.jsx`, `App.jsx`, `DashboardMode.jsx`, `Dock.jsx`, `electron/main.cjs`, `electron/preload.cjs`), check `git status --short` and inspect nearby diffs.
- If touching Electron main/preload, note that a full Electron restart is required for live validation.
- Preserve user changes in the existing dirty worktree.
- Prefer existing localStorage/electron-store persistence conventions before adding new persistence layers.
- Use `graphify query` before broad renderer exploration.
- Root `main.cjs` is legacy dead code. Do not edit it.

## Validation Matrix

Minimum validation depends on files touched:

- Renderer-only UI: `npm run build`, plus focused manual/browser check.
- Notes/tag behavior: `npm test -- --run` if tests are relevant.
- Electron bridge changes: `node --check electron/main.cjs`, `node --check electron/preload.cjs`, `npm run build`, and restarted Electron validation.
- Terminal/Git Shell changes: live terminal focus/input check in Electron when possible.
- Persistence/model helpers: focused tests when a helper is extracted.

## Open Product Decisions

- Final user-facing name: “Power Workspace”, “Workspace Home”, “Command Center”, or another Toshon-preferred label.
- Whether the workspace should be a new mode or an upgraded Dashboard section.
- Whether linking BARS/Notes to a workspace should be manual at first or inferred from tags/folders.
- How much of Chat history should be workspace-scoped in the first slice.
- Whether Mission Control remains a separate deep surface or becomes embedded more heavily in the workspace home.

## Recommended Next Step

Start with Task A and Task B together only if one agent owns both. Otherwise:

1. Agent 1 builds the workspace model.
2. Agent 2 builds the window skeleton against a small mocked/read-only model.
3. Merge the two before adding integrations.

Do not begin deep BARS/Notes/Mission integrations until the workspace model and surface skeleton are stable.
