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
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  webSearch: (query, options) => ipcRenderer.invoke('web-search', { query, options }),
  // StudioOS API proxy — avoids CORS by routing through the main process.
  studioos: {
    fetch: ({ apiBase, apiKey, path, method, body }) =>
      ipcRenderer.invoke('studioos:fetch', { apiBase, apiKey, path, method, body })
  },
  listAgentJobs: (options) => ipcRenderer.invoke('agent-jobs:list', options),
  queueAgentJob: (job) => ipcRenderer.invoke('agent-jobs:queue', job),
  cancelAgentJob: (id) => ipcRenderer.invoke('agent-jobs:cancel', id),
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
  writeOpenClawConfig: (config) => ipcRenderer.invoke('openclaw:write-config'),
  readOpenClawDiary: () => ipcRenderer.invoke('openclaw:read-diary'),
  writeOpenClawDiary: (content) => ipcRenderer.invoke('openclaw:write-diary', content),
  discoverModelProviders: () => ipcRenderer.invoke('models:discover-providers'),
  startJanServer: (options) => ipcRenderer.invoke('models:start-jan-server', options),
  detectBarsProviders: () => ipcRenderer.invoke('bars:detect-providers'),
  askBars: (payload) => ipcRenderer.invoke('bars:ask', payload),
  getBarsApiKeyStatus: () => ipcRenderer.invoke('bars:get-api-key-status'),
  saveBarsApiKeys: (payload) => ipcRenderer.invoke('bars:save-api-keys', payload),
  clearBarsApiKeys: () => ipcRenderer.invoke('bars:clear-api-keys'),
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
  startHermesChat: (opts) => ipcRenderer.invoke('hermes:chat-start', opts),
  sendHermesChat: (opts) => ipcRenderer.invoke('hermes:chat-send', opts),
  stopHermesChat: () => ipcRenderer.invoke('hermes:chat-stop'),
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
});
