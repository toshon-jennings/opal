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
  openYouTubePlayer: (url) => ipcRenderer.invoke('youtube-player:open', url),
  closeYouTubePlayer: () => ipcRenderer.invoke('youtube-player:close'),
  onYouTubePlayerClosed: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('youtube-player:closed', listener);
    return () => ipcRenderer.removeListener('youtube-player:closed', listener);
  },
});
