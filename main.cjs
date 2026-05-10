const { app, BrowserWindow, ipcMain, dialog, Menu, shell, safeStorage } = require('electron');
const { installRedactedConsole } = require('./electron/redact-console.cjs');
const path = require('path');
const { spawn } = require('child_process');
const isDev = process.env.NODE_ENV === 'development';

installRedactedConsole();

let terminalServerProcess = null;
let mainWindow = null;
let youtubeWindow = null;

function startTerminalServer() {
  const isPackaged = app.isPackaged;
  const serverPath = isPackaged 
    ? path.join(process.resourcesPath, 'app.asar', 'terminal-server.cjs')
    : path.join(__dirname, '..', 'terminal-server.cjs');

  console.log(`Starting Opal Terminal Server from: ${serverPath}`);
  
  // Use Electron's process.execPath to ensure node is available even if not in system PATH
  terminalServerProcess = spawn(process.execPath, [serverPath], {
    env: { 
      ...process.env, 
      ELECTRON_RUN_AS_NODE: '1',
      OPAL_STRIP_ANSI: 'false' 
    },
    stdio: 'inherit'
  });

  terminalServerProcess.on('error', (err) => {
    console.error('Failed to start Opal Terminal Server:', err);
  });

  terminalServerProcess.on('close', (code) => {
    console.log(`Terminal server process exited with code ${code}`);
    if (code !== 0 && code !== null) {
      console.log('Restarting terminal server in 2 seconds...');
      setTimeout(startTerminalServer, 2000);
    }
  });
}

function createMenu() {
  const template = [
    ...(process.platform === 'darwin' ? [{
      label: 'Opal',
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    }] : []),
    {
      label: 'File',
      submenu: [
        {
          label: 'New Chat',
          accelerator: 'CmdOrCtrl+N',
          click: (menuItem, browserWindow) => {
            browserWindow.webContents.send('menu-action', 'new-chat');
          }
        },
        {
          label: 'Choose Project Folder...',
          accelerator: 'CmdOrCtrl+O',
          click: (menuItem, browserWindow) => {
            browserWindow.webContents.send('menu-action', 'choose-folder');
          }
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Chat Mode',
          accelerator: 'CmdOrCtrl+1',
          click: (menuItem, browserWindow) => {
            browserWindow.webContents.send('menu-action', 'switch-mode-chat');
          }
        },
        {
          label: 'Cowork Mode',
          accelerator: 'CmdOrCtrl+2',
          click: (menuItem, browserWindow) => {
            browserWindow.webContents.send('menu-action', 'switch-mode-cowork');
          }
        },
        {
          label: 'Code Mode',
          accelerator: 'CmdOrCtrl+3',
          click: (menuItem, browserWindow) => {
            browserWindow.webContents.send('menu-action', 'switch-mode-code');
          }
        },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(process.platform === 'darwin' ? [
          { type: 'separator' },
          { role: 'front' },
          { type: 'separator' },
          { role: 'window' }
        ] : [
          { role: 'close' }
        ])
      ]
    },
    {
      role: 'help',
      submenu: [
        {
          label: 'Learn More',
          click: async () => {
            await shell.openExternal('https://github.com/Damienchakma/Open-claude');
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

function getYouTubeVideoId(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      return parsed.pathname.split('/').filter(Boolean)[0] || null;
    }

    if (host !== 'youtube.com' && host !== 'youtube-nocookie.com') {
      return null;
    }

    if (parsed.pathname === '/watch') {
      return parsed.searchParams.get('v');
    }

    if (parsed.pathname.startsWith('/embed/') || parsed.pathname.startsWith('/shorts/')) {
      return parsed.pathname.split('/').filter(Boolean)[1] || null;
    }

    return null;
  } catch (err) {
    return null;
  }
}

function getYouTubeWatchUrl(url) {
  const videoId = getYouTubeVideoId(url);
  if (!videoId) {
    throw new Error('Only YouTube video URLs can be opened in the PiP player.');
  }
  const watchUrl = new URL('https://www.youtube.com/watch');
  watchUrl.searchParams.set('v', videoId);
  return watchUrl.toString();
}

function createYouTubePlayerWindow(parentWindow, url) {
  const playerUrl = getYouTubeWatchUrl(url);

  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    youtubeWindow.loadURL(playerUrl);
    youtubeWindow.show();
    youtubeWindow.focus();
    return;
  }

  const parentBounds = parentWindow?.getBounds();
  const defaultBounds = {
    width: 520,
    height: 340,
    x: parentBounds ? parentBounds.x + parentBounds.width - 560 : undefined,
    y: parentBounds ? parentBounds.y + 80 : undefined,
  };

  youtubeWindow = new BrowserWindow({
    ...defaultBounds,
    title: 'YouTube PiP',
    parent: parentWindow || undefined,
    alwaysOnTop: true,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      partition: 'persist:opal-youtube',
    },
  });

  youtubeWindow.webContents.setUserAgent(
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  );

  youtubeWindow.on('closed', () => {
    youtubeWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('youtube-player:closed');
    }
  });

  youtubeWindow.loadURL(playerUrl);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
  });

  mainWindow = win;
  win.on('closed', () => {
    if (youtubeWindow && !youtubeWindow.isDestroyed()) {
      youtubeWindow.close();
    }
    if (mainWindow === win) {
      mainWindow = null;
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  if (isDev) {
    win.webContents.openDevTools();
  }
}

app.whenReady().then(() => {
  startTerminalServer();
  createMenu();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (terminalServerProcess) {
    terminalServerProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Native folder selection
ipcMain.handle('select-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  if (result.canceled) {
    return null;
  } else {
    return result.filePaths[0];
  }
});

const fs = require('fs').promises;
const appDataFileName = 'opal-data.json';
const encryptedValueMarker = '__opalEncryptedValue';
const apiKeyStorageKeys = new Set([
  'openai_key',
  'groq_key',
  'gemini_key',
  'tavily_key',
  'openrouter_key',
  'anthropic_key',
  'mistral_key'
]);

function getAppDataPath() {
  return path.join(app.getPath('userData'), appDataFileName);
}

function encryptAppDataValue(key, value) {
  if (!apiKeyStorageKeys.has(key) || typeof value !== 'string' || value.length === 0) {
    return value;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn(`OS encryption is unavailable; storing ${key} without safeStorage encryption.`);
    return value;
  }

  return {
    [encryptedValueMarker]: true,
    value: safeStorage.encryptString(value).toString('base64')
  };
}

function decryptAppDataValue(key, value) {
  if (!apiKeyStorageKeys.has(key)) return value;
  if (!value || typeof value !== 'object' || value[encryptedValueMarker] !== true || typeof value.value !== 'string') {
    return value;
  }

  try {
    return safeStorage.decryptString(Buffer.from(value.value, 'base64'));
  } catch (err) {
    console.error(`Error decrypting stored ${key}:`, err);
    return '';
  }
}

function encryptAppData(data) {
  return Object.fromEntries(
    Object.entries(data || {}).map(([key, value]) => [key, encryptAppDataValue(key, value)])
  );
}

function decryptAppData(data) {
  return Object.fromEntries(
    Object.entries(data || {}).map(([key, value]) => [key, decryptAppDataValue(key, value)])
  );
}

async function readAppData() {
  try {
    const raw = await fs.readFile(getAppDataPath(), 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? decryptAppData(parsed) : {};
  } catch (err) {
    if (err.code === 'ENOENT') return {};
    console.error('Error reading app data:', err);
    return {};
  }
}

async function writeAppData(data) {
  const filePath = getAppDataPath();
  const safeData = data && typeof data === 'object' ? data : {};
  const payload = {
    ...encryptAppData(safeData),
    schemaVersion: 1,
    updatedAt: Date.now()
  };
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return decryptAppData(payload);
}

// Toggle DevTools
ipcMain.on('toggle-devtools', (event) => {
  event.sender.toggleDevTools();
});

ipcMain.handle('app-data:path', async () => getAppDataPath());

ipcMain.handle('app-data:get', async () => readAppData());

ipcMain.handle('app-data:set', async (event, data) => {
  try {
    const current = await readAppData();
    return await writeAppData({ ...current, ...(data || {}) });
  } catch (err) {
    console.error('Error writing app data:', err);
    throw err;
  }
});

ipcMain.handle('youtube-player:open', async (event, url) => {
  const parentWindow = BrowserWindow.fromWebContents(event.sender) || mainWindow;
  createYouTubePlayerWindow(parentWindow, url);
  return true;
});

ipcMain.handle('youtube-player:close', async () => {
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    youtubeWindow.close();
  }
  return true;
});

// Recursive file listing
async function getFiles(dir, baseDir = dir) {
  const dirents = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(dirents.map((dirent) => {
    const res = path.resolve(dir, dirent.name);
    
    const ignoreList = [
      'node_modules', '.git', '.vite', 'dist', 'dist_electron', 
      '.DS_Store', 'package-lock.json', 'yarn.lock', '.next', '.output'
    ];
    
    if (ignoreList.includes(dirent.name)) {
      return [];
    }
    
    return dirent.isDirectory() ? getFiles(res, baseDir) : res.replace(baseDir + path.sep, '');
  }));
  return Array.prototype.concat(...files);
}

ipcMain.handle('list-files', async (event, dirPath) => {
  try {
    const files = await getFiles(dirPath);
    return files;
  } catch (err) {
    console.error('Error listing files:', err);
    return [];
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (err) {
    console.error('Error reading file:', err);
    throw err;
  }
});

ipcMain.handle('write-file', async (event, { filePath, content }) => {
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing file:', err);
    throw err;
  }
});
