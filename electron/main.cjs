const { app, BrowserWindow, ipcMain, dialog, Menu, shell, safeStorage } = require('electron');
const { installRedactedConsole } = require('./redact-console.cjs');
const path = require('path');
const fsSync = require('fs');
const { spawn, spawnSync } = require('child_process');
const { randomUUID, randomBytes, createHash } = require('crypto');
const http = require('http');
const https = require('https');
const net = require('net');
const isDev = process.env.NODE_ENV === 'development';

const allowedPaths = new Set();

function isPathAllowed(targetPath) {
  if (!targetPath || typeof targetPath !== 'string') return false;
  try {
    const resolvedTarget = path.resolve(targetPath);
    
    // Always allow paths inside standard app directories
    const allowedRoots = [
      app.getPath('temp'),
      app.getPath('userData'),
      app.getAppPath()
    ];
    
    for (const root of allowedRoots) {
      const resolvedRoot = path.resolve(root);
      const relative = path.relative(resolvedRoot, resolvedTarget);
      if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
        return true;
      }
    }
    
    // Allow paths inside registered workspaces
    for (const root of allowedPaths) {
      const resolvedRoot = path.resolve(root);
      const relative = path.relative(resolvedRoot, resolvedTarget);
      if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) {
        return true;
      }
    }
  } catch (err) {
    console.error('Error resolving path security check:', err);
  }
  return false;
}

installRedactedConsole();

// macOS uses app.getName() for the "About <name>" menu item; package.json's
// "name" is lowercase ("perci"), so override it to the product name.
app.setName('Perci');

// Enrich process.env.PATH with common CLI locations, especially on macOS
if (process.platform === 'darwin' || process.platform === 'linux') {
  const home = app.getPath('home');
  const extraPaths = [
    path.join(home, '.local', 'bin'),
    path.join(home, '.hermes', 'node', 'bin'),
    path.join(home, 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin'
  ];
  const currentPath = process.env.PATH || '';
  const pathParts = currentPath.split(path.delimiter);
  for (const extra of extraPaths) {
    if (!pathParts.includes(extra)) {
      pathParts.push(extra);
    }
  }
  process.env.PATH = pathParts.join(path.delimiter);
}

// Renderer crash log — written to userData so it survives packaged builds.
// Path is logged on startup so users can find it after a blank-screen failure.
let rendererLogPath = null;
function getRendererLogPath() {
  if (rendererLogPath) return rendererLogPath;
  try {
    rendererLogPath = path.join(app.getPath('userData'), 'renderer.log');
  } catch (_) {
    rendererLogPath = path.join(require('os').tmpdir(), 'perci-renderer.log');
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
      return;
    }
    // The renderer is a single-page app and must never navigate its own top
    // frame. A stray form submit or anchor click that targets the app's origin
    // would otherwise trigger a full reload, wiping in-memory UI state (open
    // windows, scroll, unsaved input). Block same-origin top-frame navigations;
    // this does not affect Vite HMR (location.reload), the OpenClaw <webview>
    // (separate webContents), or external links (different origin).
    try {
      if (new URL(url).origin === new URL(wc.getURL()).origin) {
        event.preventDefault();
        appendRendererLog(`blocked-self-navigation url=${url}`);
      }
    } catch {
      /* unparseable URL — leave default behavior */
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

function requestJson(url, timeoutMs = 2000, headers = {}) {
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
    const req = client.get(parsed, { timeout: timeoutMs, headers }, (res) => {
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

function requestText(url, timeoutMs = 8000, headers = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      resolve({ ok: false, url, error: err.message });
      return;
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      resolve({ ok: false, url, error: 'Unsupported protocol' });
      return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const startedAt = Date.now();
    const req = client.get(parsed, { timeout: timeoutMs, headers }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        body += chunk;
        if (body.length > 1_000_000) req.destroy(new Error('Response too large'));
      });
      res.on('end', () => {
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          url,
          status: res.statusCode,
          body,
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

function requestJsonWithBody(url, { method = 'GET', body = null, headers = {}, timeoutMs = 12000 } = {}) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      resolve({ ok: false, url, error: err.message });
      return;
    }

    if (!['http:', 'https:'].includes(parsed.protocol)) {
      resolve({ ok: false, url, error: 'Unsupported protocol' });
      return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const payload = body == null
      ? null
      : (typeof body === 'string' ? body : JSON.stringify(body));

    const mergedHeaders = {
      Accept: 'application/json',
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}),
      ...headers
    };

    const startedAt = Date.now();
    const req = client.request(parsed, { method, timeout: timeoutMs, headers: mergedHeaders }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', chunk => {
        raw += chunk;
        if (raw.length > 2_000_000) req.destroy(new Error('Response too large'));
      });
      res.on('end', () => {
        const contentType = res.headers['content-type'] || '';
        let parsedBody = null;
        if (raw && contentType.includes('application/json')) {
          try { parsedBody = JSON.parse(raw); }
          catch (err) { resolve({ ok: false, url, status: res.statusCode, error: `Invalid JSON: ${err.message}`, latencyMs: Date.now() - startedAt }); return; }
        }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          url,
          status: res.statusCode,
          body: parsedBody,
          text: parsedBody == null ? raw : null,
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

    if (payload) req.write(payload);
    req.end();
  });
}

function decodeHtmlEntities(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/&#(\d+);/g, (_match, code) => String.fromCharCode(Number(code)));
}

function stripHtml(value = '') {
  return decodeHtmlEntities(String(value).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function normalizeDuckDuckGoUrl(rawUrl = '') {
  try {
    const parsed = new URL(decodeHtmlEntities(rawUrl), 'https://duckduckgo.com');
    const uddg = parsed.searchParams.get('uddg');
    if (uddg) return decodeURIComponent(uddg);
    return parsed.toString();
  } catch {
    return '';
  }
}

function parseDuckDuckGoResults(html, maxResults = 6) {
  const results = [];
  const seen = new Set();
  const titlePattern = /<a[^>]+class="[^"]*\bresult__a\b[^"]*"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const snippetPattern = /<a[^>]+class="result__snippet"[\s\S]*?>([\s\S]*?)<\/a>|<div[^>]+class="result__snippet"[\s\S]*?>([\s\S]*?)<\/div>/;

  const titleMatches = [...html.matchAll(titlePattern)];
  for (let i = 0; i < titleMatches.length; i++) {
    if (results.length >= maxResults) break;
    const titleMatch = titleMatches[i];

    const url = normalizeDuckDuckGoUrl(titleMatch[1]);
    if (!url || seen.has(url) || !/^https?:\/\//i.test(url)) continue;
    seen.add(url);

    const nextIndex = titleMatches[i + 1]?.index || html.length;
    const block = html.slice(titleMatch.index, nextIndex);
    const snippetMatch = block.match(snippetPattern);
    const title = stripHtml(titleMatch[2]);
    const snippet = stripHtml(snippetMatch?.[1] || snippetMatch?.[2] || title);

    results.push({
      id: results.length + 1,
      title,
      url,
      content: snippet,
      score: 1,
      publishedDate: null
    });
  }

  return results;
}

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

function parseHistoryDateFromQuery(query) {
  const text = String(query || '').toLowerCase();
  const monthPattern = new RegExp(`\\b(${MONTH_NAMES.join('|')})\\s+(\\d{1,2})\\b`, 'i');
  const monthMatch = text.match(monthPattern);
  if (monthMatch) {
    const month = MONTH_NAMES.indexOf(monthMatch[1].toLowerCase()) + 1;
    const day = Number(monthMatch[2]);
    if (month >= 1 && day >= 1 && day <= 31) return { month, day };
  }

  const numericMatch = text.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-]\d{2,4})?\b/);
  if (numericMatch) {
    const month = Number(numericMatch[1]);
    const day = Number(numericMatch[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) return { month, day };
  }

  const now = new Date();
  return { month: now.getMonth() + 1, day: now.getDate() };
}

function isHistoryDateQuery(query) {
  return /this day in history|on this day|historical events/i.test(String(query || ''));
}

function formatWikimediaHistorySources(data, month, day, maxResults = 8) {
  const events = Array.isArray(data?.events) ? data.events : [];
  return events.slice(0, maxResults).map((event, index) => {
    const primaryPage = Array.isArray(event.pages) ? event.pages[0] : null;
    const year = event.year ? `${event.year}: ` : '';
    return {
      id: index + 1,
      title: `${year}${stripHtml(event.text || primaryPage?.title || 'Historical event')}`,
      url: primaryPage?.content_urls?.desktop?.page || `https://en.wikipedia.org/wiki/${MONTH_NAMES[month - 1]}_${day}`,
      content: `${year}${stripHtml(event.text || '')}`,
      score: 1,
      publishedDate: null
    };
  });
}

async function searchWikimediaOnThisDay(query, maxResults = 8) {
  const { month, day } = parseHistoryDateFromQuery(query);
  const url = `https://api.wikimedia.org/feed/v1/wikipedia/en/onthisday/events/${month}/${day}`;
  const response = await requestJson(url, 8000, {
    'User-Agent': 'Perci/1.0 (https://perci.local)'
  });

  if (!response.ok) {
    return {
      ok: false,
      error: response.error || `Wikimedia on-this-day lookup failed with status ${response.status || 'unknown'}`,
      sources: []
    };
  }

  const sources = formatWikimediaHistorySources(response.data, month, day, maxResults);
  return {
    ok: sources.length > 0,
    query,
    sources,
    provider: 'wikimedia-onthisday',
    error: sources.length > 0 ? null : 'No Wikimedia on-this-day events found'
  };
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

  console.log(`Starting Perci Terminal Server from: ${serverPath}`);
  
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
    console.error('Failed to start Perci Terminal Server:', err);
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
      label: 'Perci',
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
        ...(isDev ? [{ role: 'toggleDevTools' }] : []),
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
      devTools: isDev,
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
    if (mainWindow === win) {
      mainWindow = null;
      stopOpenClawLogStream();
      stopHermesLogStream();
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
  stopOpenClawLogStream();
  stopHermesLogStream();
  if (hermesActiveRun) {
    try { hermesActiveRun.child.kill('SIGTERM'); } catch { /* already gone */ }
    hermesActiveRun = null;
  }
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
    const chosenPath = result.filePaths[0];
    if (chosenPath) {
      allowedPaths.add(path.resolve(chosenPath));
    }
    return chosenPath;
  }
});

const fs = require('fs').promises;
const appDataFileName = 'perci-data.json';
const encryptedValueMarker = '__perciEncryptedValue';
const apiKeyStorageKeys = new Set([
  'openai_key',
  'groq_key',
  'gemini_key',
  'openrouter_key',
  'anthropic_key',
  'mistral_key',
  'openclaw_config',
  'hermes_config',
  'gdash_google_client_id',
  'gdash_google_tokens'
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
  const filePath = getAppDataPath();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? decryptAppData(parsed) : {};
    } catch (err) {
      if (err.code === 'ENOENT') return {};
      // Partial write or corrupted data — retry after a short delay
      if (attempt < 2) {
        await new Promise(resolve => setTimeout(resolve, 50 * (attempt + 1)));
        continue;
      }
      console.error('Error reading app data:', err);
      return {};
    }
  }
  return {};
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
  // Atomic write: write to a temp file, then rename to avoid partial reads
  const tmpPath = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf-8');
  await fs.rename(tmpPath, filePath);
  return decryptAppData(payload);
}

// Toggle DevTools (dev builds only)
ipcMain.on('toggle-devtools', (event) => {
  if (!isDev) return;
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

// ─────────────────────────────────────────────────────────────────────────────
// G-Dash — Google Workspace dashboard (Bring-Your-Own OAuth client)
//
// Desktop OAuth 2.0 with PKCE + loopback redirect (no client secret). Access and
// refresh tokens are persisted encrypted in appData (safeStorage, via the
// gdash_google_tokens key) and never leave the main process — the renderer/iframe
// only ever receives the assembled dashboard object. The client ID is supplied by
// the user in Settings (gdash_google_client_id); nothing Google-owned ships in the
// repo. Read-only scopes only.
// ─────────────────────────────────────────────────────────────────────────────
const GDASH_CLIENT_ID_KEY = 'gdash_google_client_id';
const GDASH_CLIENT_SECRET_KEY = 'gdash_google_client_secret';
const GDASH_TOKENS_KEY = 'gdash_google_tokens';
const GDASH_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GDASH_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo';
const GDASH_SCOPES = [
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/tasks.readonly',
  'https://www.googleapis.com/auth/gmail.readonly',
];
const GDASH_CALLBACK_HTML = `<!doctype html><html><head><meta charset="utf-8"><title>G-Dash</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:#0b0d12;color:#e7ebf2;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}.card{text-align:center;padding:40px 48px;border-radius:16px;background:#141821;box-shadow:0 10px 40px rgba(0,0,0,.4)}h1{font-size:18px;margin:0 0 8px}p{color:#8b93a7;font-size:14px;margin:0}</style></head>
<body><div class="card"><h1>&#10003; Connected to G-Dash</h1><p>You can close this tab and return to Perci.</p></div></body></html>`;

function gdashBase64Url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function gdashPkce() {
  const verifier = gdashBase64Url(randomBytes(32));
  const challenge = gdashBase64Url(createHash('sha256').update(verifier).digest());
  return { verifier, challenge };
}

async function gdashReadClientId() {
  const data = await readAppData();
  const id = data[GDASH_CLIENT_ID_KEY];
  return typeof id === 'string' ? id.trim() : '';
}

async function gdashReadClientSecret() {
  const data = await readAppData();
  const secret = data[GDASH_CLIENT_SECRET_KEY];
  return typeof secret === 'string' ? secret.trim() : '';
}

async function gdashReadTokens() {
  const data = await readAppData();
  const raw = data[GDASH_TOKENS_KEY];
  if (typeof raw !== 'string' || !raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function gdashWriteTokens(tokens) {
  const current = await readAppData();
  await writeAppData({ ...current, [GDASH_TOKENS_KEY]: JSON.stringify(tokens) });
}

async function gdashClearTokens() {
  const current = await readAppData();
  delete current[GDASH_TOKENS_KEY];
  await writeAppData(current);
}

// Spin up a loopback server on an ephemeral 127.0.0.1 port to capture the OAuth
// redirect. Resolves with { server, port, codePromise }; codePromise settles with
// the authorization code (or rejects on error / 5-min timeout).
function gdashStartLoopback(expectedState) {
  return new Promise((resolve, reject) => {
    let settle;
    const codePromise = new Promise((res, rej) => { settle = { res, rej }; });
    const timeout = setTimeout(() => settle.rej(new Error('Sign-in timed out. Try again.')), 5 * 60 * 1000);

    const server = http.createServer((req, res) => {
      let parsed;
      try { parsed = new URL(req.url, 'http://127.0.0.1'); } catch { res.writeHead(400); res.end(); return; }
      if (parsed.pathname !== '/' && parsed.pathname !== '/callback') { res.writeHead(404); res.end(); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(GDASH_CALLBACK_HTML);
      clearTimeout(timeout);
      const err = parsed.searchParams.get('error');
      const code = parsed.searchParams.get('code');
      const state = parsed.searchParams.get('state');
      if (err) return settle.rej(new Error(err));
      if (state !== expectedState) return settle.rej(new Error('State mismatch — sign-in aborted.'));
      if (!code) return settle.rej(new Error('No authorization code returned.'));
      return settle.res(code);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, codePromise }));
  });
}

async function gdashRunOAuth(clientId, clientSecret) {
  const { verifier, challenge } = gdashPkce();
  const state = gdashBase64Url(randomBytes(16));
  const { server, port, codePromise } = await gdashStartLoopback(state);
  const redirectUri = `http://127.0.0.1:${port}`;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GDASH_SCOPES.join(' '));
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  await shell.openExternal(authUrl.toString());

  let code;
  try {
    code = await codePromise;
  } finally {
    server.close();
  }

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: verifier,
    redirect_uri: redirectUri,
  });
  const resp = await fetch(GDASH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) {
    const errBody = await resp.text();
    console.error(`[gdash] Token exchange failed (${resp.status}):`, errBody);
    // Common causes: client type is "Web application" instead of "Desktop app",
    // or the copied string includes extra characters (quotes, trailing spaces).
    throw new Error(`Token exchange failed (${resp.status}). Check that the OAuth client is type "Desktop app" and that the Client ID was copied exactly. Google said: ${errBody}`);
  }
  const tok = await resp.json();
  const tokens = {
    access_token: tok.access_token,
    refresh_token: tok.refresh_token || null,
    expiry_date: Date.now() + (Number(tok.expires_in) || 3600) * 1000,
    scope: tok.scope || GDASH_SCOPES.join(' '),
  };
  await gdashWriteTokens(tokens);
  return tokens;
}

async function gdashRefreshAccessToken(clientId, tokens) {
  if (!tokens.refresh_token) throw new Error('No refresh token — reconnect your Google account.');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tokens.refresh_token,
    client_id: clientId,
  });
  const resp = await fetch(GDASH_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  if (!resp.ok) throw new Error(`Token refresh failed (${resp.status}).`);
  const tok = await resp.json();
  const next = {
    ...tokens,
    access_token: tok.access_token,
    expiry_date: Date.now() + (Number(tok.expires_in) || 3600) * 1000,
    scope: tok.scope || tokens.scope,
  };
  if (tok.refresh_token) next.refresh_token = tok.refresh_token; // Google rotates these only sometimes.
  await gdashWriteTokens(next);
  return next;
}

// Returns a valid access token, refreshing if it expires within 60s. Returns null
// when there are no stored tokens (i.e. not connected).
async function gdashEnsureAccessToken(clientId) {
  let tokens = await gdashReadTokens();
  if (!tokens || !tokens.access_token) return null;
  if (tokens.expiry_date && tokens.expiry_date < Date.now() + 60_000) {
    tokens = await gdashRefreshAccessToken(clientId, tokens);
  }
  return tokens.access_token;
}

async function gdashApiGet(url, accessToken) {
  const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!resp.ok) throw new Error(`Google API ${resp.status} for ${url}`);
  return resp.json();
}

async function gdashSettle(fn, fallback) {
  try { return await fn(); } catch (err) { console.warn('[gdash] partial fetch failed:', err.message); return fallback; }
}

// Assemble the same dashboard shape the old /api/google-connect/dashboard returned,
// so the reused renderer code works unchanged. Each sub-fetch degrades gracefully.
async function gdashBuildDashboard(accessToken) {
  const driveFiles = async (mimeType) => {
    const q = encodeURIComponent(mimeType ? `mimeType = '${mimeType}' and trashed = false` : 'trashed = false');
    const fields = encodeURIComponent('files(id,name,mimeType,webViewLink)');
    const url = `https://www.googleapis.com/drive/v3/files?pageSize=5&q=${q}&fields=${fields}&orderBy=modifiedTime%20desc`;
    const data = await gdashApiGet(url, accessToken);
    return data.files || [];
  };

  const [profile, recentFiles, docs, sheets, slides, storageQuota, events, taskItems, gmail] = await Promise.all([
    gdashSettle(async () => {
      const d = await gdashApiGet(GDASH_USERINFO_URL, accessToken);
      return { email: d.email || null, name: d.name || null, givenName: d.given_name || null };
    }, { email: null, name: null, givenName: null }),
    gdashSettle(() => driveFiles(), []),
    gdashSettle(() => driveFiles('application/vnd.google-apps.document'), []),
    gdashSettle(() => driveFiles('application/vnd.google-apps.spreadsheet'), []),
    gdashSettle(() => driveFiles('application/vnd.google-apps.presentation'), []),
    gdashSettle(async () => {
      const d = await gdashApiGet('https://www.googleapis.com/drive/v3/about?fields=storageQuota', accessToken);
      return d.storageQuota || null;
    }, null),
    gdashSettle(async () => {
      const timeMin = encodeURIComponent(new Date().toISOString());
      const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${timeMin}&maxResults=3&orderBy=startTime&singleEvents=true`;
      const d = await gdashApiGet(url, accessToken);
      return d.items || [];
    }, []),
    gdashSettle(async () => {
      const lists = await gdashApiGet('https://tasks.googleapis.com/tasks/v1/users/@me/lists?maxResults=1', accessToken);
      const listId = lists.items && lists.items[0] && lists.items[0].id;
      if (!listId) return [];
      const d = await gdashApiGet(`https://tasks.googleapis.com/tasks/v1/lists/${encodeURIComponent(listId)}/tasks?maxResults=5&showCompleted=true&showHidden=true`, accessToken);
      return d.items || [];
    }, []),
    gdashSettle(async () => {
      const list = await gdashApiGet('https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=2', accessToken);
      const unreadCount = list.resultSizeEstimate || 0;
      const messages = await Promise.all((list.messages || []).map(async (m) => {
        const detail = await gdashApiGet(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject`, accessToken);
        const headers = (detail.payload && detail.payload.headers) || [];
        const getH = (name) => (headers.find((h) => (h.name || '').toLowerCase() === name.toLowerCase()) || {}).value || '';
        return { id: detail.id, subject: getH('Subject') || '(No Subject)', from: getH('From') || 'Unknown' };
      }));
      return { unreadCount, messages };
    }, { unreadCount: 0, messages: [] }),
  ]);

  return {
    connected: true,
    hasClientId: true,
    profile,
    drive: { recentFiles, storageQuota },
    docs,
    sheets,
    slides,
    calendar: { events },
    tasks: { items: taskItems },
    gmail,
  };
}

ipcMain.handle('gdash:status', async () => {
  const clientId = await gdashReadClientId();
  const tokens = await gdashReadTokens();
  return { hasClientId: Boolean(clientId), connected: Boolean(tokens && tokens.access_token) };
});

ipcMain.handle('gdash:connect', async () => {
  try {
    const clientId = await gdashReadClientId();
    if (!clientId) return { ok: false, error: 'no-client-id' };
    const clientSecret = await gdashReadClientSecret();
    if (!clientSecret) return { ok: false, error: 'no-client-secret' };
    const tokens = await gdashRunOAuth(clientId, clientSecret);
    let profile = null;
    try {
      const d = await gdashApiGet(GDASH_USERINFO_URL, tokens.access_token);
      profile = { email: d.email || null, name: d.name || null, givenName: d.given_name || null };
    } catch { /* profile is best-effort */ }
    return { ok: true, profile };
  } catch (err) {
    console.error('[gdash] connect failed:', err.message);
    return { ok: false, error: err.message || 'connect-failed' };
  }
});

ipcMain.handle('gdash:disconnect', async () => {
  try { await gdashClearTokens(); } catch (err) { console.error('[gdash] disconnect failed:', err.message); }
  return { ok: true };
});

ipcMain.handle('gdash:dashboard', async () => {
  const clientId = await gdashReadClientId();
  if (!clientId) return { connected: false, hasClientId: false };
  let accessToken;
  try {
    accessToken = await gdashEnsureAccessToken(clientId);
  } catch (err) {
    console.warn('[gdash] token ensure failed:', err.message);
    return { connected: false, hasClientId: true };
  }
  if (!accessToken) return { connected: false, hasClientId: true };
  try {
    return await gdashBuildDashboard(accessToken);
  } catch (err) {
    console.error('[gdash] dashboard build failed:', err.message);
    return { connected: false, hasClientId: true };
  }
});

ipcMain.handle('open-external', async (event, url) => {
  if (!url || typeof url !== 'string') return false;
  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol)) return false;
  await shell.openExternal(url);
  return true;
});

ipcMain.handle('web-search', async (event, payload = {}) => {
  const { query, options = {} } = payload || {};
  const trimmedQuery = typeof query === 'string' ? query.trim().slice(0, 300) : '';
  if (!trimmedQuery) {
    return { ok: false, error: 'Missing search query', sources: [] };
  }

  const maxResults = Math.min(10, Math.max(1, Number(options.maxResults) || 6));
  if (isHistoryDateQuery(trimmedQuery)) {
    const historyResults = await searchWikimediaOnThisDay(trimmedQuery, maxResults);
    if (historyResults.ok) return historyResults;
  }

  const searchEngine = options.searchEngine || 'ddg';
  const searxngUrl = options.searxngUrl || '';

  if (searchEngine === 'searxng') {
    if (!searxngUrl) {
      return { ok: false, error: 'SearxNG URL is not configured in settings.', sources: [] };
    }
    let baseUrl = searxngUrl.trim();
    if (!/^https?:\/\//i.test(baseUrl)) {
      baseUrl = `http://${baseUrl}`;
    }
    baseUrl = baseUrl.replace(/\/+$/, '');

    const searchUrl = `${baseUrl}/search?q=${encodeURIComponent(trimmedQuery)}&format=json`;
    const response = await requestJson(searchUrl, 8000, {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Perci/1.0 Safari/537.36'
    });

    if (!response.ok) {
      return {
        ok: false,
        error: response.error || `SearxNG search failed with status ${response.status || 'unknown'}`,
        sources: []
      };
    }

    const rawResults = Array.isArray(response.data?.results) ? response.data.results : [];
    const sources = rawResults.slice(0, maxResults).map((item, index) => ({
      id: index + 1,
      title: stripHtml(item.title || ''),
      url: item.url || '',
      content: stripHtml(item.content || item.snippet || ''),
      score: 1,
      publishedDate: item.publishedDate || null
    }));

    return {
      ok: sources.length > 0,
      query: trimmedQuery,
      sources,
      provider: 'searxng',
      error: sources.length > 0 ? null : 'No search results found'
    };
  }

  const searchUrl = new URL('https://html.duckduckgo.com/html/');
  searchUrl.searchParams.set('q', trimmedQuery);

  const response = await requestText(searchUrl.toString(), 8000, {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Perci/1.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml'
  });

  if (!response.ok) {
    return {
      ok: false,
      error: response.error || `Search failed with status ${response.status || 'unknown'}`,
      sources: []
    };
  }

  const sources = parseDuckDuckGoResults(response.body || '', maxResults);
  return {
    ok: sources.length > 0,
    query: trimmedQuery,
    sources,
    provider: 'duckduckgo-html',
    error: sources.length > 0 ? null : 'No search results found'
  };
});

// StudioOS API proxy — runs in the main process so the renderer never has
// to deal with CORS. The API key lives in renderer localStorage and is
// passed in per-call; main never persists it.
ipcMain.handle('studioos:fetch', async (event, { apiBase, apiKey, path, method = 'GET', body = null } = {}) => {
  if (typeof path !== 'string' || !path.startsWith('/')) {
    return { ok: false, error: 'Invalid path' };
  }
  const base = (typeof apiBase === 'string' && apiBase.trim())
    ? apiBase.trim().replace(/\/+$/, '')
    : 'https://studioos.dev';
  const url = `${base}/api${path}`;

  const headers = {};
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  const upperMethod = String(method || 'GET').toUpperCase();
  const result = await requestJsonWithBody(url, { method: upperMethod, body, headers });
  if (!result.ok && result.status === undefined) {
    return { ok: false, error: result.error || 'Network error' };
  }
  return {
    ok: result.ok,
    status: result.status,
    body: result.body,
    error: result.ok ? null : (result.body && result.body.error) || result.error || `HTTP ${result.status || 'error'}`
  };
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

// Extract the first complete top-level JSON object from mixed CLI output.
// `openclaw … --json` prints migration/plugin warnings before the JSON, so we
// scan for the opening brace and brace-match (respecting strings) to the close.
function extractJsonObject(text) {
  if (!text) return null;
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(start, i + 1)); }
        catch { return null; }
      }
    }
  }
  return null;
}

// Run a local CLI command and resolve its stdout/stderr/exit code.
// Args are passed as an array (never a shell string) so caller-supplied values
// like profile URLs/tokens cannot inject. Tokens are never logged.
function runCli(command, args, timeoutMs = 10000) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', err => { clearTimeout(timer); resolve({ ok: false, error: err.message, stdout, stderr }); });
    child.on('close', code => { clearTimeout(timer); resolve({ ok: code === 0, code, stdout, stderr }); });
  });
}

const runOpenClaw = (args, timeoutMs = 10000) => runCli('openclaw', args, timeoutMs);
const runHermes = (args, timeoutMs = 15000) => runCli('hermes', args, timeoutMs);

// Profile-aware rich health via the Gateway RPC (`gateway call status`). Unlike
// test-connection's TCP probe, this returns a structured summary (runtime, task
// counts, agents, channels) for the Mission Control gateway lane. Read-only RPC,
// so it does not require elevated device scopes.
ipcMain.handle('openclaw:gateway-status', async (event, profile = {}) => {
  const startedAt = Date.now();
  const args = ['gateway', 'call', 'status', '--json', '--timeout', '8000'];
  if (profile.gatewayUrl) args.push('--url', profile.gatewayUrl);
  if (profile.token) args.push('--token', profile.token);

  const result = await runOpenClaw(args, 10000);
  const latencyMs = Date.now() - startedAt;
  const data = extractJsonObject(result.stdout);

  if (!data) {
    const errLine = (result.error || result.stderr || result.stdout || '')
      .split('\n').map(l => l.trim()).filter(Boolean).pop() || 'No status returned';
    return { ok: false, error: errLine, latencyMs };
  }

  const tasks = data.tasks || {};
  return {
    ok: true,
    latencyMs,
    health: {
      runtimeVersion: data.runtimeVersion || null,
      agents: (data.heartbeat?.agents || []).map(a => a.agentId).filter(Boolean),
      defaultAgentId: data.heartbeat?.defaultAgentId || null,
      channels: data.channelSummary || [],
      tasks: {
        total: tasks.total ?? null,
        active: tasks.active ?? null,
        failures: tasks.failures ?? null,
        byStatus: tasks.byStatus || null
      }
    }
  };
});

// --- Live gateway event stream (`openclaw logs --follow --json`) ---
// A single long-lived tailer feeds the renderer compact events via
// webContents.send, replacing the need to poll for liveness. The heavy `raw`
// field is stripped and messages are capped so noisy CLI table dumps can't
// flood the IPC channel.
let openClawLogChild = null;
let openClawLogStopped = true;
let openClawLogRestartTimer = null;

function forwardOpenClawEvent(evt) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('openclaw:event', evt);
  }
}

function startOpenClawLogStream(profile = {}) {
  openClawLogStopped = false;
  if (openClawLogChild) return; // already streaming

  const args = ['logs', '--follow', '--json', '--interval', '1000'];
  if (profile.gatewayUrl) args.push('--url', profile.gatewayUrl);
  if (profile.token) args.push('--token', profile.token);

  const child = spawn('openclaw', args, { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  openClawLogChild = child;

  let buffer = '';
  child.stdout.on('data', chunk => {
    buffer += chunk.toString();
    let nl;
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line || line[0] !== '{') continue;
      let parsed;
      try { parsed = JSON.parse(line); } catch { continue; }
      const message = typeof parsed.message === 'string' ? parsed.message.slice(0, 1000) : '';
      if (!message && parsed.type !== 'notice') continue;
      forwardOpenClawEvent({
        type: parsed.type || 'log',
        time: parsed.time || new Date().toISOString(),
        level: parsed.level || 'info',
        subsystem: parsed.subsystem || null,
        message
      });
    }
  });

  child.on('error', err => { forwardOpenClawEvent({ type: 'stream-error', time: new Date().toISOString(), level: 'error', message: err.message }); });
  child.on('close', () => {
    openClawLogChild = null;
    // Auto-reconnect (e.g. after a gateway restart) unless intentionally stopped.
    if (!openClawLogStopped) {
      openClawLogRestartTimer = setTimeout(() => startOpenClawLogStream(profile), 2000);
    }
  });
}

function stopOpenClawLogStream() {
  openClawLogStopped = true;
  if (openClawLogRestartTimer) { clearTimeout(openClawLogRestartTimer); openClawLogRestartTimer = null; }
  if (openClawLogChild) { openClawLogChild.kill('SIGKILL'); openClawLogChild = null; }
}

ipcMain.handle('openclaw:events-start', async (event, profile = {}) => {
  startOpenClawLogStream(profile);
  return { ok: true };
});

ipcMain.handle('openclaw:events-stop', async () => {
  stopOpenClawLogStream();
  return { ok: true };
});

// Await-style agent turn for the Cowork delegation tool: runs `openclaw agent
// --json` to completion and returns the reply. Arg array (no shell) — message
// is caller-supplied. --session-key keeps a resumable conversation.
ipcMain.handle('openclaw:agent-run', async (event, { message, agent = 'main', sessionKey, model, timeoutSec = 600 } = {}) => {
  if (!message || typeof message !== 'string') return { ok: false, error: 'A message is required.' };
  const args = ['agent', '--agent', agent, '--json', '--timeout', String(timeoutSec), '--message', message];
  if (sessionKey) args.push('--session-key', sessionKey);
  if (model) args.push('--model', model);

  const result = await runOpenClaw(args, (timeoutSec + 30) * 1000);
  const data = extractJsonObject(result.stdout);
  // Gateway-routed replies nest under `result`; embedded fallback puts payloads
  // at the top level. Handle both.
  const payload = data?.result || data;
  const text = payload?.payloads?.map(p => p.text).filter(Boolean).join('\n').trim();
  if (text) {
    return {
      ok: true,
      text,
      sessionId: payload?.meta?.agentMeta?.sessionId || null,
      model: payload?.meta?.agentMeta?.model || null
    };
  }
  const err = (result.error || result.stderr || result.stdout || '')
    .split('\n').map(l => l.trim()).filter(Boolean).slice(-3).join(' ') || 'No reply from the OpenClaw gateway agent.';
  return { ok: false, error: err };
});

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

// ─── BARS native Perci surface bridge ────────────────────────────────────────

const BARS_LOCAL_PROVIDERS = [
  {
    id: 'lmstudio',
    name: 'LM Studio',
    kind: 'local',
    endpoint: 'http://127.0.0.1:1234',
    modelsPath: '/v1/models',
    chatPath: '/v1/chat/completions',
    defaultModel: 'local-model',
    api: 'openai'
  },
  {
    id: 'jan',
    name: 'Jan',
    kind: 'local',
    endpoints: ['http://127.0.0.1:6767', 'http://127.0.0.1:1337'],
    modelsPath: '/v1/models',
    chatPath: '/v1/chat/completions',
    defaultModel: 'local-model',
    api: 'openai'
  },
  {
    id: 'ollama',
    name: 'Ollama',
    kind: 'local',
    endpoint: 'http://127.0.0.1:11434',
    modelsPath: '/api/tags',
    chatPath: '/api/chat',
    defaultModel: 'local-model',
    api: 'ollama'
  }
];

const BARS_CLOUD_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI',
    kind: 'cloud',
    keyName: 'openai_key',
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1', 'gpt-4.1-mini', 'o4-mini'],
    chatPath: 'https://api.openai.com/v1/chat/completions',
    api: 'openai'
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    kind: 'cloud',
    keyName: 'anthropic_key',
    defaultModel: 'claude-sonnet-4-5',
    models: ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
    chatPath: 'https://api.anthropic.com/v1/messages',
    api: 'anthropic'
  },
  {
    id: 'google',
    name: 'Google AI',
    kind: 'cloud',
    keyName: 'gemini_key',
    defaultModel: 'gemini-1.5-flash',
    models: ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-2.0-flash'],
    chatPath: 'https://generativelanguage.googleapis.com/v1beta/models',
    api: 'google'
  },
  {
    id: 'groq',
    name: 'Groq',
    kind: 'cloud',
    keyName: 'groq_key',
    defaultModel: 'llama-3.3-70b-versatile',
    models: ['llama-3.3-70b-versatile', 'openai/gpt-oss-120b', 'moonshotai/kimi-k2-instruct'],
    chatPath: 'https://api.groq.com/openai/v1/chat/completions',
    modelsPath: 'https://api.groq.com/openai/v1/models',
    api: 'openai'
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    kind: 'cloud',
    keyName: 'openrouter_key',
    defaultModel: 'openrouter/auto',
    models: ['openrouter/auto'],
    modelsPath: 'https://openrouter.ai/api/v1/models',
    chatPath: 'https://openrouter.ai/api/v1/chat/completions',
    api: 'openai',
    extraHeaders: { 'HTTP-Referer': 'https://perci.local', 'X-Title': 'Perci Bars' }
  }
];

async function fetchJsonStrict(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 90000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let payload = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = text;
    }
    if (!response.ok) {
      const message = payload?.error?.message || payload?.message || (typeof payload === 'string' ? payload : '');
      throw new Error(['HTTP ' + response.status, message].filter(Boolean).join(': '));
    }
    return payload;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeBarsModels(provider, payload) {
  if (provider.api === 'ollama') {
    return Array.isArray(payload?.models) ? payload.models.map(model => model.name).filter(Boolean) : [];
  }
  return Array.isArray(payload?.data) ? payload.data.map(model => model.id).filter(Boolean) : [];
}

async function detectBarsLocalProvider(provider) {
  const endpoints = provider.endpoints || [provider.endpoint];
  for (const endpoint of endpoints) {
    const result = await requestJson(endpoint + provider.modelsPath, 2500);
    if (!result.ok) continue;
    const models = normalizeBarsModels(provider, result.data);
    return {
      ...provider,
      endpoint,
      endpoints: undefined,
      available: models.length > 0,
      models,
      modelCount: models.length,
      error: models.length > 0 ? '' : 'No models detected'
    };
  }
  return {
    ...provider,
    endpoint: endpoints[0],
    endpoints: undefined,
    available: false,
    models: [],
    modelCount: 0,
    error: 'Local API server is not reachable'
  };
}

async function getBarsApiKeys() {
  const data = await readAppData();
  return Object.fromEntries(BARS_CLOUD_PROVIDERS.map(provider => [
    provider.id,
    typeof data[provider.keyName] === 'string' ? data[provider.keyName] : ''
  ]));
}

async function getBarsApiKeyStatus() {
  const keys = await getBarsApiKeys();
  return {
    encrypted: safeStorage.isEncryptionAvailable(),
    providers: BARS_CLOUD_PROVIDERS.map(provider => ({
      id: provider.id,
      name: provider.name,
      configured: Boolean(keys[provider.id])
    }))
  };
}

async function saveBarsApiKeys(incoming = {}) {
  const patch = {};
  for (const provider of BARS_CLOUD_PROVIDERS) {
    const value = typeof incoming[provider.id] === 'string' ? incoming[provider.id].trim() : '';
    if (value) patch[provider.keyName] = value;
  }
  if (Object.keys(patch).length > 0) {
    const current = await readAppData();
    await writeAppData({ ...current, ...patch });
  }
  return getBarsApiKeyStatus();
}

async function clearBarsApiKeys() {
  const current = await readAppData();
  const patch = {};
  for (const provider of BARS_CLOUD_PROVIDERS) patch[provider.keyName] = '';
  await writeAppData({ ...current, ...patch });
  return getBarsApiKeyStatus();
}

async function fetchBarsCloudModels(provider, key) {
  if (provider.id === 'openrouter') {
    const result = await requestJson(provider.modelsPath, 12000, { Accept: 'application/json' });
    if (result.ok) {
      const ids = Array.isArray(result.data?.data) ? result.data.data.map(model => model.id).filter(Boolean) : [];
      return Array.from(new Set([provider.defaultModel, ...ids].filter(Boolean)));
    }
    return provider.models;
  }
  if (provider.id === 'groq' && key) {
    const result = await requestJson(provider.modelsPath, 8000, { Authorization: 'Bearer ' + key });
    if (result.ok) {
      const ids = Array.isArray(result.data?.data) ? result.data.data.map(model => model.id).filter(Boolean) : [];
      if (ids.length) return ids;
    }
  }
  return provider.models;
}

async function detectBarsProviders() {
  const keys = await getBarsApiKeys();
  const [localProviders, cloudProviders] = await Promise.all([
    Promise.all(BARS_LOCAL_PROVIDERS.map(detectBarsLocalProvider)),
    Promise.all(BARS_CLOUD_PROVIDERS.map(async provider => ({
      ...provider,
      available: Boolean(keys[provider.id]),
      configured: Boolean(keys[provider.id]),
      models: await fetchBarsCloudModels(provider, keys[provider.id])
    })))
  ]);
  const providers = [...localProviders, ...cloudProviders];
  return {
    generatedAt: Date.now(),
    providers,
    selectedId: providers.find(provider => provider.available)?.id || providers[0]?.id || null,
    keyStatus: await getBarsApiKeyStatus()
  };
}

function compactBarsIdeas(ideas) {
  return (Array.isArray(ideas) ? ideas : []).slice(0, 100).map((idea, index) => {
    const tags = Array.isArray(idea.tags) && idea.tags.length ? ' tags: ' + idea.tags.join(', ') : '';
    const next = idea.next ? ' next: ' + idea.next : '';
    return [
      (index + 1) + '. ' + (idea.title || 'Untitled'),
      'status: ' + (idea.status || 'New') + '; category: ' + (idea.category || idea.kind || 'Uncategorized') + '; impact: ' + (idea.impact || '3') + '; effort: ' + (idea.effort || '3') + ';' + tags + next,
      idea.notes ? 'notes: ' + idea.notes : ''
    ].filter(Boolean).join('\n');
  }).join('\n\n');
}

function buildBarsMessages(question, ideas) {
  const context = compactBarsIdeas(ideas);
  return [
    {
      role: 'system',
      content: 'You are a concise assistant for BARS, a personal idea notebook inside Perci. Answer only from the supplied bars unless the user asks for general planning advice. If the notes do not contain enough evidence, say what is missing. Keep next steps concrete.'
    },
    {
      role: 'user',
      content: 'Question:\n' + question + '\n\nBars:\n' + (context || 'No bars saved yet.')
    }
  ];
}

function getBarsProvider(providerId) {
  return [...BARS_LOCAL_PROVIDERS, ...BARS_CLOUD_PROVIDERS].find(provider => provider.id === providerId);
}

async function askBarsOpenAiCompatible(provider, key, model, messages, endpointOverride = '') {
  const chatUrl = provider.kind === 'local'
    ? (endpointOverride || provider.endpoint).replace(/\/$/, '') + provider.chatPath
    : provider.chatPath;
  const payload = await fetchJsonStrict(chatUrl, {
    method: 'POST',
    timeoutMs: 90000,
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { Authorization: 'Bearer ' + key } : {}),
      ...(provider.extraHeaders || {})
    },
    body: JSON.stringify({ model, messages, temperature: 0.2, stream: false })
  });
  return payload?.choices?.[0]?.message?.content?.trim() || 'No response text returned.';
}

async function askBarsAnthropic(provider, key, model, messages) {
  const payload = await fetchJsonStrict(provider.chatPath, {
    method: 'POST',
    timeoutMs: 90000,
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 1200,
      system: messages[0].content,
      messages: [{ role: 'user', content: messages[1].content }]
    })
  });
  return Array.isArray(payload?.content)
    ? payload.content.map(part => part?.text || '').join('').trim() || 'No response text returned.'
    : 'No response text returned.';
}

async function askBarsGoogle(provider, key, model, messages) {
  const payload = await fetchJsonStrict(provider.chatPath + '/' + encodeURIComponent(model) + ':generateContent', {
    method: 'POST',
    timeoutMs: 90000,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: messages[0].content }] },
      contents: [{ role: 'user', parts: [{ text: messages[1].content }] }],
      generationConfig: { maxOutputTokens: 1200 }
    })
  });
  const parts = payload?.candidates?.[0]?.content?.parts;
  return Array.isArray(parts)
    ? parts.map(part => part?.text || '').join('').trim() || 'No response text returned.'
    : 'No response text returned.';
}

async function askBarsOllama(provider, model, messages) {
  const payload = await fetchJsonStrict(provider.endpoint + provider.chatPath, {
    method: 'POST',
    timeoutMs: 90000,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false })
  });
  return payload?.message?.content?.trim() || 'No response text returned.';
}

async function askBars(payload = {}) {
  const provider = getBarsProvider(payload.providerId);
  if (!provider) throw new Error('Unknown Bars AI provider.');
  const messages = buildBarsMessages(payload.question || '', payload.ideas || []);
  const model = String(payload.model || provider.defaultModel || 'local-model').trim();
  if (!model) throw new Error('Choose a model first.');

  if (provider.kind === 'local') {
    if (provider.api === 'ollama') {
      return { providerId: provider.id, model, answer: await askBarsOllama(provider, model, messages) };
    }
    const detected = await detectBarsLocalProvider(provider);
    if (!detected.available) throw new Error(provider.name + ' is not reachable.');
    return { providerId: provider.id, model, answer: await askBarsOpenAiCompatible(detected, '', model, messages, detected.endpoint) };
  }

  const keys = await getBarsApiKeys();
  const key = keys[provider.id];
  if (!key) throw new Error('Add a ' + provider.name + ' API key in Bars settings first.');

  const answer = provider.api === 'anthropic'
    ? await askBarsAnthropic(provider, key, model, messages)
    : provider.api === 'google'
      ? await askBarsGoogle(provider, key, model, messages)
      : await askBarsOpenAiCompatible(provider, key, model, messages);

  return { providerId: provider.id, model, answer };
}


ipcMain.handle('models:discover-providers', async () => {
  try {
    return await discoverModelProviders();
  } catch (err) {
    return { generatedAt: Date.now(), providers: [], error: err.message };
  }
});

ipcMain.handle('bars:detect-providers', async () => detectBarsProviders());
ipcMain.handle('bars:ask', async (event, payload) => askBars(payload));
ipcMain.handle('bars:get-api-key-status', async () => getBarsApiKeyStatus());
ipcMain.handle('bars:save-api-keys', async (event, payload) => saveBarsApiKeys(payload));
ipcMain.handle('bars:clear-api-keys', async () => clearBarsApiKeys());

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

// ─── Hermes Agent bridge ────────────────────────────────────────────────────
// Perci's Hermes window talks to the local `hermes` CLI the way the OpenClaw
// window talks to `openclaw`: arg arrays (never shell strings), parsed output.

const HERMES_DASHBOARD_URL = 'http://127.0.0.1:9119';

// Parse `hermes status` (human-formatted ◆ sections) into a compact summary.
// Redacted API-key fragments are deliberately dropped — only provider counts
// and booleans cross the IPC boundary.
function parseHermesStatus(text) {
  const summary = {
    model: null, provider: null, gatewayRunning: false,
    keysConfigured: 0, keysTotal: 0, platformsConfigured: 0,
    scheduledJobs: null, activeSessions: null
  };
  let section = '';
  for (const raw of (text || '').split('\n')) {
    const sectionMatch = raw.match(/^◆\s+(.+)$/);
    if (sectionMatch) { section = sectionMatch[1].trim(); continue; }
    const line = raw.trim();
    if (!line) continue;
    if (section === 'Environment') {
      const m = line.match(/^(Model|Provider):\s+(.+)$/);
      if (m) summary[m[1].toLowerCase()] = m[2].trim();
    } else if (section === 'API Keys') {
      if (/[✓✗]/.test(line) && !line.startsWith('Auth file') && !line.startsWith('Error')) {
        summary.keysTotal += 1;
        if (line.includes('✓')) summary.keysConfigured += 1;
      }
    } else if (section === 'Messaging Platforms') {
      if (line.includes('✓')) summary.platformsConfigured += 1;
    } else if (section === 'Gateway Service') {
      const m = line.match(/^Status:\s+(.+)$/);
      if (m) summary.gatewayRunning = m[1].includes('✓');
    } else if (section === 'Scheduled Jobs') {
      const m = line.match(/^Jobs:\s+(.+)$/);
      if (m) summary.scheduledJobs = m[1].trim();
    } else if (section === 'Sessions') {
      const m = line.match(/^Active:\s+(\d+)/);
      if (m) summary.activeSessions = Number(m[1]);
    }
  }
  return summary;
}

ipcMain.handle('hermes:status', async () => {
  const version = await runHermes(['--version'], 10000);
  if (!version.ok) {
    return { ok: false, error: version.error || version.stderr.trim() || 'Hermes CLI was not found. Install it or add hermes to PATH.' };
  }
  const versionLine = version.stdout.split('\n').map(l => l.trim()).find(Boolean) || 'Hermes Agent';
  const status = await runHermes(['status'], 30000);
  return {
    ok: true,
    version: versionLine,
    ...(status.ok ? parseHermesStatus(status.stdout) : {}),
    statusError: status.ok ? null : (status.error || status.stderr.trim() || null)
  };
});

// One run at a time: `hermes -z` one-shots print only the final response, so
// the renderer pairs this with the live log stream for in-flight visibility.
let hermesActiveRun = null; // { id, child }

function sendHermesRunEvent(evt) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hermes:run-event', evt);
  }
}

ipcMain.handle('hermes:run', async (event, { prompt, model, workingDirectory } = {}) => {
  const text = typeof prompt === 'string' ? prompt.trim() : '';
  if (!text) return { ok: false, error: 'Missing prompt.' };
  if (hermesActiveRun) return { ok: false, error: 'Hermes is already working on a task. Cancel it or wait for it to finish.' };
  const requestedModel = typeof model === 'string' ? model.trim() : '';
  if (requestedModel && !SAFE_MODEL_PATTERN.test(requestedModel)) {
    return { ok: false, error: 'Model name contains unsupported characters.' };
  }

  const args = ['-z', text];
  if (requestedModel) args.push('-m', requestedModel);
  const cwd = typeof workingDirectory === 'string' && workingDirectory.trim() ? workingDirectory.trim() : (process.env.HOME || '/tmp');
  const id = `hermes-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const child = spawn('hermes', args, { cwd, env: process.env, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  hermesActiveRun = { id, child };
  let stdout = '';
  let stderr = '';
  let cancelled = false;
  child.stdout.on('data', chunk => { stdout += chunk.toString(); });
  child.stderr.on('data', chunk => { stderr += chunk.toString(); });
  child.on('error', err => {
    hermesActiveRun = null;
    sendHermesRunEvent({ id, type: 'failed', error: err.message, finishedAt: new Date().toISOString() });
  });
  child.on('close', (code, signal) => {
    if (!hermesActiveRun) return; // spawn error already reported
    cancelled = cancelled || hermesActiveRun.cancelled === true;
    hermesActiveRun = null;
    const output = stdout.trim();
    const finishedAt = new Date().toISOString();
    if (cancelled || signal) {
      sendHermesRunEvent({ id, type: 'cancelled', finishedAt });
    } else if (code !== 0 && !output) {
      const error = stderr.trim().split('\n').filter(Boolean).slice(-3).join('\n') || `hermes exited with code ${code}.`;
      sendHermesRunEvent({ id, type: 'failed', error, finishedAt });
    } else {
      sendHermesRunEvent({ id, type: 'done', output, finishedAt, exitCode: code });
    }
  });
  return { ok: true, id, startedAt: new Date().toISOString() };
});

ipcMain.handle('hermes:run-cancel', async () => {
  if (!hermesActiveRun) return { ok: false, error: 'No active Hermes run.' };
  try {
    hermesActiveRun.cancelled = true;
    hermesActiveRun.child.kill('SIGTERM');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

// --- Interactive chat (`hermes chat -q`) ---
// Turn-based chat with context carryover. Each turn runs
// `hermes chat -q <message> --resume <session-id>` so Hermes keeps full
// conversation memory. The long-lived state is the session UUID, not a process.
let hermesChatSession = null; // { sessionId, model }

ipcMain.handle('hermes:chat-start', async (event, { model, workingDirectory } = {}) => {
  // If a session already exists, return it so the UI can resume seamlessly.
  if (hermesChatSession) return { ok: true, sessionId: hermesChatSession.sessionId, resumed: true };
  const requestedModel = typeof model === 'string' ? model.trim() : '';
  if (requestedModel && !SAFE_MODEL_PATTERN.test(requestedModel)) {
    return { ok: false, error: 'Model name contains unsupported characters.' };
  }
  // Session ID comes from hermes itself — captured on first turn. No synthetic
  // IDs. We store the model/cwd now and defer session creation until the first
  // message is sent.
  const sid = `pending-${Date.now()}`;
  hermesChatSession = { sessionId: sid, realSessionId: null, model: requestedModel, cwd: workingDirectory, hasHistory: false };
  return { ok: true, sessionId: sid };
});

// Send a message in the active chat session. Runs `hermes chat -q` with
// --resume after the first turn so context carries forward.
ipcMain.handle('hermes:chat-send', async (event, { text } = {}) => {
  if (!hermesChatSession) return { ok: false, error: 'No chat session is running. Start one first.' };
  const msg = typeof text === 'string' ? text.trim() : '';
  if (!msg) return { ok: false, error: 'Message is empty.' };
  const { model, cwd, realSessionId } = hermesChatSession;
  const args = ['chat', '-q', msg, '--source', 'panel', '-Q'];
  if (model) args.push('-m', model);
  if (realSessionId) args.push('--resume', realSessionId);
  if (cwd) args.push('--workdir', cwd);
  hermesChatSession.hasHistory = true;
  try {
    const result = await runHermes(args, 300000); // 5-min timeout for long turns
    if (!result.ok) return { ok: false, error: result.error || result.stderr.trim() || 'Hermes chat turn failed.' };
    let output = result.stdout.trim();
    // First turn: capture the real session ID from the output footer
    if (!realSessionId) {
      const m = output.match(/hermes --resume (\S+)/);
      if (m) {
        hermesChatSession.realSessionId = m[1];
        hermesChatSession.sessionId = m[1];
      }
      // Strip the footer line(s) so it doesn't clutter the chat
      output = output.replace(/\n?Resume this session with:\s*\n?\s*hermes --resume \S+\s*/, '').trim();
    }
    return { ok: true, output, sessionId: hermesChatSession.sessionId };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('hermes:chat-stop', async () => {
  hermesChatSession = null;
  return { ok: true };
});
// Same shape as the OpenClaw log tailer: one long-lived child, parsed lines
// forwarded as compact events, auto-restart unless explicitly stopped.
let hermesLogChild = null;
let hermesLogStopped = true;
let hermesLogRestartTimer = null;

function forwardHermesLogEvent(evt) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('hermes:log-event', evt);
  }
}

// agent.log lines look like:
// `2026-06-11 22:04:41,963 INFO [session_id] component.path: message`
const HERMES_LOG_LINE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d+\s+(\w+)\s+(?:\[([^\]]+)\]\s+)?([\w.-]+):\s?(.*)$/;

function startHermesLogStream() {
  if (hermesLogChild) return;
  hermesLogStopped = false;
  const child = spawn('hermes', ['logs', '-f', '-n', '20'], { stdio: ['ignore', 'pipe', 'pipe'], env: process.env });
  hermesLogChild = child;
  let buffer = '';
  child.stdout.on('data', chunk => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      const m = line.match(HERMES_LOG_LINE);
      if (!m) continue; // file headers and wrapped continuation lines
      forwardHermesLogEvent({
        type: 'log',
        time: m[1],
        level: m[2],
        session: m[3] || null,
        component: m[4],
        message: m[5].slice(0, 400)
      });
    }
  });
  child.on('error', err => {
    forwardHermesLogEvent({ type: 'stream-error', level: 'ERROR', message: err.message });
  });
  child.on('close', () => {
    hermesLogChild = null;
    if (!hermesLogStopped) {
      clearTimeout(hermesLogRestartTimer);
      hermesLogRestartTimer = setTimeout(() => startHermesLogStream(), 2000);
    }
  });
}

function stopHermesLogStream() {
  hermesLogStopped = true;
  clearTimeout(hermesLogRestartTimer);
  if (hermesLogChild) {
    hermesLogChild.kill();
    hermesLogChild = null;
  }
}

ipcMain.handle('hermes:logs-start', async () => { startHermesLogStream(); return { ok: true }; });
ipcMain.handle('hermes:logs-stop', async () => { stopHermesLogStream(); return { ok: true }; });

// `hermes sessions list` prints a fixed-width table; slice rows on the header's
// column offsets so truncated titles/previews can't break parsing.
function parseHermesSessionsTable(text) {
  const lines = (text || '').split('\n');
  const headerIdx = lines.findIndex(l => /^Title\s+/.test(l) && l.includes('ID'));
  if (headerIdx === -1) return [];
  const header = lines[headerIdx];
  const offsets = ['Title', 'Preview', 'Last Active', 'ID'].map(name => header.indexOf(name));
  if (offsets.some(o => o === -1)) return [];
  const rows = [];
  for (const line of lines.slice(headerIdx + 1)) {
    if (!line.trim() || /^─+$/.test(line.trim())) continue;
    const cell = i => line.slice(offsets[i], offsets[i + 1] ?? undefined).trim();
    const id = cell(3);
    if (!id) continue;
    rows.push({ title: cell(0), preview: cell(1), lastActive: cell(2), id });
  }
  return rows;
}

ipcMain.handle('hermes:sessions', async (event, { limit } = {}) => {
  const cappedLimit = Math.max(1, Math.min(Number(limit) || 20, 100));
  const [list, stats] = await Promise.all([
    runHermes(['sessions', 'list', '--limit', String(cappedLimit)], 20000),
    runHermes(['sessions', 'stats'], 20000)
  ]);
  if (!list.ok) {
    return { ok: false, error: list.error || list.stderr.trim() || 'Could not list Hermes sessions.' };
  }
  const statsText = stats.ok ? stats.stdout : '';
  const statField = (label) => statsText.match(new RegExp(`${label}:\\s+(.+)`))?.[1]?.trim() || null;
  return {
    ok: true,
    sessions: parseHermesSessionsTable(list.stdout),
    stats: {
      totalSessions: statField('Total sessions'),
      totalMessages: statField('Total messages'),
      databaseSize: statField('Database size')
    }
  };
});

ipcMain.handle('hermes:insights', async (event, { days } = {}) => {
  const cappedDays = Math.max(1, Math.min(Number(days) || 30, 365));
  const result = await runHermes(['insights', '--days', String(cappedDays)], 60000);
  if (!result.ok) {
    return { ok: false, error: result.error || result.stderr.trim() || 'Could not load Hermes insights.' };
  }
  return { ok: true, days: cappedDays, text: result.stdout.replace(/^\n+/, '') };
});

// The dashboard serves HTML, so requestJson reports a JSON parse failure even
// when it's up — any HTTP status at all means something is listening.
ipcMain.handle('hermes:dashboard-status', async () => {
  const probe = await requestJson(HERMES_DASHBOARD_URL, 2500);
  return { ok: true, running: Boolean(probe.status), url: HERMES_DASHBOARD_URL };
});

ipcMain.handle('hermes:dashboard-start', async () => {
  const probe = await requestJson(HERMES_DASHBOARD_URL, 2500);
  if (probe.status) return { ok: true, running: true, url: HERMES_DASHBOARD_URL };

  const child = spawn('hermes', ['dashboard', '--no-open'], { stdio: 'ignore', env: process.env, detached: true });
  child.on('error', () => {});
  child.unref();

  // First launch may build the web UI, so poll generously (up to 90 s).
  const startedAt = Date.now();
  while (Date.now() - startedAt < 90000) {
    await new Promise(r => setTimeout(r, 1500));
    const poll = await requestJson(HERMES_DASHBOARD_URL, 2000);
    if (poll.status) return { ok: true, running: true, url: HERMES_DASHBOARD_URL };
  }
  return { ok: false, running: false, url: HERMES_DASHBOARD_URL, error: 'The Hermes dashboard did not become reachable. Try running `hermes dashboard` in a terminal.' };
});

// ─── Agent Jobs ─────────────────────────────────────────────────────────────
// In-memory job store: jobId → { childProcess, jobRecord }
const agentJobs = new Map();

function generateJobId() {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getAgentCommand(agentId) {
  // Map agent ids to their CLI command names.
  // These must be on PATH. Users can configure custom paths later.
  const commandMap = {
    aider: 'aider',
    antigravity_cli: 'antigravity',
    claude_code: 'claude',
    codex: 'codex',
    copilot: 'copilot',
    command_code: 'cmd',
    cursor_cli: 'cursor',
    jan: 'jan',
    openhands: 'openhands',
    opencode: 'opencode',
    perci_code: 'perci',
    qwen_code: 'qwen',
    // hermes and openclaw have dedicated branches in agent-jobs:queue
  };
  return commandMap[agentId] || null;
}

// Per-agent flag used to select a model, verified against each CLI's --help.
// Agents missing here have no --model flag (Jan picks its model via
// `jan launch`; perci is a custom CLI), so the UI hides the model field for them.
function getAgentModelFlag(agentId) {
  const flagMap = {
    aider: '--model',
    antigravity_cli: '--model',
    claude_code: '--model',
    codex: '--model',
    command_code: '--model',
    copilot: '--model',
    cursor_cli: '--model',
    openhands: '--model',
    opencode: '--model',
    qwen_code: '--model',
  };
  return flagMap[agentId] || null;
}

// Model names are user-supplied and get appended to the spawn args, so bound
// them to a safe charset (covers aliases like `opus`, full names like
// `claude-opus-4-8`, and provider/model forms like `openai/o4-mini`). Anything
// outside this set is rejected before spawn to avoid shell injection.
const SAFE_MODEL_PATTERN = /^[A-Za-z0-9._:/-]+$/;

function serializeJob(jobRecord) {
  const { childProcess: _cp, ...safe } = jobRecord;
  return safe;
}

ipcMain.handle('agent-jobs:list', async (event, options = {}) => {
  const limit = Number(options.limit) || 24;
  const source = options.source || null;

  const allJobs = [];
  for (const [, jobRecord] of agentJobs) {
    if (source && jobRecord.job.source !== source) continue;
    allJobs.push(serializeJob(jobRecord.job));
  }

  // Sort by created_at descending, then slice
  allJobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return allJobs.slice(0, limit);
});

ipcMain.handle('agent-jobs:queue', async (event, { agent, prompt, working_directory, model } = {}) => {
  if (!agent || !prompt) {
    return { ok: false, error: 'Missing agent or prompt.' };
  }
  const requestedModel = typeof model === 'string' ? model.trim() : '';
  if (requestedModel && !SAFE_MODEL_PATTERN.test(requestedModel)) {
    return { ok: false, error: 'Model name contains unsupported characters.' };
  }

  // Hermes runs headless one-shots (`hermes -z`): stdout is the final reply.
  if (agent === 'hermes') {
    const jobId = generateJobId();
    const startedAt = new Date().toISOString();
    const jobRecord = {
      id: jobId, agent, type: agent, status: 'running', prompt,
      working_directory: working_directory || null, model: requestedModel || null, source: 'agents_page',
      created_at: startedAt, started_at: startedAt, completed_at: null,
      exit_code: null, output: '', output_kind: null, childProcess: null,
    };
    const args = ['-z', prompt];
    if (requestedModel) args.push('-m', requestedModel);
    const child = spawn('hermes', args, {
      cwd: working_directory || process.env.HOME || '/tmp',
      env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'], shell: false
    });
    jobRecord.childProcess = child;

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk.toString(); });
    child.stderr.on('data', chunk => { stderr += chunk.toString(); });
    child.on('error', err => {
      jobRecord.completed_at = new Date().toISOString();
      jobRecord.status = 'failed';
      jobRecord.output_kind = 'error';
      jobRecord.output = `Process error: ${err.message}`;
    });
    child.on('close', code => {
      jobRecord.completed_at = new Date().toISOString();
      const text = stdout.trim();
      if (code === 0 && text) {
        jobRecord.output = text;
        jobRecord.output_kind = 'output';
        jobRecord.status = 'completed';
        jobRecord.exit_code = 0;
      } else {
        jobRecord.status = 'failed';
        jobRecord.exit_code = code;
        jobRecord.output_kind = 'error';
        jobRecord.output = stderr.trim().split('\n').filter(Boolean).slice(-4).join('\n') || text || 'No reply from Hermes.';
      }
    });

    agentJobs.set(jobId, { childProcess: child, job: jobRecord });
    return { ok: true, job: serializeJob(jobRecord) };
  }
  // OpenClaw runs a gateway agent turn (session bridging) rather than a local
  // CLI. Spawn `openclaw agent --json` (arg array, no shell — prompt is user
  // input) and surface the agent's reply through the same job record machinery.
  if (agent === 'openclaw') {
    const jobId = generateJobId();
    const startedAt = new Date().toISOString();
    const jobRecord = {
      id: jobId, agent, type: agent, status: 'running', prompt,
      working_directory: null, model: requestedModel || null, source: 'agents_page',
      created_at: startedAt, started_at: startedAt, completed_at: null,
      exit_code: null, output: '', output_kind: null, session_id: null, childProcess: null,
    };
    const args = ['agent', '--agent', 'main', '--json', '--timeout', '600', '--message', prompt];
    if (requestedModel) args.push('--model', requestedModel);
    const child = spawn('openclaw', args, { env: { ...process.env }, stdio: ['ignore', 'pipe', 'pipe'], shell: false });
    jobRecord.childProcess = child;

    let raw = '';
    child.stdout.on('data', chunk => { raw += chunk.toString(); });
    child.on('error', err => {
      jobRecord.completed_at = new Date().toISOString();
      jobRecord.status = 'failed';
      jobRecord.output_kind = 'error';
      jobRecord.output = `Process error: ${err.message}`;
    });
    child.on('close', code => {
      jobRecord.completed_at = new Date().toISOString();
      const data = extractJsonObject(raw);
      // Gateway-routed replies nest under `result`; embedded fallback is top-level.
      const payload = data?.result || data;
      const text = payload?.payloads?.map(p => p.text).filter(Boolean).join('\n').trim();
      if (text) {
        jobRecord.output = text;
        jobRecord.output_kind = 'output';
        jobRecord.status = 'completed';
        jobRecord.exit_code = 0;
        jobRecord.session_id = payload?.meta?.agentMeta?.sessionId || null;
      } else {
        jobRecord.status = 'failed';
        jobRecord.exit_code = code;
        jobRecord.output_kind = 'error';
        jobRecord.output = raw.split('\n').map(l => l.trim()).filter(Boolean).slice(-4).join('\n') || 'No reply from the OpenClaw gateway agent.';
      }
    });

    agentJobs.set(jobId, { childProcess: child, job: jobRecord });
    return { ok: true, job: serializeJob(jobRecord) };
  }

  const command = getAgentCommand(agent);
  if (!command) {
    return { ok: false, error: `Unknown agent: ${agent}. No CLI command is configured.` };
  }

  const jobId = generateJobId();
  const now = new Date().toISOString();

  const jobRecord = {
    id: jobId,
    agent,
    type: agent, // alias for compatibility
    status: 'pending',
    prompt,
    working_directory: working_directory || null,
    model: requestedModel || null,
    source: 'agents_page',
    created_at: now,
    started_at: null,
    completed_at: null,
    exit_code: null,
    output: '',
    output_kind: null,
    childProcess: null,
  };

  // Spawn the agent CLI
  const cwd = working_directory || process.env.HOME || '/tmp';
  const modelFlag = getAgentModelFlag(agent);
  const spawnArgs = requestedModel && modelFlag ? [modelFlag, requestedModel] : [];

  // Agents that accept a -p/--prompt flag for non-interactive use.
  // These CLIs run headlessly: prompt is passed as a flag, output goes to
  // stdout, and the process exits when done.  All other agents are treated as
  // interactive terminal CLIs that read their prompt from stdin.
  const PROMPT_FLAG_AGENTS = new Set(['copilot', 'command_code']);
  const usesPromptFlag = PROMPT_FLAG_AGENTS.has(agent);

  if (usesPromptFlag) {
    spawnArgs.push('-p', prompt);
    // Copilot needs these to run without interactive TTY prompts.
    if (agent === 'copilot') {
      spawnArgs.push('--allow-all-tools', '--no-ask-user');
    }
    // Command Code needs to skip onboarding for automated runs.
    if (agent === 'command_code') {
      spawnArgs.push('--skip-onboarding');
    }
  }

  const spawnEnv = { ...process.env };
  // Inject COMMAND_CODE_API_KEY if available (from shell env or Perci config)
  if (agent === 'command_code' && !spawnEnv.COMMAND_CODE_API_KEY) {
    // Try reading from ~/.commandcode/api-key if the env var isn't set
    try {
      const keyFile = path.join(app.getPath('home'), '.commandcode', 'api-key');
      if (fsSync.existsSync(keyFile)) {
        const key = fsSync.readFileSync(keyFile, 'utf8').trim();
        if (key) spawnEnv.COMMAND_CODE_API_KEY = key;
      }
    } catch (_) {}
  }

  const child = spawn(command, spawnArgs, {
    cwd,
    env: spawnEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: true,
    detached: false,
  });

  jobRecord.childProcess = child;
  jobRecord.status = 'running';
  jobRecord.started_at = new Date().toISOString();

  // For interactive agents that read from stdin, send the prompt and close
  // stdin so the process knows there is no more input.
  if (!usesPromptFlag && prompt) {
    try {
      child.stdin.write(prompt + '\n');
      child.stdin.end();
    } catch (_) { /* stdin may already be closed */ }
  }

  // Capture stdout
  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    jobRecord.output += text;
    jobRecord.output_kind = 'output';
  });

  // Capture stderr
  child.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    if (!jobRecord.output_kind) jobRecord.output_kind = 'error';
    jobRecord.output += (jobRecord.output ? '\n' : '') + text;
  });

  // Process exited
  child.on('close', (code) => {
    jobRecord.completed_at = new Date().toISOString();
    jobRecord.exit_code = code;
    if (code === 0) {
      jobRecord.status = 'completed';
    } else {
      jobRecord.status = 'failed';
      if (!jobRecord.output_kind) jobRecord.output_kind = 'error';
    }
    // Keep in map for history — renderer reads from it via list
  });

  // Process error (e.g., command not found)
  child.on('error', (err) => {
    jobRecord.completed_at = new Date().toISOString();
    jobRecord.status = 'failed';
    jobRecord.exit_code = null;
    jobRecord.output_kind = 'error';
    jobRecord.output += (jobRecord.output ? '\n' : '') + `Process error: ${err.message}`;
  });

  agentJobs.set(jobId, { childProcess: child, job: jobRecord });

  return { ok: true, job: serializeJob(jobRecord) };
});

ipcMain.handle('agent-jobs:cancel', async (event, jobId) => {
  const entry = agentJobs.get(jobId);
  if (!entry) {
    return { ok: false, error: 'Job not found.' };
  }

  const { childProcess: child, job: jobRecord } = entry;

  if (jobRecord.status === 'completed' || jobRecord.status === 'failed' || jobRecord.status === 'cancelled') {
    return { ok: true, status: jobRecord.status, message: 'Job already finished.' };
  }

  // Kill the process
  try {
    if (process.platform === 'win32') {
      child.kill('SIGTERM');
    } else {
      // Negative PID kills the process group (since detached:false, this is the child)
      child.kill('SIGTERM');
    }
  } catch (err) {
    return { ok: false, error: `Failed to kill process: ${err.message}` };
  }

  jobRecord.status = 'cancelled';
  jobRecord.completed_at = new Date().toISOString();
  jobRecord.output_kind = 'status';
  if (!jobRecord.output.endsWith('\n')) jobRecord.output += '\n';
  jobRecord.output += '[Cancelled by user]';

  return { ok: true, status: 'cancelled' };
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

ipcMain.handle('register-workspace', (event, workspacePath) => {
  if (workspacePath && typeof workspacePath === 'string') {
    allowedPaths.add(path.resolve(workspacePath));
  }
  return true;
});

ipcMain.handle('list-files', async (event, dirPath) => {
  if (!isPathAllowed(dirPath)) {
    throw new Error('Access Denied: Path is outside the allowed workspace directories.');
  }
  try {
    const files = await getFiles(dirPath);
    return files;
  } catch (err) {
    console.error('Error listing files:', err);
    return [];
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  if (!isPathAllowed(filePath)) {
    throw new Error('Access Denied: Path is outside the allowed workspace directories.');
  }
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return content;
  } catch (err) {
    console.error('Error reading file:', err);
    throw err;
  }
});

ipcMain.handle('write-file', async (event, { filePath, content }) => {
  if (!isPathAllowed(filePath)) {
    throw new Error('Access Denied: Path is outside the allowed workspace directories.');
  }
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content, 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing file:', err);
    throw err;
  }
});

ipcMain.handle('delete-file', async (event, filePath) => {
  if (!isPathAllowed(filePath)) {
    throw new Error('Access Denied: Path is outside the allowed workspace directories.');
  }
  try {
    await fs.unlink(filePath);
    return true;
  } catch (err) {
    console.error('Error deleting file:', err);
    throw err;
  }
});

ipcMain.handle('rename-file', async (event, { oldPath, newPath }) => {
  if (!isPathAllowed(oldPath) || !isPathAllowed(newPath)) {
    throw new Error('Access Denied: Path is outside the allowed workspace directories.');
  }
  try {
    await fs.rename(oldPath, newPath);
    return true;
  } catch (err) {
    console.error('Error renaming file:', err);
    throw err;
  }
});

// ── Lighthouse IPC handlers ──────────────────────────────────────────────

function execCmd(cmd, timeout = 10000) {
  try {
    return spawnSync('/bin/sh', ['-c', cmd], {
      timeout,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).stdout || '';
  } catch {
    return '';
  }
}

// Parse one IPv4/IPv6 host:port token from lsof's `n` field.
function parseHostPort(n) {
  let host, portStr;
  if (n[0] === '[') { const i = n.indexOf(']'); host = n.slice(1, i); portStr = n.slice(i + 2); }
  else { const cp = n.lastIndexOf(':'); host = n.slice(0, cp); portStr = n.slice(cp + 1); }
  return { host, port: parseInt(portStr, 10) };
}

function normalizeBind(host, family) {
  if (host === '*' || host === '') return family === 'IPv6' ? '::' : '0.0.0.0';
  return host;
}

// Single lsof pass over TCP+UDP, IPv4+IPv6, all states. Returns { listeners, all }.
function scanSockets() {
  const output = execCmd('lsof -nP -iTCP -iUDP -F pcftPnT');
  const all = [];
  let pid = null, cmd = '';
  let fam = null, proto = null, name = null, state = null;
  const flushFile = () => {
    if (name != null) {
      const isConn = name.indexOf('->') >= 0;
      const local = isConn ? name.split('->')[0] : name;
      const { host, port } = parseHostPort(local);
      if (!isNaN(port) && port > 0 && port <= 65535) {
        all.push({
          pid, process_name: cmd,
          protocol: proto || 'TCP', family: fam || 'IPv4',
          bind_address: normalizeBind(host, fam), port,
          state: state || (proto === 'UDP' ? 'UDP' : null),
          conn: isConn,
        });
      }
    }
    fam = proto = name = state = null;
  };
  for (const line of output.split('\n')) {
    if (!line) continue;
    const tag = line[0], val = line.slice(1);
    if (tag === 'p') { flushFile(); pid = parseInt(val, 10) || null; cmd = ''; }
    else if (tag === 'c') { cmd = val; }
    else if (tag === 'f') { flushFile(); }
    else if (tag === 't') { fam = val; }
    else if (tag === 'P') { proto = val; }
    else if (tag === 'n') { name = val; }
    else if (tag === 'T') { if (val.startsWith('ST=')) state = val.slice(3); }
  }
  flushFile();
  const listeners = all.filter(s => !s.conn && (s.protocol === 'UDP' || s.state === 'LISTEN'));
  const seen = new Set();
  const deduped = listeners.filter(s => {
    const k = `${s.port}-${s.protocol}-${s.bind_address}-${s.pid}`;
    if (seen.has(k)) return false; seen.add(k); return true;
  });
  deduped.sort((a, b) => a.port - b.port || String(a.bind_address).localeCompare(String(b.bind_address)));
  return { listeners: deduped, all };
}

function suggestFree(start, end, liveUsed, declaredUsed) {
  for (let c = start; c <= end; c++) if (!liveUsed.has(c) && !declaredUsed.has(c)) return c;
  for (let c = start; c <= end; c++) if (!liveUsed.has(c)) return c;
  return null;
}

const PROCESS_NAME_MAP = {
  'com.docke': 'Docker Desktop', 'Docker': 'Docker Desktop', 'docker': 'Docker',
  'ControlCe': 'AirPlay Receiver', 'rapportd': 'AirPlay / Handoff', 'LM Studio': 'LM Studio',
  'node': 'Node.js', 'node.exe': 'Node.js', 'next-server': 'Next.js', 'next-dev': 'Next.js (dev)',
  'vite': 'Vite', 'python3': 'Python', 'python': 'Python', 'ollama': 'Ollama', 'Ollama': 'Ollama',
  'keybase': 'Keybase', 'kbfs': 'Keybase FS', 'Raycast': 'Raycast', 'Electron': 'Perci',
  'Antigravi': 'Antigravity', 'app_inkwe': 'Inkweasel', 'language_': 'Language Server',
  'lmlink-co': 'LM Link', 'sshd': 'SSH', 'postgres': 'PostgreSQL', 'redis-server': 'Redis', 'nginx': 'nginx',
};

function friendlyProcessName(raw) {
  if (!raw) return '—';
  if (PROCESS_NAME_MAP[raw]) return PROCESS_NAME_MAP[raw];
  const base = raw.replace(/\d+(\.\d+)*$/, '').toLowerCase();
  if (base === 'python') return 'Python';
  if (base === 'node') return 'Node.js';
  if (raw.length > 9 && PROCESS_NAME_MAP[raw.slice(0, 9)]) return PROCESS_NAME_MAP[raw.slice(0, 9)];
  return raw.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// Reconcile live listeners against PORTMASTER declarations.
function detectConflicts(listeners, entries) {
  const conflicts = [];
  const liveUsed = new Set(listeners.map(l => l.port));
  const declaredUsed = new Set(entries.map(e => e.port));
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const STOP = new Set(['app', 'com', 'the', 'backend', 'desktop', 'server', 'agent', 'service', 'daemon', 'run', 'serve', 'dev', 'api', 'node', 'python', 'main']);
  const tokens = (s) => String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3 && !STOP.has(t));
  const related = (a, b) => {
    const na = norm(a), nb = norm(b);
    if (na && nb && (na.includes(nb) || nb.includes(na))) return true;
    const tb = new Set(tokens(b));
    return tokens(a).some(t => tb.has(t));
  };

  const byPort = {};
  for (const e of entries) (byPort[e.port] = byPort[e.port] || []).push(e);
  for (const portKey of Object.keys(byPort)) {
    const group = byPort[portKey];
    const owners = [...new Set(group.map(e => norm(e.managed_by) || norm(e.service)).filter(Boolean))];
    if (owners.length > 1) {
      const a = group[0];
      const b = group.find(e => (norm(e.managed_by) || norm(e.service)) !== (norm(a.managed_by) || norm(a.service))) || group[1];
      const liveDup = listeners.find(l => l.port === Number(portKey) && l.pid);
      conflicts.push({
        port: Number(portKey), kind: 'duplicate_declaration',
        process_a: a.managed_by || a.service, pid_a: null,
        process_b: b.managed_by || b.service, pid_b: null,
        suggestion: suggestFree(3000, 3999, liveUsed, declaredUsed),
        explanation: `Port ${portKey} is declared to two different owners ("${a.managed_by || a.service}" and "${b.managed_by || b.service}") across PORTMASTER.md files${liveDup ? `, and is currently held by "${friendlyProcessName(liveDup.process_name)}" (PID ${liveDup.pid})` : ''}.`,
      });
    }
  }
  for (const l of listeners) {
    const decl = entries.find(e => e.port === l.port);
    if (!decl) continue;
    const declaredOwner = decl.managed_by || decl.service;
    if (declaredOwner && !related(declaredOwner, l.process_name) && !related(declaredOwner, friendlyProcessName(l.process_name))) {
      conflicts.push({
        port: l.port, kind: 'owner_mismatch',
        process_a: l.process_name, pid_a: l.pid,
        process_b: declaredOwner, pid_b: null,
        suggestion: suggestFree(3000, 3999, liveUsed, declaredUsed),
        explanation: `Port ${l.port} is declared for "${declaredOwner}" but is actually held by "${friendlyProcessName(l.process_name)}" (PID ${l.pid}).`,
      });
    }
  }
  // Attach every distinct live process bound to each conflicting port, so the
  // resolve UI can let the user choose which to kill (not a pre-picked one).
  const procsByPort = {};
  for (const l of listeners) {
    if (!l.pid) continue;
    const arr = (procsByPort[l.port] = procsByPort[l.port] || []);
    if (!arr.some(p => p.pid === l.pid)) arr.push({ pid: l.pid, name: l.process_name, port: l.port });
  }
  const allLiveProcs = [];
  for (const l of listeners) {
    if (!l.pid) continue;
    if (!allLiveProcs.some(p => p.pid === l.pid)) allLiveProcs.push({ pid: l.pid, name: l.process_name, port: l.port });
  }
  for (const c of conflicts) {
    const procs = [...(procsByPort[c.port] || [])];
    // Find process_b (the other conflict party) anywhere in the listener list by name.
    if (c.process_b) {
      for (const lp of allLiveProcs) {
        if (!procs.some(p => p.pid === lp.pid) && related(c.process_b, lp.name)) {
          procs.push({ pid: lp.pid, name: lp.name, port: lp.port, secondary: true });
        }
      }
    }
    c.processes = procs;
  }

  const seen = new Set();
  return conflicts.filter(c => { const k = `${c.port}-${c.kind}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

// Find config-file references to a port across the user's repos (read-only).
function findPortReferences(oldPort, newPort) {
  const home = app.getPath('home');
  const refs = [];
  const NAME_RE = /(^package\.json$|^\.env|^vite\.config\.|\.config\.(js|ts|cjs|mjs)$|^docker-compose.*\.ya?ml$|\.toml$|^PORTMASTER\.md$)/;
  const detectRe = new RegExp(`(?<![0-9])${oldPort}(?![0-9])`);
  const replaceRe = new RegExp(`(?<![0-9])${oldPort}(?![0-9])`, 'g'); // all occurrences on the line
  // Deployment-platform markers — NOT limited to Vercel/Supabase. Memoized per dir.
  const PLATFORM_MARKERS = {
    '.vercel/project.json': 'Vercel', 'vercel.json': 'Vercel',
    'netlify.toml': 'Netlify', '.netlify/state.json': 'Netlify',
    'fly.toml': 'Fly.io', 'railway.json': 'Railway', 'railway.toml': 'Railway',
    'render.yaml': 'Render', 'render.yml': 'Render',
    'wrangler.toml': 'Cloudflare', 'firebase.json': 'Firebase',
    'Procfile': 'Heroku', 'app.json': 'Heroku', 'app.yaml': 'App Engine',
    'serverless.yml': 'Serverless', 'serverless.yaml': 'Serverless',
    'supabase/config.toml': 'Supabase', 'amplify': 'Amplify',
  };
  const platformCache = {};
  const projectPlatforms = (fileDir) => {
    if (platformCache[fileDir] !== undefined) return platformCache[fileDir];
    const found = new Set();
    let dir = fileDir;
    for (let i = 0; i < 6 && dir && dir !== '/'; i++) {
      for (const marker in PLATFORM_MARKERS) {
        if (fsSync.existsSync(path.join(dir, marker))) found.add(PLATFORM_MARKERS[marker]);
      }
      if (dir === home) break;
      dir = path.dirname(dir);
    }
    return (platformCache[fileDir] = [...found]);
  };
  const REMOTE_VALUE_RE = /https?:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)|[a-z0-9-]+\.[a-z]{2,}(:\d+)?\/|(_URL|_URI|_KEY|_TOKEN|_SECRET|_DSN|PASSWORD|CONNECTION_?STRING)\s*[=:]/i;
  const scanFile = (full) => {
    try {
      const envFile = /^\.env/.test(path.basename(full));
      const platforms = projectPlatforms(path.dirname(full));
      const lines = fsSync.readFileSync(full, 'utf8').split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!detectRe.test(lines[i])) continue;
        let risk = 'low', reason = '';
        if (envFile) {
          risk = 'high';
          reason = platforms.length
            ? `Env file in a ${platforms.join('/')}-linked project — the remote may hold this value too`
            : 'Env file — values here are commonly synced to a deployment platform';
        } else if (REMOTE_VALUE_RE.test(lines[i])) {
          risk = 'high'; reason = 'Line carries a remote URL / credential — may be synced externally';
        } else if (platforms.length) {
          risk = 'medium'; reason = `In a ${platforms.join('/')}-linked project`;
        }
        refs.push({
          file_path: full, line_number: i + 1,
          old_line: lines[i], new_line: lines[i].replace(replaceRe, String(newPort)),
          old_port: oldPort, new_port: newPort,
          env_file: envFile, platforms, risk, reason,
        });
      }
    } catch { /* skip */ }
  };
  const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'release', '.next', '.cache',
    'Library', 'Applications', 'Downloads', 'Music', 'Movies', 'Pictures', 'Public']);
  const walk = (dir, depth) => {
    if (depth <= 0 || !fsSync.existsSync(dir)) return;
    let items; try { items = fsSync.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const it of items) {
      if (it.isDirectory()) { if (!SKIP.has(it.name) && !it.name.startsWith('.')) walk(path.join(dir, it.name), depth - 1); }
      else if (NAME_RE.test(it.name)) scanFile(path.join(dir, it.name));
    }
  };
  scanFile(path.join(home, '.config/agent-rules/PORTMASTER.md'));
  walk(home, 4);
  const seen = new Set();
  const rank = { high: 0, medium: 1, low: 2 };
  return refs
    .filter(r => { const k = `${r.file_path}:${r.line_number}`; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => (rank[a.risk] - rank[b.risk]) || a.file_path.localeCompare(b.file_path))
    .slice(0, 50);
}

function loadPortmasters() {
  const os = require('os');
  const home = app.getPath('home');
  const files = [];
  const check = (p) => {
    try {
      if (fsSync.existsSync(p)) files.push(p);
    } catch { /* skip */ }
  };
  check(path.join(home, '.config', 'agent-rules', 'PORTMASTER.md'));
  const walk = (dir, maxDepth) => {
    if (maxDepth <= 0) return;
    let entries = [];
    try {
      entries = fsSync.readdirSync(dir, { withFileTypes: true });
    } catch { return; }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full, maxDepth - 1);
      else if (entry.name === 'PORTMASTER.md') files.push(full);
    }
  };
  for (const d of ['projects', 'code', 'dev', 'workspace', 'src']) {
    walk(path.join(home, d), 4);
  }
  const entries = [];
  for (const f of [...new Set(files)]) {
    try {
      const content = fsSync.readFileSync(f, 'utf8');
      const tableRe = /\|\s*(\d+)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/;
      for (const line of content.split('\n')) {
        const m = tableRe.exec(line);
        if (m) {
          entries.push({
            port: parseInt(m[1], 10),
            service: m[2].trim(),
            protocol: m[3].trim(),
            bind: m[4].trim(),
            managed_by: m[5].trim(),
            notes: m[6].trim(),
            source_file: f,
          });
        }
      }
    } catch { /* skip */ }
  }
  return { files: [...new Set(files)], entries };
}

ipcMain.handle('lighthouse:scan', async () => {
  const { listeners } = scanSockets();
  const { files, entries } = loadPortmasters();
  const declared = new Set(entries.map(e => e.port));
  for (const p of listeners) {
    const pm = entries.find(e => e.port === p.port);
    if (pm) {
      p.service_name = pm.service;
      p.managed_by = pm.managed_by;
    }
    p.exposed = (p.bind_address === '0.0.0.0' || p.bind_address === '::');
    p.undeclared = !declared.has(p.port);
    p.source = 'Live';
  }
  const conflicts = detectConflicts(listeners, entries);
  const now = new Date();
  const last_scan = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
  return { ports: listeners, conflicts, portmaster_files: files, portmaster_entries: entries, last_scan, status: conflicts.length > 0 ? 'warning' : 'ok' };
});

ipcMain.handle('lighthouse:check-port', async (event, { port } = {}) => {
  const { listeners, all } = scanSockets();
  const entry = listeners.find(p => p.port === port);
  const liveUsed = new Set(listeners.map(p => p.port));
  const declared = new Set(loadPortmasters().entries.map(e => e.port));
  const suggestion = entry ? suggestFree(port + 1, 65535, liveUsed, declared) : null;
  const transient = !entry ? all.find(s => s.port === port && s.protocol === 'TCP' && s.state && s.state !== 'LISTEN') : null;
  return {
    port, in_use: !!entry,
    process: entry ? entry.process_name : (transient ? transient.process_name : null),
    pid: entry ? entry.pid : (transient ? transient.pid : null),
    bind: entry ? entry.bind_address : null,
    protocol: entry ? entry.protocol : null,
    transient_state: transient ? transient.state : null,
    suggestion,
  };
});

ipcMain.handle('lighthouse:suggest-port', async (event, { rangeStart, rangeEnd } = {}) => {
  const { listeners } = scanSockets();
  const liveUsed = new Set(listeners.map(p => p.port));
  const declared = new Set(loadPortmasters().entries.map(e => e.port));
  return suggestFree(rangeStart || 3000, rangeEnd || 3999, liveUsed, declared) || (rangeStart || 3000);
});

ipcMain.handle('lighthouse:find-references', async (event, { oldPort, newPort } = {}) => {
  return findPortReferences(oldPort, newPort);
});

ipcMain.handle('lighthouse:apply-fix', async (event, { filePath, lineNumber, newLine, oldLine } = {}) => {
  if (!isPathAllowed(filePath)) {
    return { ok: false, error: 'Access Denied: Path is outside the allowed workspace directories.' };
  }
  try {
    const lines = fsSync.readFileSync(filePath, 'utf8').split('\n');
    const idx = lineNumber - 1;
    if (idx < 0 || idx >= lines.length) return { ok: false, error: 'Line out of range' };
    if (oldLine != null && lines[idx] !== oldLine) return { ok: false, error: 'File changed since preview; skipped for safety' };
    lines[idx] = newLine;
    fsSync.writeFileSync(filePath, lines.join('\n'));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

ipcMain.handle('lighthouse:process-details', async (event, { pid } = {}) => {
  const safePid = Number.parseInt(pid, 10);
  if (!Number.isInteger(safePid) || safePid <= 0) {
    return { error: 'Invalid process id' };
  }

  const ppid = execCmd(`ps -o ppid= -p ${safePid}`).trim();
  const parent_pid = ppid ? parseInt(ppid, 10) : null;
  const parent_name = parent_pid ? execCmd(`ps -o comm= -p ${parent_pid}`).trim() : '';
  const parent_command = parent_pid ? execCmd(`ps -o command= -p ${parent_pid}`).trim() : '';
  let working_dir = '';
  for (const line of execCmd(`lsof -a -d cwd -p ${safePid} -Fn`).split('\n')) {
    if (line[0] === 'n') { working_dir = line.slice(1); break; }
  }
  return {
    pid: safePid,
    parent_pid,
    parent_name,
    parent_command,
    start_time: execCmd(`ps -o lstart= -p ${safePid}`).trim(),
    working_dir,
    command: execCmd(`ps -o command= -p ${safePid}`).trim(),
  };
});

ipcMain.handle('lighthouse:kill-process', async (event, { pid } = {}) => {
  try {
    execCmd(`kill -9 ${pid}`);
    return { ok: true, message: `Killed ${pid}` };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});
