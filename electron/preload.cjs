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
  getOpenClawLocalProfile: () => ipcRenderer.invoke('openclaw:get-local-profile'),
  testOpenClawConnection: (profile) => ipcRenderer.invoke('openclaw:test-connection', profile),
  restartOpenClawGateway: () => ipcRenderer.invoke('openclaw:restart-gateway'),
  readOpenClawConfig: () => ipcRenderer.invoke('openclaw:read-config'),
  writeOpenClawConfig: (config) => ipcRenderer.invoke('openclaw:write-config'),
  discoverModelProviders: () => ipcRenderer.invoke('models:discover-providers'),
  startJanServer: (options) => ipcRenderer.invoke('models:start-jan-server', options),
  openHermesApp: (appPath) => ipcRenderer.invoke('hermes:open-app', appPath),
  openYouTubePlayer: (url) => ipcRenderer.invoke('youtube-player:open', url),
  closeYouTubePlayer: () => ipcRenderer.invoke('youtube-player:close'),
  onYouTubePlayerClosed: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('youtube-player:closed', listener);
    return () => ipcRenderer.removeListener('youtube-player:closed', listener);
  },
});
