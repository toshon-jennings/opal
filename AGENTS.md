# Opal — repo rules

Repo-specific rules for every agent working in this repository. Global rules
(minimal code, no unnecessary duplication, etc.) live in
`~/.config/agent-rules/GLOBAL.md` and apply on top of these — don't repeat them
here.

## Context

- **This project is a fork.** The owner did not write most of it and does not
  yet fully understand what's here. Assume parts of the UI and code may be
  unused, non-functional, or unclear in purpose — do not assume existing code
  works or is needed just because it's present.
- The goal over time is to build a full understanding of the codebase and
  **remove anything unnecessary**. When you touch an area, note dead/unused/
  unclear code rather than silently working around it, and prefer deleting
  genuinely unused code over keeping it.

## Workflow

- All edits go to the main project at `/Users/toshonjennings/opal`, never a
  worktree. The dev server runs from the main project.

## Conventions

- (Add repo-specific conventions here as they come up.)
