# Perci

<div align="center">

**The open-source AI workspace for serious work**

[![React](https://img.shields.io/badge/React-18-2361AB.svg)](https://reactjs.org/)
[![Electron](https://img.shields.io/badge/Electron-39-47848F.svg)](https://electronjs.org/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

[Features](#-features) • [Quick Start](#-quick-start) • [Development](#-development)

</div>

---

## What Is Perci?

Perci is an open-source AI workspace — a desktop application that brings together multi-provider AI chat, agent orchestration, deep research, and a code workbench under one roof. Forked from [Open-claude](https://github.com/Damienchakma/Open-claude), it has evolved into something substantially more: a general-purpose tool for anyone who works with AI, writes code, or needs to get real things done.

This is not a chat app. It's a **command center**.

---

## Features

### Multi-Provider AI Chat

Switch between OpenAI, Google Gemini, Anthropic Claude, Groq, DeepSeek, or local models (Ollama, LM Studio, vLLM) — all in one interface. Each provider brings its own strengths; Perci lets you use the right tool for the job.

### Deep Research Scientist Mode

An autonomous research agent that plans searches, evaluates sources, synthesizes findings, and produces formal reports with abstracts, methodology, and citations. This isn't prompt-and-pray — it's an iterative loop that keeps digging until the question is answered.

### Code & Cowork Modes

- **Code Mode**: A dedicated code editor surface for working with AI on implementation tasks
- **Cowork Mode**: Run multiple coding agents (Claude Code, Aider, Codex, Cursor CLI, Copilot, Antigravity) in parallel, each in its own workspace, coordinated through Perci's mission control system

### Mission Control

Orchestrate complex multi-step work. Launch agents, track their progress, validate outputs, and manage dependencies — visualized through a transit map that shows every run's state transitions. This is the operational backbone that makes Perci more than a single-chat interface.

### Artifacts & Live Preview

AI-generated code (HTML, React, SVG) doesn't just appear in a chat bubble. It opens in a dedicated side-by-side panel with live preview, so you can iterate on working software, not just read about it.

### OpenClaw Integration

Perci includes native support for [OpenClaw](https://github.com/openclaw/openclaw) — a production-grade local AI gateway. This gives you persistent agent memory, cross-session continuity, and access to local models through a unified interface. Perci auto-detects OpenClaw on your system and installs the gateway if missing.

### Terminal

A built-in terminal for running shell commands, managing dev servers, and interacting with your system — all without leaving the workspace.

### Advanced Reasoning UI

Watch models think in real-time. Collapsible reasoning sections show the AI's thought process, token usage, and duration — streamed as it happens.

---

## Quick Start

### Prerequisites

- **Node.js** 18+
- **npm** or **yarn**
- **Git**

### Installation

```bash
git clone https://github.com/toshon-jennings/opal.git
cd opal
npm install
npm run dev
```

For the desktop app (Electron):

```bash
npm run electron:dev
```

To package for your platform:

```bash
npm run electron:build      # default platform
npm run electron:build:mac  # macOS
npm run electron:build:win  # Windows
npm run electron:build:linux # Linux
```

### API Keys

Perci requires API keys for cloud providers. Keys are stored locally in the browser's localStorage — never sent to any server. Add them in Settings → API Keys.

Local models (Ollama, LM Studio, vLLM) require no API key.

---

## Development

### Project Structure

```
src/
├── components/     # React UI components
│   ├── AgentsPanel.jsx       # Multi-agent orchestration UI
│   ├── ArtifactPanel.jsx     # Code/preview panel
│   ├── BuildMode.jsx         # AI app builder
│   ├── CodeMode.jsx          # Code editor surface
│   ├── CoworkMode.jsx        # Parallel agent sessions
│   ├── MissionControl.jsx    # Mission orchestration dashboard
│   ├── ModeSwitcher.jsx      # Chat / Build / Code / Cowork
│   ├── Terminal.jsx          # Built-in terminal
│   └── ...
├── context/        # Global state (ModeContext, ChatContext, BuildContext)
├── lib/            # Core logic
│   ├── llm/                  # LLM provider clients (factory pattern)
│   ├── IntelligentSearchTool.js  # Deep research & web search
│   ├── missionControl.js     # Mission run tracking & validation
│   ├── terminalBridge.js     # Terminal IPC
│   └── ...
electron/         # Electron main process
```

### Tech Stack

- **Frontend**: React 18, Tailwind CSS, Framer Motion
- **Build**: Vite 5
- **Desktop**: Electron 39
- **Markdown**: react-markdown + remark-gfm
- **Syntax Highlighting**: react-syntax-highlighter
- **Icons**: Lucide React

### Available Scripts

```bash
npm run dev           # Start dev server
npm run build         # Production build
npm run preview       # Preview production build
npm run lint          # Lint
npm run electron:dev  # Electron dev mode
npm run electron:build # Package desktop app
```

---

## Architecture

Perci's codebase is organized around a central event bus (`appendMissionRunEvent()`) that connects the mission control system to the UI layer. The graph analysis (514 nodes, 1047 edges, 31 communities) shows clean separation of concerns with zero import cycles.

Key architectural communities:
- **Mission Event Logging** — Central event bus (19 edges, #1 hub)
- **App Core and Providers** — Window/dock system, mode routing (#2 hub)
- **UI Navigation and Settings** — Mode switcher, settings, API key management
- **LLM Provider Clients** — Factory pattern across 6+ providers
- **Code and Cowork Modes** — Parallel agent orchestration
- **Artifact Preview Security** — Sandboxed iframes, CSP, budget enforcement

See `docs/architecture/GRAPH_ANALYSIS_2026-06-07.md` for the full breakdown.

---

## License

MIT — see [LICENSE](LICENSE).

---

<div align="center">

**[⬆ back to top](#-perci)**

</div>
