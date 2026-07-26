const { contextBridge, ipcRenderer } = require('electron');

// The splash window runs with nodeIntegration disabled and contextIsolation
// enabled, so splash.html cannot require('electron') for itself. This is the
// only channel it needs: one fire-and-forget signal saying the animation is
// over and the main window may be revealed.
contextBridge.exposeInMainWorld('splashAPI', {
  done: () => ipcRenderer.send('splash:done'),
});
