const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const https = require('https');

const DEFAULT_PORT = 6768;
const DEFAULT_BASE_URL = `http://localhost:${DEFAULT_PORT}`;
const DEFAULT_PROVIDER = 'openrouter';
const DEFAULT_MODEL = 'anthropic/claude-sonnet-4';
const DEFAULT_CONTAINER_TAG = 'perci_memory';
const LOCAL_MODEL_PROVIDERS = new Set(['ollama', 'lmstudio', 'jan']);

let childProcess = null;
let lastProgress = { step: 0, label: 'Idle', done: false };
let lastError = '';
let logTail = [];

function appendLog(line) {
  const text = String(line || '').trim();
  if (!text) return;
  logTail.push(text);
  if (logTail.length > 80) logTail = logTail.slice(-80);
}

function commandExists(command, extraPaths = []) {
  const envPath = [process.env.PATH || '', ...extraPaths].filter(Boolean).join(path.delimiter);
  const result = spawnSync('which', [command], {
    env: { ...process.env, PATH: envPath },
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() : '';
}

function defaultDataDir() {
  return path.join(app.getPath('userData'), 'supermemory');
}

function defaultModelBaseURL(provider = DEFAULT_PROVIDER) {
  switch (provider) {
    case 'openai':
      return 'https://api.openai.com/v1';
    case 'anthropic':
      return 'https://api.anthropic.com/v1';
    case 'mistral':
      return 'https://api.mistral.ai/v1';
    case 'groq':
      return 'https://api.groq.com/openai/v1';
    case 'ollama':
      return 'http://localhost:11434/v1';
    case 'lmstudio':
      return 'http://localhost:1234/v1';
    case 'jan':
      return 'http://localhost:1337/v1';
    case 'openrouter':
    default:
      return 'https://openrouter.ai/api/v1';
  }
}

function normalizeConfig(config = {}) {
  const port = Number.parseInt(config.port || DEFAULT_PORT, 10) || DEFAULT_PORT;
  const baseURL = (config.baseURL || `http://localhost:${port}`).replace(/\/+$/, '');
  const provider = config.provider || DEFAULT_PROVIDER;
  return {
    enabled: Boolean(config.enabled),
    baseURL,
    port,
    apiKey: config.apiKey || '',
    provider,
    providerKey: config.providerKey || config.openrouterKey || '',
    openrouterKey: config.openrouterKey || '',
    modelBaseURL: (config.modelBaseURL || defaultModelBaseURL(provider)).replace(/\/+$/, ''),
    model: config.model || DEFAULT_MODEL,
    dataDir: config.dataDir || defaultDataDir(),
    containerTag: config.containerTag || DEFAULT_CONTAINER_TAG,
    binaryPath: config.binaryPath || '',
  };
}

function discoverBinary(config = {}) {
  const home = app.getPath('home');
  const candidates = [
    config.binaryPath,
    path.join(home, '.supermemory', 'bin', 'supermemory-server'),
    path.join(home, '.local', 'bin', 'supermemory-server'),
    '/opt/homebrew/bin/supermemory-server',
    '/usr/local/bin/supermemory-server',
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // keep searching
    }
  }

  return commandExists('supermemory-server', [
    path.join(home, '.local', 'bin'),
    path.join(home, '.supermemory', 'bin'),
    '/opt/homebrew/bin',
    '/usr/local/bin',
  ]);
}

function getBinaryVersion(binaryPath) {
  if (!binaryPath) return '';
  const result = spawnSync(binaryPath, ['--version'], {
    encoding: 'utf8',
    timeout: 3000,
  });
  if (result.status !== 0) return '';
  return (result.stdout || result.stderr || '').trim();
}

function directorySizeBytes(rootDir, limit = 25_000) {
  let total = 0;
  let seen = 0;

  function walk(dir) {
    if (seen >= limit) return;
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (seen >= limit) return;
      seen += 1;
      const fullPath = path.join(dir, entry.name);
      try {
        if (entry.isDirectory()) {
          walk(fullPath);
        } else if (entry.isFile()) {
          total += fs.statSync(fullPath).size;
        }
      } catch {
        // Ignore files that move while measuring.
      }
    }
  }

  walk(rootDir);
  return { bytes: total, truncated: seen >= limit };
}

function request({ method = 'GET', url, headers = {}, body = null, timeoutMs = 3000 }) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      resolve({ ok: false, status: 0, body: '', error: err.message });
      return;
    }

    const payload = body == null ? null : JSON.stringify(body);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(parsed, {
      method,
      timeout: timeoutMs,
      headers: {
        ...(payload ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(payload) } : {}),
        ...headers,
      },
    }, (res) => {
      let responseBody = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        responseBody += chunk;
        if (responseBody.length > 2_000_000) req.destroy(new Error('Response too large'));
      });
      res.on('end', () => {
        let data = null;
        try {
          data = responseBody ? JSON.parse(responseBody) : null;
        } catch {
          data = null;
        }
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          body: responseBody,
          data,
        });
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, status: 0, body: '', error: 'Connection timed out' });
    });
    req.on('error', (err) => {
      resolve({ ok: false, status: 0, body: '', error: err.message });
    });
    if (payload) req.write(payload);
    req.end();
  });
}

function authHeaders(config) {
  return config.apiKey ? { authorization: `Bearer ${config.apiKey}` } : {};
}

async function checkHealth(configInput = {}) {
  const config = normalizeConfig(configInput);
  const health = await request({
    url: `${config.baseURL}/health`,
    timeoutMs: 1800,
    headers: authHeaders(config),
  });
  if (health.ok) return { healthy: true, status: health.status, endpoint: '/health' };

  const root = await request({
    url: `${config.baseURL}/`,
    timeoutMs: 1800,
    headers: authHeaders(config),
  });
  if (root.ok) return { healthy: true, status: root.status, endpoint: '/' };

  return {
    healthy: false,
    responding: Boolean(health.status || root.status),
    status: health.status || root.status || 0,
    error: health.error || root.error || `HTTP ${health.status || root.status}`,
  };
}

async function getStatus(configInput = {}) {
  const config = normalizeConfig(configInput);
  const binaryPath = discoverBinary(config);
  const version = getBinaryVersion(binaryPath);
  const dataDirSize = directorySizeBytes(config.dataDir);
  const health = await checkHealth(config);
  const running = health.healthy;
  const portConflict = !running && health.responding && !childProcess;

  return {
    running,
    state: running ? 'running' : portConflict ? 'port-conflict' : binaryPath ? 'stopped' : 'not-installed',
    apiKey: config.apiKey || null,
    hasApiKey: Boolean(config.apiKey),
    binaryFound: Boolean(binaryPath),
    binaryPath,
    version,
    baseURL: config.baseURL,
    port: config.port,
    provider: config.provider,
    hasProviderKey: Boolean(config.providerKey),
    providerNeedsKey: !LOCAL_MODEL_PROVIDERS.has(config.provider),
    modelBaseURL: config.modelBaseURL,
    model: config.model,
    dataDir: config.dataDir,
    dataDirSize,
    containerTag: config.containerTag,
    managedPid: childProcess?.pid || null,
    portResponding: Boolean(health.responding || running),
    health,
    error: portConflict ? `Port ${config.port} is responding but Supermemory is not healthy.` : '',
    logs: logTail.slice(-10),
  };
}

function parseApiKey(text) {
  const match = String(text || '').match(/\bapi key\b\s*:?\s*(sm_[A-Za-z0-9_-]+)/i);
  return match ? match[1] : '';
}

function modelProviderEnv(config) {
  const env = {
    OPENAI_BASE_URL: config.modelBaseURL,
    OPENAI_API_KEY: config.providerKey || '',
    OPENAI_MODEL: config.model,
  };
  if (config.provider === 'anthropic') {
    env.ANTHROPIC_API_KEY = config.providerKey || '';
    env.ANTHROPIC_MODEL = config.model;
  }
  if (config.provider === 'gemini') {
    env.GOOGLE_API_KEY = config.providerKey || '';
    env.GEMINI_API_KEY = config.providerKey || '';
  }
  return env;
}

async function waitForHealthy(config, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const health = await checkHealth(config);
    if (health.healthy) return true;
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return false;
}

async function start(configInput = {}, { onApiKey } = {}) {
  const config = normalizeConfig(configInput);
  lastError = '';
  lastProgress = { step: 0, label: 'Finding Supermemory binary', done: false };

  const status = await getStatus(config);
  if (status.running) {
    lastProgress = { step: 3, label: 'Supermemory is already running', done: true };
    return { ok: true, state: 'running', ...status };
  }
  if (status.state === 'port-conflict') {
    lastError = status.error;
    lastProgress = { step: 0, label: 'Port conflict', error: status.error };
    return { ok: false, error: status.error, state: 'port-conflict' };
  }

  const binaryPath = status.binaryPath || discoverBinary(config);
  if (!binaryPath) {
    lastError = 'supermemory-server was not found. Install it with curl -fsSL https://supermemory.ai/install | bash.';
    lastProgress = { step: 0, label: 'Binary not found', error: lastError };
    return { ok: false, error: lastError, state: 'not-installed' };
  }
  if (!config.providerKey && !LOCAL_MODEL_PROVIDERS.has(config.provider)) {
    lastError = `Add a ${config.provider} API key in Settings > Models before starting Supermemory.`;
    lastProgress = { step: 1, label: 'Missing provider key', error: lastError };
    return { ok: false, error: lastError, state: 'needs-config' };
  }

  fs.mkdirSync(config.dataDir, { recursive: true });
  lastProgress = { step: 1, label: 'Spawning Supermemory server', done: false };

  childProcess = spawn(binaryPath, [], {
    cwd: app.getPath('userData'),
    env: {
      ...process.env,
      ...modelProviderEnv(config),
      SUPERMEMORY_DATA_DIR: config.dataDir,
      PORT: String(config.port),
      PATH: [path.dirname(binaryPath), process.env.PATH || ''].filter(Boolean).join(path.delimiter),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  childProcess.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    appendLog(text);
    const apiKey = parseApiKey(text);
    if (apiKey && typeof onApiKey === 'function') onApiKey(apiKey);
  });
  childProcess.stderr.on('data', (chunk) => {
    const text = chunk.toString();
    appendLog(text);
    const apiKey = parseApiKey(text);
    if (apiKey && typeof onApiKey === 'function') onApiKey(apiKey);
  });
  childProcess.on('error', (err) => {
    lastError = err.message;
    lastProgress = { step: 1, label: 'Process error', error: err.message };
    childProcess = null;
  });
  childProcess.on('exit', (code, signal) => {
    appendLog(`supermemory-server exited code=${code} signal=${signal || ''}`);
    if (childProcess) {
      lastError = code === 0 ? '' : `supermemory-server exited with code ${code}`;
      lastProgress = { step: 0, label: 'Stopped', error: lastError || undefined };
    }
    childProcess = null;
  });

  lastProgress = { step: 2, label: 'Waiting for API health', done: false };
  const ready = await waitForHealthy(config, 30000);
  if (!ready) {
    lastError = `Timed out waiting for Supermemory to respond on localhost:${config.port}.`;
    lastProgress = { step: 2, label: 'Health check timed out', error: lastError };
    return { ok: false, error: lastError, state: 'error', logs: logTail.slice(-20) };
  }

  lastProgress = { step: 3, label: 'Ready', done: true };
  return { ok: true, state: 'running', binaryPath, port: config.port, baseURL: config.baseURL };
}

async function stop() {
  if (!childProcess) {
    return { ok: true, state: 'stopped', managed: false };
  }

  const proc = childProcess;
  childProcess = null;
  lastProgress = { step: 0, label: 'Stopping Supermemory', done: false };

  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      resolve();
    }, 5000);
    proc.once('exit', () => {
      clearTimeout(timer);
      resolve();
    });
    try {
      proc.kill('SIGTERM');
    } catch {
      clearTimeout(timer);
      resolve();
    }
  });

  lastProgress = { step: 0, label: 'Stopped', done: true };
  return { ok: true, state: 'stopped', managed: true };
}

async function restart(config, callbacks) {
  await stop();
  return start(config, callbacks);
}

function progress() {
  return {
    ...lastProgress,
    error: lastProgress.error || lastError || null,
    logs: logTail.slice(-10),
  };
}

async function proxyApi(configInput = {}, method = 'GET', apiPath = '/', body = null) {
  const config = normalizeConfig(configInput);
  const normalizedMethod = String(method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].includes(normalizedMethod)) {
    return { ok: false, status: 400, error: 'Unsupported method' };
  }
  if (typeof apiPath !== 'string' || !apiPath.startsWith('/')) {
    return { ok: false, status: 400, error: 'Path must start with /' };
  }
  if (!/^\/(?:health|v3\/|v4\/|$)/.test(apiPath)) {
    return { ok: false, status: 400, error: 'Unsupported Supermemory API path' };
  }

  const result = await request({
    method: normalizedMethod,
    url: `${config.baseURL}${apiPath}`,
    headers: authHeaders(config),
    body,
    timeoutMs: 15000,
  });
  return {
    ok: result.ok,
    status: result.status,
    data: result.data,
    body: result.data ? undefined : result.body,
    error: result.ok ? undefined : (result.error || result.body || `HTTP ${result.status}`),
  };
}

async function wipeData(configInput = {}) {
  const config = normalizeConfig(configInput);
  await stop();
  const resolvedDataDir = path.resolve(config.dataDir || '');
  const basename = path.basename(resolvedDataDir);
  if (
    !config.dataDir
    || resolvedDataDir === path.parse(resolvedDataDir).root
    || !['.supermemory', 'supermemory'].includes(basename)
  ) {
    return { ok: false, error: 'Refusing to wipe an unsafe data directory.' };
  }
  fs.rmSync(resolvedDataDir, { recursive: true, force: true });
  logTail = [];
  lastProgress = { step: 0, label: 'Data directory wiped', done: true };
  return { ok: true, dataDir: resolvedDataDir };
}

module.exports = {
  DEFAULT_PORT,
  DEFAULT_BASE_URL,
  DEFAULT_PROVIDER,
  DEFAULT_MODEL,
  DEFAULT_CONTAINER_TAG,
  defaultModelBaseURL,
  defaultDataDir,
  normalizeConfig,
  discoverBinary,
  getStatus,
  start,
  stop,
  restart,
  progress,
  proxyApi,
  wipeData,
};
