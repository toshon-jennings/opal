const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('splashAPI', {
  sendDone: () => ipcRenderer.send('splash:done')
});
