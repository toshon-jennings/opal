const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  getDefaultNotesPath: () => ipcRenderer.invoke('get-default-notes-path'),
  registerWorkspace: (path) => ipcRenderer.invoke('register-workspace', path),
  runLocalCommand: (command, args, cwd) => ipcRenderer.invoke('run-local-command', { command, args, cwd }),
  onMenuAction: (callback) => ipcRenderer.on('menu-action', (event, action) => callback(action)),
  toggleDevTools: () => ipcRenderer.send('toggle-devtools'),
  listFiles: (path) => ipcRenderer.invoke('list-files', path),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  writeFile: (path, content) => ipcRenderer.invoke('write-file', { filePath: path, content }),
  deleteFile: (path) => ipcRenderer.invoke('delete-file', path),
  renameFile: (oldPath, newPath) => ipcRenderer.invoke('rename-file', { oldPath, newPath }),
  getAppData: () => ipcRenderer.invoke('app-data:get'),
  setAppData: (data) => ipcRenderer.invoke('app-data:set', data),
  getAppDataPath: () => ipcRenderer.invoke('app-data:path'),
  getTerminalConnectionInfo: () => ipcRenderer.invoke('terminal:get-connection-info'),
  getKlipitExtensionId: () => ipcRenderer.invoke('get-klipit-extension-id'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  webSearch: (query, options) => ipcRenderer.invoke('web-search', { query, options }),
  showContextMenu: (params) => ipcRenderer.send('show-context-menu', params),
  onContextMenuAction: (callback) => {
    const listener = (event, data) => callback(data);
    ipcRenderer.on('context-menu-action', listener);
    return () => ipcRenderer.removeListener('context-menu-action', listener);
  },
  // StudioOS API proxy — avoids CORS by routing through the main process.
  studioos: {
    fetch: ({ apiBase, apiKey, path, method, body }) =>
      ipcRenderer.invoke('studioos:fetch', { apiBase, apiKey, path, method, body })
  },
  listAgentJobs: (options) => ipcRenderer.invoke('agent-jobs:list', options),
  queueAgentJob: (job) => ipcRenderer.invoke('agent-jobs:queue', job),
  cancelAgentJob: (id) => ipcRenderer.invoke('agent-jobs:cancel', id),
  queueJulesJob: (job) => ipcRenderer.invoke('jules:queue', job),
  listGitHubRepos: () => ipcRenderer.invoke('github:list-repos'),
  detectLocalRepo: () => ipcRenderer.invoke('git:detect-local-repo'),
  runTerminalCommand: (command) => ipcRenderer.invoke('run-terminal-command', command),
  listAgentActivity: () => ipcRenderer.invoke('agent-jobs:activity'),
  getOpenClawLocalProfile: () => ipcRenderer.invoke('openclaw:get-local-profile'),
  testOpenClawConnection: (profile) => ipcRenderer.invoke('openclaw:test-connection', profile),
  getOpenClawGatewayStatus: (profile) => ipcRenderer.invoke('openclaw:gateway-status', profile),
  startOpenClawEvents: (profile) => ipcRenderer.invoke('openclaw:events-start', profile),
  stopOpenClawEvents: () => ipcRenderer.invoke('openclaw:events-stop'),
  onOpenClawEvent: (callback) => {
    const listener = (event, evt) => callback(evt);
    ipcRenderer.on('openclaw:event', listener);
    return () => ipcRenderer.removeListener('openclaw:event', listener);
  },
  runOpenClawAgent: (opts) => ipcRenderer.invoke('openclaw:agent-run', opts),
  restartOpenClawGateway: () => ipcRenderer.invoke('openclaw:restart-gateway'),
  readOpenClawConfig: () => ipcRenderer.invoke('openclaw:read-config'),
  writeOpenClawConfig: (config) => ipcRenderer.invoke('openclaw:write-config', config),
  readOpenClawDiary: () => ipcRenderer.invoke('openclaw:read-diary'),
  writeOpenClawDiary: (content) => ipcRenderer.invoke('openclaw:write-diary', content),
  discoverModelProviders: () => ipcRenderer.invoke('models:discover-providers'),
  startJanServer: (options) => ipcRenderer.invoke('models:start-jan-server', options),
  detectBarsProviders: () => ipcRenderer.invoke('bars:detect-providers'),
  askBars: (payload) => ipcRenderer.invoke('bars:ask', payload),
  getBarsApiKeyStatus: () => ipcRenderer.invoke('bars:get-api-key-status'),
  saveBarsApiKeys: (payload) => ipcRenderer.invoke('bars:save-api-keys', payload),
  clearBarsApiKeys: () => ipcRenderer.invoke('bars:clear-api-keys'),
  describeMarkItDownImage: (payload) => ipcRenderer.invoke('markitdown:describe-image', payload),
  startMarkItDownServer: () => ipcRenderer.invoke('markitdown:start-server'),
  getMarkItDownServerStatus: () => ipcRenderer.invoke('markitdown:server-status'),
  installMarkItDownExifTool: () => ipcRenderer.invoke('markitdown:install-exiftool'),
  getHermesStatus: () => ipcRenderer.invoke('hermes:status'),
  runHermesTask: (opts) => ipcRenderer.invoke('hermes:run', opts),
  cancelHermesRun: () => ipcRenderer.invoke('hermes:run-cancel'),
  onHermesRunEvent: (callback) => {
    const listener = (event, evt) => callback(evt);
    ipcRenderer.on('hermes:run-event', listener);
    return () => ipcRenderer.removeListener('hermes:run-event', listener);
  },
  startHermesLogs: () => ipcRenderer.invoke('hermes:logs-start'),
  stopHermesLogs: () => ipcRenderer.invoke('hermes:logs-stop'),
  onHermesLogEvent: (callback) => {
    const listener = (event, evt) => callback(evt);
    ipcRenderer.on('hermes:log-event', listener);
    return () => ipcRenderer.removeListener('hermes:log-event', listener);
  },
  listHermesSessions: (opts) => ipcRenderer.invoke('hermes:sessions', opts),
  getHermesInsights: (opts) => ipcRenderer.invoke('hermes:insights', opts),
  getHermesDashboardStatus: () => ipcRenderer.invoke('hermes:dashboard-status'),
  startHermesDashboard: () => ipcRenderer.invoke('hermes:dashboard-start'),
  getHermesMemory: () => ipcRenderer.invoke('hermes:memory'),
  startHermesChat: (opts) => ipcRenderer.invoke('hermes:chat-start', opts),
  sendHermesChat: (opts) => ipcRenderer.invoke('hermes:chat-send', opts),
  stopHermesChat: () => ipcRenderer.invoke('hermes:chat-stop'),
  cancelHermesChat: () => ipcRenderer.invoke('hermes:chat-cancel'),
  // Lighthouse port scanning
  lighthouseScan: () => ipcRenderer.invoke('lighthouse:scan'),
  lighthouseCheckPort: (port) => ipcRenderer.invoke('lighthouse:check-port', { port }),
  lighthouseSuggestPort: () => ipcRenderer.invoke('lighthouse:suggest-port'),
  lighthouseProcessDetails: (pid) => ipcRenderer.invoke('lighthouse:process-details', { pid }),
  lighthouseKillProcess: (pid) => ipcRenderer.invoke('lighthouse:kill-process', { pid }),
  lighthouseFindReferences: (oldPort, newPort) => ipcRenderer.invoke('lighthouse:find-references', { oldPort, newPort }),
  lighthouseApplyFix: (filePath, lineNumber, newLine, oldLine) => ipcRenderer.invoke('lighthouse:apply-fix', { filePath, lineNumber, newLine, oldLine }),
  // G-Dash (Google Workspace dashboard) — BYO OAuth client; tokens stay in main.
  gdashStatus: () => ipcRenderer.invoke('gdash:status'),
  gdashConnect: () => ipcRenderer.invoke('gdash:connect'),
  gdashDisconnect: () => ipcRenderer.invoke('gdash:disconnect'),
  gdashDashboard: () => ipcRenderer.invoke('gdash:dashboard'),
  // Eidos — persistent memory service (Docker/OrbStack lifecycle + dashboard).
  eidosStatus: () => ipcRenderer.invoke('eidos:status'),
  eidosStart: () => ipcRenderer.invoke('eidos:start'),
  eidosStop: () => ipcRenderer.invoke('eidos:stop'),
  eidosRestart: () => ipcRenderer.invoke('eidos:restart'),
  eidosProgress: () => ipcRenderer.invoke('eidos:progress'),
  eidosInsights: () => ipcRenderer.invoke('eidos:insights'),
  // Cleanmac — developer cache cleanup runner.
  cleanmacInspectDocker: () => ipcRenderer.invoke('cleanmac:inspect-docker'),
  cleanmacRun: () => ipcRenderer.invoke('cleanmac:run'),
  onCleanmacOutput: (callback) => {
    const listener = (event, { type, data }) => callback(type, data);
    ipcRenderer.on('cleanmac:output', listener);
    return () => ipcRenderer.removeListener('cleanmac:output', listener);
  },
  // Packages Dashboard APIs
  packagesScan: () => ipcRenderer.invoke('packages:scan'),
  packagesGetConfig: () => ipcRenderer.invoke('packages:get-config'),
  packagesSetConfig: (config) => ipcRenderer.invoke('packages:set-config', config),
  onUpdaterState: (callback) => {
    const listener = (event, state) => callback(state);
    ipcRenderer.on('updater:state', listener);
    return () => ipcRenderer.removeListener('updater:state', listener);
  },
  triggerUpdaterAction: (action) => ipcRenderer.invoke('updater:action', action),
  detectAgentCLIs: () => ipcRenderer.invoke('skills:detect-agents'),
  getInstalledSkills: () => ipcRenderer.invoke('skills:get-installed'),
  getCodingExpertStatus: () => ipcRenderer.invoke('skills:get-coding-expert-status'),
  getPlaybookSkills: () => ipcRenderer.invoke('skills:get-playbook-skills'),
  setSkillMetadata: (data) => ipcRenderer.invoke('skills:set-metadata', data),
  getSkillMetadata: () => ipcRenderer.invoke('skills:get-metadata'),
  // AgentMail — credential management (webview loads AgentMail directly)
  agentmailGetCredentials: () => ipcRenderer.invoke('agentmail:get-credentials'),
  agentmailSetCredentials: (api_key, inbox_id) => ipcRenderer.invoke('agentmail:set-credentials', { api_key, inbox_id }),
  agentmailClearCredentials: () => ipcRenderer.invoke('agentmail:clear-credentials'),
  // AutoForge — autonomous coding agent (start/stop/status)
  autoforgeStatus: () => ipcRenderer.invoke('autoforge:status'),
  autoforgeStart: () => ipcRenderer.invoke('autoforge:start'),
  autoforgeStop: () => ipcRenderer.invoke('autoforge:stop'),
});
