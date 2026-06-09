const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electron', {
  selectDirectory: () => ipcRenderer.invoke('select-directory'),
  onMenuAction: (callback) => ipcRenderer.on('menu-action', (event, action) => callback(action)),
  toggleDevTools: () => ipcRenderer.send('toggle-devtools'),
  listFiles: (path) => ipcRenderer.invoke('list-files', path),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  writeFile: (path, content) => ipcRenderer.invoke('write-file', { filePath: path, content }),
  getAppData: () => ipcRenderer.invoke('app-data:get'),
  setAppData: (data) => ipcRenderer.invoke('app-data:set', data),
  getAppDataPath: () => ipcRenderer.invoke('app-data:path'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  webSearch: (query, options) => ipcRenderer.invoke('web-search', { query, options }),
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
  openHermesApp: (appPath) => ipcRenderer.invoke('hermes:open-app', appPath),
});
