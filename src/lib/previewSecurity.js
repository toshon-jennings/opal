export const PREVIEW_SECURITY_LIMITS = {
    maxSourceChars: 180_000,
    maxPreviewChars: 260_000,
    maxAnimationFrames: 1_800,
    maxTimers: 80,
    minIntervalMs: 32,
    maxExportPixels: 12_000_000
};

export const PREVIEW_CDN_URLS = {
    react: 'https://unpkg.com/react@18.2.0/umd/react.production.min.js',
    reactDom: 'https://unpkg.com/react-dom@18.2.0/umd/react-dom.production.min.js',
    babel: 'https://unpkg.com/@babel/standalone@7.26.4/babel.min.js',
    tailwind: 'https://cdn.tailwindcss.com/3.4.17'
};

export function getPreviewSandbox({ scripts = false, forms = false } = {}) {
    const tokens = [];
    if (scripts) tokens.push('allow-scripts');
    if (forms) tokens.push('allow-forms');
    return tokens.join(' ');
}

export function getPreviewCsp({ scripts = false, styles = false, images = true } = {}) {
    const scriptSrc = scripts
        ? `'unsafe-inline' 'unsafe-eval' ${Object.values(PREVIEW_CDN_URLS).map(url => new URL(url).origin).join(' ')}`
        : "'none'";
    const styleSrc = styles ? "'unsafe-inline'" : "'none'";
    const imgSrc = images ? 'data: blob: https:' : "'none'";

    return [
        "default-src 'none'",
        `script-src ${scriptSrc}`,
        `style-src ${styleSrc}`,
        `img-src ${imgSrc}`,
        "font-src data: https:",
        "connect-src 'none'",
        "media-src 'none'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'"
    ].join('; ');
}

export function assertPreviewBudget(label, value, limit = PREVIEW_SECURITY_LIMITS.maxPreviewChars) {
    const size = typeof value === 'number' ? value : String(value || '').length;
    if (size > limit) {
        throw new Error(`${label} is too large to preview safely.`);
    }
}

export function createPreviewRuntimeGuard() {
    return `
(function () {
    const limits = ${JSON.stringify(PREVIEW_SECURITY_LIMITS)};
    let frameCount = 0;
    let timerCount = 0;
    const nativeRequestAnimationFrame = window.requestAnimationFrame.bind(window);
    const nativeSetInterval = window.setInterval.bind(window);
    const nativeSetTimeout = window.setTimeout.bind(window);

    window.requestAnimationFrame = function guardedRequestAnimationFrame(callback) {
        if (frameCount >= limits.maxAnimationFrames) return 0;
        frameCount += 1;
        return nativeRequestAnimationFrame(function (time) {
            try {
                callback(time);
            } catch (error) {
                console.error(error);
            }
        });
    };

    window.setInterval = function guardedSetInterval(callback, delay) {
        if (timerCount >= limits.maxTimers) return 0;
        timerCount += 1;
        return nativeSetInterval(callback, Math.max(Number(delay) || limits.minIntervalMs, limits.minIntervalMs));
    };

    window.setTimeout = function guardedSetTimeout(callback, delay) {
        return nativeSetTimeout(callback, Math.max(Number(delay) || 0, 0));
    };
}());
    `;
}

export function buildStaticPreviewDocument(content, { title = 'Preview', type = 'html' } = {}) {
    assertPreviewBudget(title, content);
    const isSvg = type === 'svg';
    const body = isSvg
        ? `<div class="stage">${content}</div>`
        : content;

    return `<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${getPreviewCsp({ images: true })}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        html, body { margin: 0; min-height: 100%; background: transparent; color: inherit; }
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
        .stage { min-height: 100vh; display: grid; place-items: center; padding: 32px; box-sizing: border-box; }
        svg { max-width: 100%; max-height: 100vh; }
    </style>
</head>
<body>${body}</body>
</html>`;
}

export function buildPreviewErrorDocument(message) {
    return `<!doctype html>
<html>
<head>
    <meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="${getPreviewCsp()}">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            margin: 0;
            min-height: 100vh;
            display: grid;
            place-items: center;
            background: #0f1115;
            color: #fca5a5;
            font: 13px/1.5 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        }
        main {
            max-width: 520px;
            padding: 24px;
            border: 1px solid rgba(248, 113, 113, 0.28);
            border-radius: 12px;
            background: rgba(248, 113, 113, 0.08);
        }
    </style>
</head>
<body><main>${escapeHtml(message)}</main></body>
</html>`;
}

function escapeHtml(value = '') {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
