# Handover Prompt for Claude (Workspace Awareness Debugging)

Hi Claude! You are taking over a task to implement and debug **Workspace Awareness for PerciPet and Shipyard PM Chat**.

## Context & Requirements
The user wants `PerciPet` (the floating mascot companion) and the `ShipyardMode` PM Chat to have full visibility of the active workspace state. They should be able to ask questions like "where are things?", "what is open?", or ask about OpenClaw or the `Localhost` browser window, and get a fair assessment instead of defensive replies like *"I only manage tasks on the Shipyard board"* or *"I cannot see external windows like localhost"*.

## What We Have Done

1.  **Created Workspace Context Aggregator:**
    *   Added the `getWorkspaceContextSummary` function at the end of [perciContext.js](file:///Users/toshonjennings/opal/src/lib/perciContext.js#L415).
    *   This function leverages the existing `createPerciContextSnapshot` to pull open window objects, active/blocked missions/runs (via `readMissionRuns`), manual desk tasks, and recent chat session names.
2.  **Integrated with Shipyard PM Chat & PerciPet:**
    *   Updated the hook extractions inside [PerciPet.jsx](file:///Users/toshonjennings/opal/src/components/PerciPet.jsx#L43-L45) and [ShipyardMode.jsx](file:///Users/toshonjennings/opal/src/components/ShipyardMode.jsx#L66-L67) to pull `windows`, `codeState`, and `chats`.
    *   In both components, `getWorkspaceContextSummary` compiles the current snapshot and passes it to `runPmAgentTurn` as a `workspaceSummary` string.
3.  **Standalone Pet Chat Enabled:**
    *   Removed the restriction that blocked PerciPet queries when no project board was set up.
    *   Added a standalone `petChatHistory` state that persists to local storage under `perci_pet_chat`. If there's no project, it queries the LLM directly as the workspace assistant.
4.  **System Prompt Tuning:**
    *   Modified the base PM system prompt constructor `buildPmSystemPrompt` in [shipyard.js](file:///Users/toshonjennings/opal/src/lib/shipyard.js#L538) to declare Perci as both a *"project manager and workspace assistant"* with full visibility of the active workspace.
    *   Modified the playbook rule for standups (`- When asked "where are we"...`) to explicitly guide the model to combine board cards with live workspace states (Localhost, BARS, runs).
    *   Appended direct instruction blocks inside `runPmAgentTurn` when `workspaceSummary` is present.
5.  **Dynamic History Sanitization (Implemented Fix):**
    *   Created `sanitizeChatHistory` in [shipyard.js](file:///Users/toshonjennings/opal/src/lib/shipyard.js#L492).
    *   It parses the message history prior to executing the LLM client call, surgically removing previous assistant defensive answers and their preceding questions.
    *   This eliminates the need to clear UI chat history manually to dodge historical LLM persona bias.

---

## Remaining Steps & Troubleshooting for Claude

1.  **Verify Context Injection:**
    *   Put a log statement inside `runPmAgentTurn` in [shipyard.js](file:///Users/toshonjennings/opal/src/lib/shipyard.js#L499) to verify that `workspaceSummary` is actually being compiled and containing the expected lines (like `Open Windows: Localhost (normal)` or `Active Tasks`).
2.  **Tweak Prompt Anchoring:**
    *   Verify if the local model being run (e.g. LM Studio, Ollama, Jan) needs a different format (like system instructions prepended to every message, or higher system prompt weights) to prevent it from ignoring instructions.
3.  **OpenClaw Status Integration:**
    *   Verify how the mascot can retrieve the real `openClawStatus` from `App.jsx` instead of passing an empty object `{}`.
