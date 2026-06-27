# Perci Secret and Delivery Security Audit - 2026-06-26

## Scope

Audited Perci as a user-facing Electron app, focused on:

- Hardcoded API keys, access tokens, credentials, private keys, and `.env` leaks.
- Secret persistence and renderer exposure paths.
- Secret leakage through logs, URLs, model/tool calls, and previews.
- Local-machine assumptions that can make the app unsafe or non-deliverable.

The packaged app file list in `package.json` currently includes `dist/**/*`,
`electron/**/*`, and `terminal-server.cjs`, so source and freshly built `dist/`
were both scanned.

## Confirmed Clean

- No high-confidence OpenAI, OpenRouter, Anthropic, Gemini, Groq, GitHub, AWS,
  Slack, or private-key patterns were found in tracked source after excluding
  vendor/generated noise.
- No matching live-key patterns were found in the freshly generated `dist/`
  bundle.
- No `.env` or `.env*` files were present in the working tree scan.
- Git history checks found no matching high-confidence provider key patterns
  and no `.env` history.
- The broad `api_key` / `secret` / `token` scan produced references,
  placeholders, field names, and expected provider code, not hardcoded live
  credentials.

## Fixed In This Pass

- Added encrypted-at-rest coverage and read-time migration for `github_key`,
  `gdash_google_client_secret`, and AgentMail credentials.
- Stopped `agentmail:get-credentials` from returning the stored AgentMail API
  key to the renderer. It now returns only `has_api_key` plus `inbox_id`.
- Redacted renderer diagnostic logs before writing them to disk.
- Bound the terminal websocket to loopback and added a per-process token so
  unrelated local pages cannot drive Perci's shell bridge by guessing the port.
- Removed `rehypeRaw` from chat, saved chat message, and Code-mode markdown
  rendering so model output is not parsed into raw DOM HTML.
- Rendered AgentMail HTML bodies as text instead of using
  `dangerouslySetInnerHTML`.
- Routed HTML/SVG chat artifact previews through the existing CSP wrapper and
  loaded them in a locked iframe sandbox.
- Moved Gemini API keys from URL query strings to the `x-goog-api-key` header.
- Enforced the advertised tool allowlist at execution time.
- Replaced renderer-provided shell string interpolation in
  `run-terminal-command` with argv-based process launches.
- Disabled shell mode for agent CLI subprocess launches.
- Removed the TimesFM hardcoded `/Users/toshonjennings/opal` path and shell
  wrapper; the tool now resolves the selected workspace and passes JSON as argv.

## Residual Findings

### Medium: provider keys still enter the renderer by design

The main chat/provider flow still hydrates provider API keys into renderer state
because provider requests are made from renderer code. That is not a hardcoded
owner-secret leak, but it means any future XSS/regression in renderer output
handling can expose a user's BYO keys. The fixes above reduce the known unsafe
model/email HTML paths. A stronger future architecture would move cloud LLM
calls behind main-process IPC handlers and expose only key status to the
renderer.

### Medium: decrypted `app-data:get` remains broad

`app-data:get` still returns decrypted app data for compatibility with existing
settings and chat hydration. This is safer after the raw HTML paths were
removed, but it is still too broad for least privilege. Split secret read/write
IPC by feature before treating this as fully hardened.

### Medium: generated/local app preview iframes still allow scripts

`PreviewPanel`, `Workbench`, and the AutoForge fallback iframe still allow
scripts and same-origin behavior for local app previews. This is distinct from
the patched model/email preview path, but generated app previews should be
treated as untrusted. Prefer stricter origin isolation or a dedicated preview
host/process before enabling arbitrary remote preview URLs.

### Low: tracked `.mcp.json` is machine-bound

`.mcp.json` is tracked and contains machine-local MCP configuration. It was not
found to contain live secrets and is not part of the packaged Electron file list,
but it is a repo-delivery portability risk. Replace absolute local paths with a
template or remove it from the committed app repo if it is only for local agent
development.

### Low: AgentMail bridge packaging needs an explicit decision

The Electron main process references `scripts/agentmail_bridge.py`, but
`package.json` only packages `dist/**/*`, `electron/**/*`, and
`terminal-server.cjs`. If AgentMail is meant to ship, include the bridge in the
builder file list and make sure its Python runtime/dependency story is
documented. If not, gate the surface in packaged builds.

## Validation

- `node --check electron/main.cjs`
- `node --check electron/preload.cjs`
- `node --check terminal-server.cjs`
- `npm run build`
- Tracked source high-confidence secret scan
- Git history high-confidence secret scan
- `.env` history scan
- Fresh `dist` high-confidence secret scan
- Focused scans for `rehypeRaw`, `dangerouslySetInnerHTML`, Gemini query-string
  keys, terminal websocket auth, and shell-mode execution

## Conclusion

No hardcoded live API keys or private credentials were found. The immediate
owner-risk paths found during audit were fixed, especially plaintext credential
storage gaps, key readback to the renderer, unsafe model/email HTML rendering,
Gemini key URL leakage, unauthenticated terminal websocket access, and shell
string interpolation. The remaining work is architectural hardening for
least-privilege secret access and preview isolation.
