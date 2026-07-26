const { EventEmitter } = require('node:events');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createInterface } = require('node:readline');

const MAX_MESSAGE_LENGTH = 10_000_000;
const BUNDLED_CODEX_PATHS = [
  '/Applications/Codex.app/Contents/Resources/codex',
  '/Applications/ChatGPT.app/Contents/Resources/codex',
];
let cachedInstallation = null;
let installationCacheExpiresAt = 0;

function firstOutputLine(result) {
  const output = `${result?.stdout || ''}${result?.stderr ? `\n${result.stderr}` : ''}`;
  return output.split(/\r?\n/).map((line) => line.trim()).find(Boolean) || null;
}

async function resolvePathBinary(env, platform) {
  const command = platform === 'win32' ? 'where' : 'which';
  const result = await runCommand(command, ['codex'], 3000, env);
  return result.status === 0 ? firstOutputLine(result) : null;
}

function codexBinaryCandidates({
  env = process.env,
  platform = process.platform,
  home = env.HOME || env.USERPROFILE || '',
  pathBinary = null,
  shellBinary = null,
} = {}) {
  const candidates = [
    env.PERCI_CODEX_BINARY,
    pathBinary,
    shellBinary,
    home && path.join(home, '.hermes', 'node', 'bin', platform === 'win32' ? 'codex.exe' : 'codex'),
    home && path.join(home, '.local', 'bin', platform === 'win32' ? 'codex.exe' : 'codex'),
    home && path.join(home, '.volta', 'bin', platform === 'win32' ? 'codex.exe' : 'codex'),
    home && path.join(home, '.asdf', 'shims', platform === 'win32' ? 'codex.exe' : 'codex'),
    home && path.join(home, '.local', 'share', 'mise', 'shims', platform === 'win32' ? 'codex.exe' : 'codex'),
    home && path.join(home, '.npm-global', 'bin', platform === 'win32' ? 'codex.exe' : 'codex'),
    home && path.join(home, '.bun', 'bin', platform === 'win32' ? 'codex.exe' : 'codex'),
    home && path.join(home, 'bin', platform === 'win32' ? 'codex.exe' : 'codex'),
  ];

  if (platform === 'darwin') {
    candidates.push('/opt/homebrew/bin/codex', '/usr/local/bin/codex', ...BUNDLED_CODEX_PATHS);
  } else if (platform !== 'win32') {
    candidates.push('/usr/local/bin/codex', '/usr/bin/codex');
  }

  return Array.from(new Set(candidates.filter(Boolean)));
}

async function resolveLoginShellBinary(env, platform) {
  if (platform === 'win32') return null;
  const shell = env.SHELL;
  if (!shell || !path.isAbsolute(shell)) return null;
  const result = await runCommand(shell, ['-lic', 'command -v codex'], 5000, env);
  if (result.status !== 0) return null;
  return String(result.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => path.isAbsolute(line) && /(?:^|[/\\])codex(?:\.exe)?$/.test(line)) || null;
}

function runCommand(binary, args, timeoutMs = 5000, env = undefined) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let settled = false;
    let child;
    try {
      child = spawn(binary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        ...(env ? { env } : {}),
      });
    } catch {
      resolve({ status: null, stdout, stderr });
      return;
    }
    const finish = (status) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ status, stdout, stderr });
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* already exited */ }
      finish(null);
    }, timeoutMs);
    child.stdout.on('data', (chunk) => {
      if (stdout.length < 100_000) stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 100_000) stderr += chunk.toString();
    });
    child.once('error', () => finish(null));
    child.once('close', (code) => finish(code));
  });
}

async function resolveCodexInstallation(options = {}) {
  const useCache = Object.keys(options).length === 0;
  if (useCache && Date.now() < installationCacheExpiresAt) return cachedInstallation;

  const env = options.env || process.env;
  const platform = options.platform || process.platform;
  const pathBinary = options.pathBinary ?? await resolvePathBinary(env, platform);
  const shellBinary = options.shellBinary ?? (pathBinary ? null : await resolveLoginShellBinary(env, platform));
  const access = options.access || fs.accessSync;
  const probe = options.probe || ((candidate) => runCommand(candidate, ['--version']));

  for (const candidate of codexBinaryCandidates({ ...options, env, platform, pathBinary, shellBinary })) {
    try {
      access(candidate, fs.constants.X_OK);
    } catch {
      continue;
    }
    const result = await probe(candidate);
    const version = firstOutputLine(result);
    if (result?.status !== 0 || !version || !/\bcodex(?:-cli)?\b/i.test(version)) continue;
    const installation = {
      path: candidate,
      version,
      source: BUNDLED_CODEX_PATHS.includes(candidate) ? 'bundled' : 'user',
    };
    if (useCache) {
      cachedInstallation = installation;
      installationCacheExpiresAt = Date.now() + 300_000;
    }
    return installation;
  }
  if (useCache) {
    cachedInstallation = null;
    installationCacheExpiresAt = Date.now() + 10_000;
  }
  return null;
}

function normalizeWorkingDirectory(value, home) {
  if (typeof value !== 'string' || !value || value.length > 4096 || value.includes('\0')) return home;
  let expanded = value;
  if (value === '~') expanded = home;
  if (value.startsWith('~/') || value.startsWith('~\\')) {
    expanded = path.join(home, value.slice(2));
  }
  return path.isAbsolute(expanded) ? expanded : home;
}

function parseCodexLoginStatus(output, exitCode) {
  const text = String(output || '').trim();
  const lower = text.toLowerCase();
  if (exitCode !== 0 || /\bnot logged in\b|\blogin required\b|\bplease log in\b/.test(lower)) {
    return { authenticated: false, authMode: null, subscription: false };
  }
  if (lower.includes('chatgpt')) {
    return { authenticated: true, authMode: 'chatgpt', subscription: true };
  }
  if (/\bapi[ -]?key\b/.test(lower)) {
    return { authenticated: true, authMode: 'api-key', subscription: false };
  }
  return {
    authenticated: /\blogged in\b|\bauthenticated\b/.test(lower),
    authMode: null,
    subscription: false,
  };
}

function emptyCodexAccountStatus() {
  return {
    installed: false,
    authenticated: false,
    subscription: false,
    authMode: null,
    path: null,
    version: null,
    source: null,
  };
}

function codexStatusFromAccount(installation, response) {
  if (!installation) return emptyCodexAccountStatus();
  const account = response?.account && typeof response.account === 'object' ? response.account : null;
  const type = typeof account?.type === 'string' ? account.type.toLowerCase() : '';
  const subscription = type === 'chatgpt';
  return {
    installed: true,
    authenticated: Boolean(account),
    subscription,
    authMode: subscription ? 'chatgpt' : account ? 'api-key' : null,
    path: installation.path,
    version: installation.version,
    source: installation.source,
    plan: typeof account?.planType === 'string' ? account.planType : null,
  };
}

function selectCodexSubscriptionModel(requestedModel, models) {
  const requested = typeof requestedModel === 'string' ? requestedModel.trim() : '';
  if (!requested) return { model: '', requestedModel: null };
  const available = Array.isArray(models)
    ? models.filter((model) => model && typeof model.model === 'string' && !model.hidden)
    : [];
  if (available.some((model) => model.model === requested)) {
    return { model: requested, requestedModel: null };
  }
  const fallback = available.find((model) => model.isDefault)?.model || '';
  return { model: fallback, requestedModel: requested };
}

async function inspectCodexAccount(installation) {
  if (!installation) {
    return emptyCodexAccountStatus();
  }

  const loginResult = await runCommand(installation.path, ['login', 'status']);
  const loginOutput = `${loginResult.stdout || ''}${loginResult.stderr ? `\n${loginResult.stderr}` : ''}`;
  return {
    installed: true,
    ...parseCodexLoginStatus(loginOutput, loginResult.status ?? 1),
    path: installation.path,
    version: installation.version,
    source: installation.source,
    plan: null,
  };
}

function trustedCodexAuthUrl(value) {
  try {
    const url = new URL(value);
    const allowedHost = ['openai.com', 'chatgpt.com'].some(
      (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    );
    return url.protocol === 'https:' && allowedHost ? url.toString() : null;
  } catch {
    return null;
  }
}

class CodexAccountClient extends EventEmitter {
  constructor({ binaryResolver = async () => (await resolveCodexInstallation())?.path } = {}) {
    super();
    this.binaryResolver = binaryResolver;
    this.process = null;
    this.ready = null;
    this.pending = new Map();
    this.nextId = 1;
    this.modelsCache = null;
  }

  start() {
    if (this.ready) return this.ready;
    this.ready = Promise.resolve(this.binaryResolver()).then((resolved) => new Promise((resolve, reject) => {
      const binary = typeof resolved === 'string' ? resolved : resolved?.path;
      if (!binary) {
        reject(new Error('Codex is not installed.'));
        return;
      }
      const child = spawn(binary, ['app-server'], { stdio: ['pipe', 'pipe', 'pipe'] });
      this.process = child;
      createInterface({ input: child.stdout }).on('line', (line) => this.handleLine(line));
      child.stderr.on('data', (chunk) => this.emit('diagnostic', chunk.toString()));
      child.once('error', (error) => {
        this.process = null;
        this.ready = null;
        reject(error);
      });
      child.once('exit', (code) => {
        const error = new Error(`Codex app-server exited with code ${code}`);
        for (const pending of this.pending.values()) {
          clearTimeout(pending.timer);
          pending.reject(error);
        }
        this.pending.clear();
        this.process = null;
        this.ready = null;
      });

      this.request('initialize', {
        clientInfo: { name: 'perci_pocket', title: 'Perci Pocket', version: '1' },
        capabilities: { experimentalApi: false, requestAttestation: false },
      }, 10_000)
        .then((result) => {
          this.notify('initialized', {});
          resolve(result);
        })
        .catch((error) => {
          this.stop();
          reject(error);
        });
    })).catch((error) => {
      this.ready = null;
      throw error;
    });

    return this.ready;
  }

  request(method, params, timeoutMs = 10_000) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (!this.pending.delete(id)) return;
        reject(new Error(`Codex did not answer ${method}.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ method, id, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  write(message) {
    if (!this.process?.stdin.writable) throw new Error('Codex app-server is unavailable.');
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  notify(method, params) {
    this.write({ method, params });
  }

  handleLine(line) {
    if (!line || line.length > MAX_MESSAGE_LENGTH) return;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }
    if (!message || typeof message !== 'object' || Array.isArray(message)) return;

    if (Object.hasOwn(message, 'id') && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      clearTimeout(pending.timer);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message || 'Codex request failed.'));
      else pending.resolve(message.result);
      return;
    }
    if (typeof message.method === 'string') this.emit('notification', message);
  }

  async startChatGptLogin() {
    await this.start();
    const result = await this.request('account/login/start', {
      type: 'chatgpt',
      codexStreamlinedLogin: true,
      useHostedLoginSuccessPage: true,
      appBrand: 'codex',
    });
    if (!result || typeof result.loginId !== 'string' || !trustedCodexAuthUrl(result.authUrl)) {
      throw new Error('Codex returned an invalid sign-in response.');
    }
    return result;
  }

  async getAccount() {
    await this.start();
    const result = await this.request('account/read', { refreshToken: false });
    if (!result || typeof result !== 'object' || Array.isArray(result)) {
      throw new Error('Codex returned an invalid account response.');
    }
    return result;
  }

  async listModels() {
    if (this.modelsCache && Date.now() < this.modelsCache.expiresAt) {
      return this.modelsCache.models;
    }
    await this.start();
    const models = [];
    let cursor = null;
    do {
      const result = await this.request('model/list', {
        cursor,
        limit: 100,
        includeHidden: false,
      });
      if (!result || !Array.isArray(result.data)) {
        throw new Error('Codex returned an invalid model catalog.');
      }
      for (const model of result.data) {
        if (model && typeof model.model === 'string' && !model.hidden) models.push(model);
      }
      cursor = typeof result.nextCursor === 'string' && result.nextCursor ? result.nextCursor : null;
      if (models.length > 1000) throw new Error('Codex model catalog exceeded the supported size.');
    } while (cursor);
    this.modelsCache = { models, expiresAt: Date.now() + 300_000 };
    return models;
  }

  stop() {
    if (this.process && !this.process.killed) this.process.kill();
    this.process = null;
    this.ready = null;
  }
}

module.exports = {
  CodexAccountClient,
  codexStatusFromAccount,
  codexBinaryCandidates,
  emptyCodexAccountStatus,
  inspectCodexAccount,
  normalizeWorkingDirectory,
  parseCodexLoginStatus,
  resolveCodexInstallation,
  selectCodexSubscriptionModel,
  trustedCodexAuthUrl,
};
