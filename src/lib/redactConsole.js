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

export function redactSecrets(value, seen = new WeakSet(), depth = 0) {
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

export function installRedactedConsole() {
    if (typeof console === 'undefined' || console.__perciRedactionInstalled) return;

    ['log', 'info', 'warn', 'error', 'debug'].forEach((method) => {
        const original = console[method]?.bind(console);
        if (!original) return;
        console[method] = (...args) => original(...args.map(arg => redactSecrets(arg)));
    });

    Object.defineProperty(console, '__perciRedactionInstalled', {
        value: true,
        configurable: false,
        enumerable: false
    });
}
