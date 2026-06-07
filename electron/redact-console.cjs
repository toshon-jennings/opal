const SECRET_FIELD_PATTERN = /(api[_-]?key|authorization|x-api-key|token|secret|password|credential)/i;
const SECRET_VALUE_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]+/gi,
  /(sk-[A-Za-z0-9_-]{12,})/g,
  /(sk-or-[A-Za-z0-9_-]{12,})/g,
  /(gsk_[A-Za-z0-9_-]{12,})/g,
  /(AIza[0-9A-Za-z_-]{20,})/g,
  /([?&](?:key|api_key|apiKey|x-api-key)=)[^&\s]+/gi
];

function redactString(value) {
  return SECRET_VALUE_PATTERNS.reduce((text, pattern) => {
    if (pattern.source.startsWith('([?&]')) {
      return text.replace(pattern, '$1[REDACTED]');
    }
    if (pattern.source.startsWith('Bearer')) {
      return text.replace(pattern, 'Bearer [REDACTED]');
    }
    return text.replace(pattern, '[REDACTED]');
  }, value);
}

function redactSecrets(value, seen = new WeakSet(), depth = 0) {
  if (typeof value === 'string') return redactString(value);
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value) || depth > 4) return '[REDACTED_OBJECT]';

  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactString(value.message || ''),
      stack: value.stack ? redactString(value.stack) : undefined
    };
  }

  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(item => redactSecrets(item, seen, depth + 1));
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (SECRET_FIELD_PATTERN.test(key)) return [key, '[REDACTED]'];
    return [key, redactSecrets(item, seen, depth + 1)];
  }));
}

function isBrokenPipe(err) {
  return err && (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED' || err.code === 'ERR_STREAM_WRITE_AFTER_END');
}

function installRedactedConsole() {
  if (console.__perciRedactionInstalled) return;

  // When a parent pipe is torn down (e.g. a renderer hard-refresh or the dev
  // terminal closing the read end), the next write to stdout/stderr throws
  // EPIPE. Swallow it here so a lost log line never crashes the main process.
  for (const stream of [process.stdout, process.stderr]) {
    stream?.on?.('error', (err) => { if (!isBrokenPipe(err)) throw err; });
  }

  // Safety net: if EPIPE still escapes (e.g. synchronous throw from a write
  // that bypasses the stream error event), catch it at the process level rather
  // than letting it become an uncaught exception.
  if (!console.__perciEpipeHandlerInstalled) {
    process.on('uncaughtException', (err) => {
      if (isBrokenPipe(err)) return;
      // Re-throw non-EPIPE errors so they are not silently swallowed.
      throw err;
    });
    Object.defineProperty(console, '__perciEpipeHandlerInstalled', {
      value: true,
      configurable: false,
      enumerable: false
    });
  }

  ['log', 'info', 'warn', 'error', 'debug'].forEach((method) => {
    const original = console[method]?.bind(console);
    if (!original) return;
    console[method] = (...args) => {
      try {
        original(...args.map(arg => redactSecrets(arg)));
      } catch (err) {
        if (!isBrokenPipe(err)) throw err;
      }
    };
  });

  Object.defineProperty(console, '__perciRedactionInstalled', {
    value: true,
    configurable: false,
    enumerable: false
  });
}

module.exports = { installRedactedConsole, redactSecrets };
