# Graph Report - /tmp/perci-graph  (2026-06-07)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 502 nodes · 1012 edges · 32 communities (24 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `3a20762c`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Mission Run Management|Mission Run Management]]
- [[_COMMUNITY_App Layout and Providers|App Layout and Providers]]
- [[_COMMUNITY_Chat and Attachment System|Chat and Attachment System]]
- [[_COMMUNITY_Intelligent Search Tool|Intelligent Search Tool]]
- [[_COMMUNITY_LLM Client Integration|LLM Client Integration]]
- [[_COMMUNITY_Model Capability Service|Model Capability Service]]
- [[_COMMUNITY_Agent Status and Monitoring|Agent Status and Monitoring]]
- [[_COMMUNITY_API Key and Routine Storage|API Key and Routine Storage]]
- [[_COMMUNITY_Memory and Context Management|Memory and Context Management]]
- [[_COMMUNITY_Cowork Mode and Routines|Cowork Mode and Routines]]
- [[_COMMUNITY_Code Editor and Permissions|Code Editor and Permissions]]
- [[_COMMUNITY_Model Routing Logic|Model Routing Logic]]
- [[_COMMUNITY_Mode Navigation and Context|Mode Navigation and Context]]
- [[_COMMUNITY_Budget and Token Governance|Budget and Token Governance]]
- [[_COMMUNITY_Diff and Intent Review|Diff and Intent Review]]
- [[_COMMUNITY_Thinking Process Formatting|Thinking Process Formatting]]
- [[_COMMUNITY_Mission Control Guide|Mission Control Guide]]
- [[_COMMUNITY_Mode Guide Modal|Mode Guide Modal]]
- [[_COMMUNITY_Search Progress Tracking|Search Progress Tracking]]
- [[_COMMUNITY_Console Secret Redaction|Console Secret Redaction]]
- [[_COMMUNITY_Provider Settings Modal|Provider Settings Modal]]
- [[_COMMUNITY_Mode Error Boundary|Mode Error Boundary]]
- [[_COMMUNITY_Hermes Image Assets|Hermes Image Assets]]
- [[_COMMUNITY_Opal Logo Assets|Opal Logo Assets]]
- [[_COMMUNITY_Openclaw Branding Assets|Openclaw Branding Assets]]

## God Nodes (most connected - your core abstractions)
1. `appendMissionRunEvent()` - 19 edges
2. `useChat()` - 14 edges
3. `ModelService` - 14 edges
4. `useMode()` - 13 edges
5. `readMissionRuns()` - 13 edges
6. `upsertMissionRun()` - 13 edges
7. `AppContent()` - 12 edges
8. `useTheme()` - 12 edges
9. `executeIntegrationTool()` - 12 edges
10. `chooseModelForTask()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `resolveModelInput()` --calls--> `tokenize()`  [INFERRED]
  components/AgentsPanel.jsx → lib/harnessMemory.js
- `AppContent()` --calls--> `useChat()`  [EXTRACTED]
  App.jsx → context/ChatContext.jsx
- `AppContent()` --calls--> `useMode()`  [EXTRACTED]
  App.jsx → context/ModeContext.jsx
- `AppContent()` --calls--> `useTheme()`  [EXTRACTED]
  App.jsx → context/ThemeContext.jsx
- `AppContent()` --calls--> `buildTerminalWsUrl()`  [EXTRACTED]
  App.jsx → lib/terminalBridge.js

## Import Cycles
- None detected.

## Communities (32 total, 8 thin omitted)

### Community 0 - "Mission Run Management"
Cohesion: 0.06
Nodes (44): AppContent(), formatTime(), getRunSourceType(), matchesRunFilter(), needsValidation(), NodeDetail(), RUN_FILTERS, RunListItem() (+36 more)

### Community 1 - "App Layout and Providers"
Cohesion: 0.07
Nodes (32): CompareColumn(), PROVIDER_LABELS, BuildMode(), EditorErrorBoundary, getBuildLanguage(), TerminalPanel(), defaultFiles, useBuild() (+24 more)

### Community 2 - "Chat and Attachment System"
Cohesion: 0.06
Nodes (27): AttachmentMenu(), AttachmentPreview(), ChatMessage(), ArtifactCard(), ChatMode(), formatArtifactDate(), formatRelativeDate(), getArtifactExcerpt() (+19 more)

### Community 3 - "Intelligent Search Tool"
Cohesion: 0.09
Nodes (4): getCurrentDateParts(), LOCAL_MODEL_PROVIDERS, resolveRelativeDateQuery(), TavilyClient

### Community 4 - "LLM Client Integration"
Cohesion: 0.18
Nodes (16): AnthropicClient, BaseClient, extractThinking(), extractThinkingTokens(), flushUnclosedThinking(), GeminiClient, GroqClient, JanClient (+8 more)

### Community 5 - "Model Capability Service"
Cohesion: 0.13
Nodes (10): AUDIO_PATTERNS, detectCapabilityFromName(), getModelCapabilities(), getModelCapabilityLabel(), ModelService, supportsAudio(), supportsImage(), supportsVideo() (+2 more)

### Community 6 - "Agent Status and Monitoring"
Cohesion: 0.10
Nodes (11): ACTIVE_JOB_STATUSES, AGENT_DEFINITIONS, AGENT_MODEL_HINTS, AGENT_MODEL_SUGGESTIONS, ATTENTION_JOB_STATUSES, COMPLETED_JOB_STATUSES, isActiveStatus(), isStaleJob() (+3 more)

### Community 7 - "API Key and Routine Storage"
Cohesion: 0.15
Nodes (16): RoutinesView(), saveRoutines(), API_KEY_PROVIDERS, ChatContext, ChatProvider(), API_KEY_STORAGE_KEYS, clearLocalApiKeys(), getLocalApiKeySnapshot() (+8 more)

### Community 8 - "Memory and Context Management"
Cohesion: 0.21
Nodes (18): resolveModelInput(), addHarnessMemory(), buildMemoryPrompt(), evaluateMemoryQuality(), getRunSourceType(), ingestRunMemory(), isGenericOutcome(), normalizeForComparison() (+10 more)

### Community 9 - "Cowork Mode and Routines"
Cohesion: 0.11
Nodes (6): CONNECTOR_TABS, DEFAULT_CONNECTORS, LOCAL_AGENT_TOOLS, SCHEDULE_PILLS, TRIGGERS, recordCoworkSessionStart()

### Community 11 - "Code Editor and Permissions"
Cohesion: 0.15
Nodes (7): EditorErrorBoundary, PROVIDERS_REQUIRING_API_KEYS, PERMISSIONS, recordCodeFileSave(), recordCodeSessionFinish(), recordCodeSessionStart(), normalizeAssistantSpacing()

### Community 12 - "Model Routing Logic"
Cohesion: 0.24
Nodes (12): BuildProvider(), buildRoute(), buildRoutingPrompt(), chooseModelForTask(), classifyTaskComplexity(), LOCAL_PROVIDERS, LOW_COST_PROVIDERS, pickProviderModel() (+4 more)

### Community 13 - "Mode Navigation and Context"
Cohesion: 0.25
Nodes (7): CodeMode(), getLanguage(), navItems, DEFAULT_OPENCLAW_CONFIG, MODES, useMode(), serializeJson()

### Community 14 - "Budget and Token Governance"
Cohesion: 0.27
Nodes (8): buildBudgetPrompt(), createBudgetRun(), DEFAULT_BUDGET, estimateCharsFromMessages(), evaluateBudget(), recordBudgetIteration(), recordBudgetResponse(), recordBudgetToolCalls()

### Community 15 - "Diff and Intent Review"
Cohesion: 0.39
Nodes (7): createIntentReview(), inferRisks(), inferValidation(), parseDiffLikeOutput(), readIntentReviews(), saveIntentReview(), summarizeIntent()

### Community 19 - "Search Progress Tracking"
Cohesion: 0.33
Nodes (3): formatElapsed(), RESEARCH_PHASES, ResearchProgress()

### Community 20 - "Console Secret Redaction"
Cohesion: 0.38
Nodes (5): ModeProvider(), installRedactedConsole(), redactSecrets(), redactString(), SECRET_VALUE_PATTERNS

## Knowledge Gaps
- **47 isolated node(s):** `AGENT_DEFINITIONS`, `AGENT_MODEL_HINTS`, `AGENT_MODEL_SUGGESTIONS`, `ACTIVE_JOB_STATUSES`, `COMPLETED_JOB_STATUSES` (+42 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ModelService` connect `Model Capability Service` to `API Key and Routine Storage`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `LLMFactory` connect `App Layout and Providers` to `Chat and Attachment System`, `Intelligent Search Tool`, `LLM Client Integration`, `Cowork Mode and Routines`, `Code Editor and Permissions`?**
  _High betweenness centrality (0.038) - this node is a cross-community bridge._
- **Why does `useMode()` connect `Mode Navigation and Context` to `Mission Run Management`, `App Layout and Providers`, `Chat and Attachment System`, `Agent Status and Monitoring`, `Cowork Mode and Routines`, `Code Editor and Permissions`, `Provider Settings Modal`?**
  _High betweenness centrality (0.034) - this node is a cross-community bridge._
- **What connects `AGENT_DEFINITIONS`, `AGENT_MODEL_HINTS`, `AGENT_MODEL_SUGGESTIONS` to the rest of the system?**
  _47 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Mission Run Management` be split into smaller, more focused modules?**
  _Cohesion score 0.05874125874125874 - nodes in this community are weakly interconnected._
- **Should `App Layout and Providers` be split into smaller, more focused modules?**
  _Cohesion score 0.06927551560021153 - nodes in this community are weakly interconnected._
- **Should `Chat and Attachment System` be split into smaller, more focused modules?**
  _Cohesion score 0.058823529411764705 - nodes in this community are weakly interconnected._