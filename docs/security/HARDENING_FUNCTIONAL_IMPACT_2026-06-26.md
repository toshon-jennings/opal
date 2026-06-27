# Hardening Functional Impact - 2026-06-26

This checklist tracks functionality affected by the Perci secret/security audit
changes. It is meant to guide product QA without reverting the hardening.

## Fixed After Audit

### AgentMail inboxes/messages

- Security change: AgentMail API keys are encrypted and no longer returned to
  renderer code.
- Functional risk: the AgentMail bridge startup `configure` response could be
  delivered to the first real request (`list-inboxes`), causing an empty inbox
  view.
- Follow-up fix: main process now consumes the startup configure response
  separately before queueing user requests.
- QA: restart Perci, open AgentMail, confirm inboxes list, select inbox, confirm
  message list and message detail load.

### TimesFM tools

- Security change: shell-wrapped `bash -c` calls and hardcoded
  `/Users/toshonjennings/opal` paths were removed.
- Functional risk: using plain `python3` could bypass the project
  `timesfm-venv`.
- Follow-up fix: TimesFM now prefers the selected workspace's
  `timesfm-venv/bin/python` through argv-safe execution and falls back to
  `python3` only when the venv executable is missing.
- QA: choose the workspace, run a TimesFM forecast and plot through chat tools.

## Expected Behavior Changes

### AgentMail email body rendering

- HTML emails are now displayed as text, not trusted HTML.
- This removes remote email formatting and clickable embedded layouts, but also
  prevents malicious email HTML from running inside the Electron renderer.
- Attachments are still listed.

### AgentMail credential UI

- Saved API keys are not prefilled or readable by the renderer anymore.
- The UI should rely on `has_api_key` status, not the key value.
- Reconnecting/replacing the key still works through the password field.

### Chat and Code markdown

- Raw HTML in ordinary assistant/chat markdown is no longer rendered as DOM.
- Users may see literal HTML tags in normal chat responses.
- HTML/SVG intended for preview should be produced as artifacts, not inline
  markdown.

### HTML/SVG artifact side preview

- Static HTML/SVG artifacts now load through a CSP-wrapped document in a locked
  iframe sandbox.
- Inline scripts, forms, network requests, and same-origin script behavior will
  not work in this side preview.
- This is intentional for model-generated HTML/SVG. Interactive generated app
  previews remain a separate surface.

### Terminal bridge

- The terminal websocket now requires a per-process token and binds to loopback.
- Perci's Terminal panel and Mission Control were updated to request the token.
- External/manual websocket clients that connect directly to the terminal port
  will fail unless they go through Perci's IPC-token flow.
- QA: restart Perci, open Terminal, confirm prompt and Mission Control terminal
  command dispatch still work.

### Gemini provider

- Gemini keys now travel in `x-goog-api-key` headers instead of URL query
  strings.
- Expected behavior should be unchanged. If model listing or streaming fails,
  check whether the failing endpoint accepts the header and whether CORS allows
  it in the renderer context.

### Tool use

- The model can only execute tools that were advertised in the current request.
- If a model guesses or hallucinates a hidden tool name, Perci returns a tool
  error instead of running it.
- This may surface as stricter behavior for missing GitHub/API configuration,
  but it prevents hidden local/write tools from being invoked accidentally.

### Local terminal command launcher

- `run-terminal-command` no longer interpolates commands into shell strings.
- Allowed commands still open in Terminal, but unusual shell-only syntax inside
  the command string may not behave the same.

### Agent CLI subprocess launch

- Agent jobs are spawned without `shell: true`.
- Normal CLI launches by executable name should keep working.
- Any workflow depending on shell alias expansion, shell functions, or compound
  shell syntax in the executable field needs to be converted to explicit argv.

## Remaining QA Targets

- AgentMail inbox list, message list, message detail, send, reply, forward.
- Terminal panel connect/reconnect and Mission Control command dispatch/cancel.
- Gemini model list and chat streaming.
- Chat/Code responses containing raw HTML.
- HTML/SVG artifact preview and React/Build preview surfaces.
- TimesFM forecast/plot.
- GitHub integration tool calls with and without a configured token.
- Agent jobs for each configured CLI.
