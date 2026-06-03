const { app, BrowserWindow, ipcMain, dialog, Menu, shell, safeStorage } = require('electron');
const { installRedactedConsole } = require('./redact-console.cjs');
const path = require('path');
const fsSync = require('fs');
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const https = require('https');
const net = require('net');
const isDev = process.env.NODE_ENV === 'development';

installRedactedConsole();

// macOS uses app.getName() for the "About <name>" menu item; package.json's
// "name" is lowercase ("opal"), so override it to the product name.
app.setName('Opal');

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
  try { fsSync.appendFileSync(getRendererLogPath(), stamped); } catch (_) {}
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
  wc.on('will-navigate', (event, url) => {
    appendRendererLog(`will-navigate url=${url}`);
    if (!isDev && isBundledAssetDocumentUrl(url)) {
      event.preventDefault();
      appendRendererLog(`blocked-bundled-asset-navigation url=${url}`);
    }
  });
  wc.on('did-navigate', (_event, url) => {
    appendRendererLog(`did-navigate url=${url}`);
  });
  wc.on('did-create-window', (_window, details) => {
    appendRendererLog(`did-create-window url=${details?.url || ''}`);
  });
}

let terminalServerProcess = null;
let mainWindow = null;
let splashWindow = null;
let youtubeWindow = null;

function isBundledAssetDocumentUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  if (parsed.protocol !== 'file:') return false;
  const pathname = decodeURIComponent(parsed.pathname);
  return /\/dist\/assets\/[^/]+\.(?:js|css)$/.test(pathname)
    || /\/node_modules\/@webcontainer\/api\/dist\/.+\.js$/.test(pathname);
}

function requestJson(url, timeoutMs = 2000) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      resolve({ ok: false, url, error: err.message });
      return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const startedAt = Date.now();
    const req = client.get(parsed, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => {
        let data = null;
        try {
          data = body ? JSON.parse(body) : null;
        } catch (err) {
          resolve({
            ok: false,
            url,
            status: res.statusCode,
            error: `Invalid JSON response: ${err.message}`,
            latencyMs: Date.now() - startedAt
          });
          return;
        }

        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          url,
          status: res.statusCode,
          data,
          latencyMs: Date.now() - startedAt
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, url, error: 'Connection timed out', latencyMs: Date.now() - startedAt });
    });
    req.on('error', err => {
      resolve({ ok: false, url, error: err.message, latencyMs: Date.now() - startedAt });
    });
  });
}

function commandExists(command, extraPaths = []) {
  const envPath = [process.env.PATH || '', ...extraPaths].filter(Boolean).join(path.delimiter);
  const result = spawnSync('which', [command], {
    env: { ...process.env, PATH: envPath },
    encoding: 'utf8'
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

function getJanCommandPath() {
  const home = app.getPath('home');
  return commandExists('jan', [
    path.join(home, '.local', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ]);
}

function findJanModelFiles() {
  const home = app.getPath('home');
  const modelsRoot = path.join(home, 'Library', 'Application Support', 'Jan', 'data', 'llamacpp', 'models');
  const models = [];

  function walk(dir) {
    let entries = [];
    try {
      entries = fsSync.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.name !== 'model.gguf') continue;

      const modelDir = path.dirname(fullPath);
      const id = path.relative(modelsRoot, modelDir).split(path.sep).join('/');
      let size = null;
      try {
        size = fsSync.statSync(fullPath).size;
      } catch {}
      models.push({ id, name: id, path: fullPath, size });
    }
  }

  walk(modelsRoot);
  return models.sort((a, b) => a.id.localeCompare(b.id));
}

async function probeOpenAICompatibleProvider({ id, name, endpoints }) {
  for (const endpoint of endpoints) {
    const modelsUrl = `${endpoint.replace(/\/$/, '')}/v1/models`;
    const result = await requestJson(modelsUrl);
    if (result.ok) {
      const models = Array.isArray(result.data?.data)
        ? result.data.data
            .filter(model => model.id && !String(model.id).toLowerCase().includes('embed'))
            .map(model => ({ id: model.id, name: model.id, owned_by: model.owned_by }))
        : [];
      return {
        id,
        name,
        status: models.length > 0 ? 'ready' : 'running-empty',
        endpoint,
        modelCount: models.length,
        models,
        latencyMs: result.latencyMs
      };
    }
  }

  return {
    id,
    name,
    status: 'offline',
    endpoint: endpoints[0],
    modelCount: 0,
    models: [],
    error: 'Local API server is not reachable'
  };
}

async function discoverModelProviders() {
  const [ollamaTags, lmStudio, janApi6767, janApi1337, openClawHealth] = await Promise.all([
    requestJson('http://localhost:11434/api/tags'),
    probeOpenAICompatibleProvider({
      id: 'lmstudio',
      name: 'LM Studio',
      endpoints: ['http://localhost:1234']
    }),
    probeOpenAICompatibleProvider({
      id: 'jan',
      name: 'Jan',
      endpoints: ['http://127.0.0.1:6767']
    }),
    probeOpenAICompatibleProvider({
      id: 'jan',
      name: 'Jan',
      endpoints: ['http://127.0.0.1:1337']
    }),
    requestJson('http://127.0.0.1:18789/health')
  ]);

  const janCommand = getJanCommandPath();
  const janModelsOnDisk = findJanModelFiles();
  const janApi = janApi6767.status === 'ready' || janApi6767.status === 'running-empty' ? janApi6767 : janApi1337;
  const janStatus = janApi.status === 'ready'
    ? 'ready'
    : janModelsOnDisk.length > 0
      ? 'installed-stopped'
      : janCommand
        ? 'installed-empty'
        : 'not-installed';

  const ollamaModels = Array.isArray(ollamaTags.data?.models)
    ? ollamaTags.data.models.map(model => ({ id: model.name, name: model.name, size: model.size, modified: model.modified_at }))
    : [];

  return {
    generatedAt: Date.now(),
    providers: [
      {
        id: 'ollama',
        name: 'Ollama',
        status: ollamaTags.ok ? (ollamaModels.length > 0 ? 'ready' : 'running-empty') : 'offline',
        endpoint: 'http://localhost:11434',
        modelCount: ollamaModels.length,
        models: ollamaModels,
        latencyMs: ollamaTags.latencyMs,
        error: ollamaTags.ok ? '' : ollamaTags.error
      },
      lmStudio,
      {
        id: 'jan',
        name: 'Jan',
        status: janStatus,
        endpoint: janApi.endpoint || 'http://127.0.0.1:6767',
        modelCount: janApi.modelCount || janModelsOnDisk.length,
        models: janApi.models?.length ? janApi.models : janModelsOnDisk,
        latencyMs: janApi.latencyMs,
        installed: Boolean(janCommand || fsSync.existsSync('/Applications/Jan.app')),
        cliPath: janCommand,
        error: janStatus === 'installed-stopped' ? 'Jan models are installed, but the local API server is not running.' : janApi.error
      },
      {
        id: 'openclaw',
        name: 'OpenClaw',
        status: openClawHealth.ok ? 'ready' : 'offline',
        endpoint: 'http://127.0.0.1:18789',
        modelCount: 0,
        models: [],
        latencyMs: openClawHealth.latencyMs,
        error: openClawHealth.ok ? '' : openClawHealth.error
      }
    ]
  };
}

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
  const terminalPort = process.env.OPAL_TERMINAL_PORT || (isDev ? '3002' : '3001');
  const serverPath = isPackaged 
    ? path.join(process.resourcesPath, 'app.asar', 'terminal-server.cjs')
    : path.join(__dirname, '..', 'terminal-server.cjs');

  console.log(`Starting Opal Terminal Server from: ${serverPath}`);
  
  // Use Electron's process.execPath to ensure node is available even if not in system PATH
  terminalServerProcess = spawn(process.execPath, [serverPath], {
    env: { 
      ...process.env, 
      ELECTRON_RUN_AS_NODE: '1',
      OPAL_STRIP_ANSI: 'false',
      OPAL_TERMINAL_PORT: terminalPort
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
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isBundledAssetDocumentUrl(url)) {
      appendRendererLog(`blocked-bundled-asset-window url=${url}`);
      return { action: 'deny' };
    }

    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        shell.openExternal(url);
      }
    } catch (err) {
      appendRendererLog(`blocked-window-open invalid-url=${url}`);
    }
    appendRendererLog(`blocked-window-open url=${url}`);
    return { action: 'deny' };
  });
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
  app.on('web-contents-created', (_event, contents) => {
    contents.setWindowOpenHandler(({ url }) => {
      if (isBundledAssetDocumentUrl(url)) {
        appendRendererLog(`blocked-global-bundled-asset-window url=${url}`);
        return { action: 'deny' };
      }

      try {
        const parsed = new URL(url);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
          shell.openExternal(url);
        }
      } catch (err) {
        appendRendererLog(`blocked-global-window-open invalid-url=${url}`);
      }
      appendRendererLog(`blocked-global-window-open url=${url}`);
      return { action: 'deny' };
    });

    contents.on('will-navigate', (event, url) => {
      if (!isDev && isBundledAssetDocumentUrl(url)) {
        event.preventDefault();
        appendRendererLog(`blocked-global-bundled-asset-navigation url=${url}`);
      }
    });
  });

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

ipcMain.handle('openclaw:read-config', async () => {
  try {
    const configPath = path.join(app.getPath('home'), '.openclaw', 'openclaw.json');
    const raw = await fs.readFile(configPath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading openclaw config:', err);
    return { error: err.message };
  }
});

ipcMain.handle('openclaw:write-config', async (event, config) => {
  try {
    const configPath = path.join(app.getPath('home'), '.openclaw', 'openclaw.json');
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    return { ok: true };
  } catch (err) {
    console.error('Error writing openclaw config:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('openclaw:read-diary', async () => {
  try {
    const diaryPath = path.join(app.getPath('home'), '.openclaw', 'workspace', 'DIARY.md');
    const content = await fs.readFile(diaryPath, 'utf-8');
    return { ok: true, content };
  } catch (err) {
    if (err.code === 'ENOENT') return { ok: true, content: '' };
    console.error('Error reading OpenClaw diary:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('openclaw:write-diary', async (event, content) => {
  try {
    const diaryPath = path.join(app.getPath('home'), '.openclaw', 'workspace', 'DIARY.md');
    await fs.writeFile(diaryPath, content, 'utf-8');
    return { ok: true };
  } catch (err) {
    console.error('Error writing OpenClaw diary:', err);
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('models:discover-providers', async () => {
  try {
    return await discoverModelProviders();
  } catch (err) {
    return { generatedAt: Date.now(), providers: [], error: err.message };
  }
});

ipcMain.handle('models:start-jan-server', async (event, options = {}) => {
  const janCommand = getJanCommandPath();
  if (!janCommand) {
    return { ok: false, error: 'Jan CLI was not found. Install Jan or add jan to PATH.' };
  }

  const modelId = typeof options.modelId === 'string' && options.modelId.trim()
    ? options.modelId.trim()
    : findJanModelFiles()[0]?.id;

  if (!modelId) {
    return { ok: false, error: 'No Jan models were found on disk.' };
  }

  const port = Number(options.port || 6767);
  const logPath = path.join(app.getPath('userData'), 'jan-serve.log');
  const child = spawn(janCommand, ['serve', modelId, '--port', String(port), '--detach', '--log', logPath], {
    env: {
      ...process.env,
      PATH: [path.dirname(janCommand), process.env.PATH || ''].filter(Boolean).join(path.delimiter)
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false
  });

  let stdout = '';
  let stderr = '';
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });

  return new Promise((resolve) => {
    child.on('error', err => {
      resolve({ ok: false, error: err.message, modelId, port, logPath });
    });
    child.on('close', async (code) => {
      const endpoint = `http://127.0.0.1:${port}`;
      const probe = await requestJson(`${endpoint}/v1/models`, 5000);
      resolve({
        ok: probe.ok,
        code,
        modelId,
        port,
        endpoint,
        logPath,
        output: stdout.trim(),
        error: probe.ok ? '' : (stderr.trim() || probe.error || stdout.trim() || 'Jan server did not become reachable.')
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
