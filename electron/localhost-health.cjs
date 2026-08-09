const http = require('http');
const https = require('https');

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

function parseLocalHttpUrl(rawUrl) {
  if (typeof rawUrl !== 'string' || rawUrl.length > 2048) return null;
  try {
    const parsed = new URL(rawUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!LOOPBACK_HOSTS.has(parsed.hostname)) return null;
    if (parsed.username || parsed.password) return null;
    return parsed;
  } catch {
    return null;
  }
}

function probeLocalHttp(rawUrl, timeoutMs = 2000, headers = undefined) {
  return new Promise((resolve) => {
    const parsed = parseLocalHttpUrl(rawUrl);
    if (!parsed) {
      resolve({
        ok: false,
        reachable: false,
        error: 'Only loopback HTTP URLs can be checked.',
      });
      return;
    }

    const client = parsed.protocol === 'https:' ? https : http;
    const startedAt = Date.now();
    const req = client.get(parsed, { timeout: timeoutMs, headers }, (res) => {
      const status = Number(res.statusCode) || null;
      res.destroy();
      resolve({
        ok: status >= 200 && status < 400,
        reachable: true,
        status,
        latencyMs: Date.now() - startedAt,
      });
    });

    req.on('timeout', () => {
      req.destroy(new Error('Connection timed out'));
    });
    req.on('error', (err) => {
      resolve({
        ok: false,
        reachable: false,
        error: err.message,
        latencyMs: Date.now() - startedAt,
      });
    });
  });
}

module.exports = { parseLocalHttpUrl, probeLocalHttp };
