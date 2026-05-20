const { app, BrowserWindow, ipcMain, dialog, Menu, shell, safeStorage } = require('electron');
const { installRedactedConsole } = require('./redact-console.cjs');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const net = require('net');
const isDev = process.env.NODE_ENV === 'development';

installRedactedConsole();

// Renderer crash log — written to userData so it survives packaged builds.
// Path is logged on startup so users can find it after a blank-screen failure.
let rendererLogPath = null;
function getRendererLogPath() {
  if (rendererLogPath) return rendererLogPath;
  try {
    rendererLogPath = path.join(app.getPath('userData'), 'renderer.log');
  } catch (_) {
    rendererLogPath = path.join(require('os').tmpdir(), 'opal-renderer.log');
  }
  return rendererLogPath;
}
function appendRendererLog(line) {
  const stamped = `[${new Date().toISOString()}] ${line}\n`;
  try { fs.appendFileSync(getRendererLogPath(), stamped); } catch (_) {}
  try { console.log(`[renderer] ${line}`); } catch (_) {}
}
function attachRendererDiagnostics(win) {
  const wc = win.webContents;
  wc.on('console-message', (_event, level, message, line, sourceId) => {
    const levels = ['log', 'warn', 'error', 'info'];
    const label = levels[level] || `lvl${level}`;
    appendRendererLog(`console.${label} ${sourceId}:${line} — ${message}`);
  });
  wc.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
    appendRendererLog(`did-fail-load ${errorCode} ${errorDescription} url=${validatedURL}`);
  });
  wc.on('render-process-gone', (_e, details) => {
    appendRendererLog(`render-process-gone reason=${details.reason} exitCode=${details.exitCode}`);
  });
  wc.on('preload-error', (_e, preloadPath, error) => {
    appendRendererLog(`preload-error path=${preloadPath} error=${error && error.stack || error}`);
  });
  wc.on('did-finish-load', () => {
    appendRendererLog(`did-finish-load url=${wc.getURL()}`);
  });
}

let terminalServerProcess = null;
let mainWindow = null;
let splashWindow = null;
let youtubeWindow = null;

// Track the two conditions required before revealing the main window
const splashGate = { mainReady: false, splashDone: false };

function tryRevealMain() {
  if (!splashGate.mainReady || !splashGate.splashDone) return;

  // Snap main window to the exact position of the splash so they perfectly overlap
  if (mainWindow && !mainWindow.isDestroyed() && splashWindow && !splashWindow.isDestroyed()) {
    mainWindow.setBounds(splashWindow.getBounds());
  }

  // Show main window underneath the still-visible splash
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.showInactive();
  }

  // Fade the splash out over ~350ms, then close it and focus main
  if (splashWindow && !splashWindow.isDestroyed()) {
    let opacity = 1.0;
    const fade = setInterval(() => {
      opacity -= 0.05; // 20 steps × ~17ms ≈ 340ms
      if (!splashWindow || splashWindow.isDestroyed()) {
        clearInterval(fade);
        return;
      }
      if (opacity <= 0) {
        clearInterval(fade);
        splashWindow.close();
        splashWindow = null;
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.focus();
      } else {
        splashWindow.setOpacity(opacity);
      }
    }, 17);
  }
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    backgroundColor: '#1c1c1c',
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.on('closed', () => { splashWindow = null; });
}

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
    show: false,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      webviewTag: true,
    },
  });

  mainWindow = win;
  attachRendererDiagnostics(win);
  appendRendererLog(`createWindow: renderer log at ${getRendererLogPath()}`);
  win.once('ready-to-show', () => {
    splashGate.mainReady = true;
    tryRevealMain();
  });
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
  createSplashWindow();
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

// Splash screen gate — fires when the video finishes playing
ipcMain.on('splash:done', () => {
  splashGate.splashDone = true;
  tryRevealMain();
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
  'mistral_key',
  'openclaw_config',
  'hermes_config'
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

ipcMain.handle('open-external', async (event, url) => {
  if (!url || typeof url !== 'string') return false;
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  await shell.openExternal(url);
  return true;
});

function deriveOpenClawHttpUrl(profile = {}) {
  if (profile.controlUrl) return profile.controlUrl;
  const gatewayUrl = profile.gatewayUrl || 'ws://127.0.0.1:18789';
  try {
    const parsed = new URL(gatewayUrl);
    parsed.protocol = parsed.protocol === 'wss:' ? 'https:' : 'http:';
    parsed.pathname = profile.controlPath || '/openclaw';
    parsed.search = '';
    parsed.hash = '';
    return parsed.toString();
  } catch {
    return 'http://127.0.0.1:18789/openclaw';
  }
}

function deriveOpenClawSocketTarget(profile = {}) {
  const gatewayUrl = profile.gatewayUrl || 'ws://127.0.0.1:18789';
  try {
    const parsed = new URL(gatewayUrl);
    return {
      host: parsed.hostname || '127.0.0.1',
      port: Number(parsed.port || (parsed.protocol === 'wss:' ? 443 : 80))
    };
  } catch {
    return { host: '127.0.0.1', port: 18789 };
  }
}

ipcMain.handle('openclaw:get-local-profile', async () => {
  try {
    const configPath = path.join(app.getPath('home'), '.openclaw', 'openclaw.json');
    const raw = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(raw);
    const gateway = config?.gateway || {};
    const port = Number(gateway.port || 18789);
    const basePath = gateway.controlUi?.basePath || '/openclaw';
    const host = gateway.bind === 'lan' ? '0.0.0.0' : '127.0.0.1';
    return {
      mode: gateway.mode || 'local',
      gatewayUrl: `ws://${host === '0.0.0.0' ? '127.0.0.1' : host}:${port}`,
      controlUrl: `http://127.0.0.1:${port}${basePath}`,
      token: gateway.auth?.token || ''
    };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('openclaw:test-connection', async (event, profile = {}) => {
  const startedAt = Date.now();
  const target = deriveOpenClawSocketTarget(profile);

  return new Promise((resolve) => {
    const socket = net.createConnection(target);
    const timeout = setTimeout(() => {
      socket.destroy();
      resolve({
        ok: false,
        status: null,
        url: profile.gatewayUrl || 'ws://127.0.0.1:18789',
        error: 'Connection timed out',
        latencyMs: Date.now() - startedAt
      });
    }, 3000);

    socket.once('connect', () => {
      clearTimeout(timeout);
      socket.end();
      resolve({
        ok: true,
        status: 'listening',
        url: profile.gatewayUrl || 'ws://127.0.0.1:18789',
        latencyMs: Date.now() - startedAt
      });
    });

    socket.once('error', (err) => {
      clearTimeout(timeout);
      resolve({
        ok: false,
        status: null,
        url: profile.gatewayUrl || 'ws://127.0.0.1:18789',
        error: err.message,
        latencyMs: Date.now() - startedAt
      });
    });
  });
});

ipcMain.handle('openclaw:restart-gateway', async () => {
  return new Promise((resolve) => {
    const child = spawn('openclaw', ['gateway', 'restart'], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env
    });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', chunk => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', chunk => {
      stderr += chunk.toString();
    });
    child.on('error', err => {
      resolve({ ok: false, error: err.message });
    });
    child.on('close', code => {
      resolve({
        ok: code === 0,
        code,
        output: stdout.trim(),
        error: stderr.trim() || (code === 0 ? '' : stdout.trim())
      });
    });
  });
});

ipcMain.handle('hermes:open-app', async (event, customPath) => {
  const os = require('os');
  const candidates = [
    customPath,
    '/Applications/Mercury.app',
    '/Applications/Hermes Agent.app',
    path.join(os.homedir(), 'Applications', 'Mercury.app'),
    path.join(os.homedir(), 'hermes-desktop', 'build', 'Hermes Agent.app'),
    path.join(os.homedir(), 'hermes-desktop', 'build', 'Mercury.app'),
    path.join(os.homedir(), 'Applications', 'Hermes Agent.app'),
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat) {
        const err = await shell.openPath(candidate);
        if (!err) return { ok: true, path: candidate };
      }
    } catch {
      // not found at this path, try next
    }
  }
  return { ok: false, error: 'Mercury app not found. Set the path in Settings > Mercury.' };
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
