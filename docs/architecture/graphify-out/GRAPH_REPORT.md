# Graph Report - /tmp/perci-graph  (2026-06-07)

## Corpus Check
- cluster-only mode — file stats not available

## Summary
- 514 nodes · 1047 edges · 31 communities (23 shown, 8 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `5f2c9862`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_UI Navigation and Settings|UI Navigation and Settings]]
- [[_COMMUNITY_Code and Cowork Modes|Code and Cowork Modes]]
- [[_COMMUNITY_App Core and Providers|App Core and Providers]]
- [[_COMMUNITY_Chat and Attachments|Chat and Attachments]]
- [[_COMMUNITY_Intelligent Search Tool|Intelligent Search Tool]]
- [[_COMMUNITY_Mission Execution UI|Mission Execution UI]]
- [[_COMMUNITY_LLM Provider Clients|LLM Provider Clients]]
- [[_COMMUNITY_Model Capabilities Service|Model Capabilities Service]]
- [[_COMMUNITY_Agent Management|Agent Management]]
- [[_COMMUNITY_Mission Event Logging|Mission Event Logging]]
- [[_COMMUNITY_Harness Memory Management|Harness Memory Management]]
- [[_COMMUNITY_Artifact Preview Security|Artifact Preview Security]]
- [[_COMMUNITY_Diff and Intent Review|Diff and Intent Review]]
- [[_COMMUNITY_Thinking Content Parsing|Thinking Content Parsing]]
- [[_COMMUNITY_Mission Control Guide|Mission Control Guide]]
- [[_COMMUNITY_Mode Guide Modal|Mode Guide Modal]]
- [[_COMMUNITY_Session Lifecycle Tracking|Session Lifecycle Tracking]]
- [[_COMMUNITY_Search Progress UI|Search Progress UI]]
- [[_COMMUNITY_Mode Error Handling|Mode Error Handling]]
- [[_COMMUNITY_Mission Validation Logic|Mission Validation Logic]]
- [[_COMMUNITY_Mission Transit Mapping|Mission Transit Mapping]]
- [[_COMMUNITY_Hermes Assets|Hermes Assets]]
- [[_COMMUNITY_Opal Branding|Opal Branding]]
- [[_COMMUNITY_Openclaw Branding|Openclaw Branding]]

## God Nodes (most connected - your core abstractions)
1. `appendMissionRunEvent()` - 19 edges
2. `useMode()` - 17 edges
3. `useChat()` - 14 edges
4. `ModelService` - 14 edges
5. `readMissionRuns()` - 13 edges
6. `upsertMissionRun()` - 13 edges
7. `AppContent()` - 12 edges
8. `useTheme()` - 12 edges
9. `executeIntegrationTool()` - 12 edges
10. `chooseModelForTask()` - 11 edges

## Surprising Connections (you probably didn't know these)
- `resolveModelInput()` --calls--> `tokenize()`  [INFERRED]
  components/AgentsPanel.jsx → lib/harnessMemory.js
- `AppContent()` --calls--> `useMode()`  [EXTRACTED]
  App.jsx → context/ModeContext.jsx
- `AppContent()` --calls--> `appendMissionRunEvent()`  [EXTRACTED]
  App.jsx → lib/missionControl.js
- `AppContent()` --calls--> `recordGatewayCheck()`  [EXTRACTED]
  App.jsx → lib/missionControl.js
- `AppContent()` --calls--> `recordTerminalCommandResult()`  [EXTRACTED]
  App.jsx → lib/missionControl.js

## Import Cycles
- None detected.

## Communities (31 total, 8 thin omitted)

### Community 0 - "UI Navigation and Settings"
Cohesion: 0.06
Nodes (37): RoutinesView(), saveRoutines(), navItems, LOCAL_IMAGE_PATHS, LOCAL_PROVIDER_NAMES, API_KEY_PROVIDERS, ChatContext, ChatProvider() (+29 more)

### Community 1 - "Code and Cowork Modes"
Cohesion: 0.06
Nodes (31): CodeMode(), EditorErrorBoundary, getLanguage(), PROVIDERS_REQUIRING_API_KEYS, CONNECTOR_TABS, DEFAULT_CONNECTORS, LOCAL_AGENT_TOOLS, SCHEDULE_PILLS (+23 more)

### Community 2 - "App Core and Providers"
Cohesion: 0.08
Nodes (26): AppContent(), CompareColumn(), PROVIDER_LABELS, BuildMode(), EditorErrorBoundary, getBuildLanguage(), TerminalPanel(), defaultFiles (+18 more)

### Community 3 - "Chat and Attachments"
Cohesion: 0.06
Nodes (27): AttachmentMenu(), AttachmentPreview(), ChatMessage(), ArtifactCard(), ChatMode(), formatArtifactDate(), formatRelativeDate(), getArtifactExcerpt() (+19 more)

### Community 4 - "Intelligent Search Tool"
Cohesion: 0.10
Nodes (6): detectLocalRuntimeFact(), getCurrentDateParts(), LOCAL_MODEL_PROVIDERS, RELEVANCE_STOPWORDS, resolveRelativeDateQuery(), tokenizeForRelevance()

### Community 5 - "Mission Execution UI"
Cohesion: 0.07
Nodes (14): formatTime(), getRunSourceType(), matchesRunFilter(), needsValidation(), NodeDetail(), RUN_FILTERS, RunListItem(), STATUS_META (+6 more)

### Community 6 - "LLM Provider Clients"
Cohesion: 0.18
Nodes (16): AnthropicClient, BaseClient, extractThinking(), extractThinkingTokens(), flushUnclosedThinking(), GeminiClient, GroqClient, JanClient (+8 more)

### Community 7 - "Model Capabilities Service"
Cohesion: 0.13
Nodes (10): AUDIO_PATTERNS, detectCapabilityFromName(), getModelCapabilities(), getModelCapabilityLabel(), ModelService, supportsAudio(), supportsImage(), supportsVideo() (+2 more)

### Community 8 - "Agent Management"
Cohesion: 0.09
Nodes (12): ACTIVE_JOB_STATUSES, AGENT_DEFINITIONS, AGENT_MODEL_HINTS, AGENT_MODEL_SUGGESTIONS, ATTENTION_JOB_STATUSES, COMPLETED_JOB_STATUSES, isActiveStatus(), isStaleJob() (+4 more)

### Community 9 - "Mission Event Logging"
Cohesion: 0.18
Nodes (18): appendMissionRunEvent(), createSeedMissionRuns(), isDiffReviewCommand(), looksLikeDiffOutput(), markValidationCheckpoints(), maybeIngestRunMemory(), readMissionRuns(), recordBuildGenerationFinish() (+10 more)

### Community 11 - "Harness Memory Management"
Cohesion: 0.27
Nodes (15): addHarnessMemory(), buildMemoryPrompt(), evaluateMemoryQuality(), getRunSourceType(), ingestRunMemory(), isGenericOutcome(), normalizeForComparison(), normalizeMemoryItem() (+7 more)

### Community 12 - "Artifact Preview Security"
Cohesion: 0.42
Nodes (9): assertPreviewBudget(), buildPreviewErrorDocument(), buildStaticPreviewDocument(), createPreviewRuntimeGuard(), escapeHtml(), getPreviewCsp(), PREVIEW_CDN_URLS, PREVIEW_SECURITY_LIMITS (+1 more)

### Community 13 - "Diff and Intent Review"
Cohesion: 0.39
Nodes (7): createIntentReview(), inferRisks(), inferValidation(), parseDiffLikeOutput(), readIntentReviews(), saveIntentReview(), summarizeIntent()

### Community 17 - "Session Lifecycle Tracking"
Cohesion: 0.25
Nodes (8): normalizeRun(), normalizeValidation(), recordBuildGenerationStart(), recordBuildReset(), recordCodeFileSave(), recordCodeSessionStart(), recordCoworkSessionStart(), upsertMissionRun()

### Community 18 - "Search Progress UI"
Cohesion: 0.33
Nodes (3): formatElapsed(), RESEARCH_PHASES, ResearchProgress()

### Community 21 - "Mission Validation Logic"
Cohesion: 0.40
Nodes (5): isRunNeedingValidation(), isValidationCommand(), readValidationTarget(), resolveValidationTarget(), setMissionValidationTarget()

## Knowledge Gaps
- **53 isolated node(s):** `AGENT_DEFINITIONS`, `AGENT_MODEL_HINTS`, `AGENT_MODEL_SUGGESTIONS`, `ACTIVE_JOB_STATUSES`, `COMPLETED_JOB_STATUSES` (+48 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **8 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useMode()` connect `UI Navigation and Settings` to `Code and Cowork Modes`, `App Core and Providers`, `Chat and Attachments`, `Mission Execution UI`, `Agent Management`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `ModelService` connect `Model Capabilities Service` to `UI Navigation and Settings`?**
  _High betweenness centrality (0.041) - this node is a cross-community bridge._
- **Why does `LLMFactory` connect `App Core and Providers` to `Code and Cowork Modes`, `Chat and Attachments`, `Intelligent Search Tool`, `LLM Provider Clients`?**
  _High betweenness centrality (0.037) - this node is a cross-community bridge._
- **What connects `AGENT_DEFINITIONS`, `AGENT_MODEL_HINTS`, `AGENT_MODEL_SUGGESTIONS` to the rest of the system?**
  _53 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `UI Navigation and Settings` be split into smaller, more focused modules?**
  _Cohesion score 0.05928614640048397 - nodes in this community are weakly interconnected._
- **Should `Code and Cowork Modes` be split into smaller, more focused modules?**
  _Cohesion score 0.058001397624039136 - nodes in this community are weakly interconnected._
- **Should `App Core and Providers` be split into smaller, more focused modules?**
  _Cohesion score 0.07619738751814223 - nodes in this community are weakly interconnected._