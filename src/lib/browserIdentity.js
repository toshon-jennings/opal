const MAX_CUSTOM_USER_AGENT_LENGTH = 512;

export const BROWSER_IDENTITY_PROFILES = [
    {
        id: 'default',
        label: 'Default (Electron)',
        shortLabel: 'Default',
        description: 'Use Perci’s normal embedded-browser identity.',
    },
    {
        id: 'chrome-macos',
        label: 'Chrome on macOS',
        shortLabel: 'Mac Chrome',
        description: 'Identify as desktop Chrome without the Perci or Electron product tokens.',
    },
    {
        id: 'chrome-windows',
        label: 'Chrome on Windows',
        shortLabel: 'Windows',
        description: 'Test server behavior intended for desktop Windows visitors.',
    },
    {
        id: 'safari-iphone',
        label: 'Safari on iPhone',
        shortLabel: 'iPhone',
        description: 'Request iPhone-oriented content. Rendering still uses Chromium.',
    },
    {
        id: 'chrome-android',
        label: 'Chrome on Android',
        shortLabel: 'Android',
        description: 'Request content intended for Android Chrome.',
    },
    {
        id: 'googlebot',
        label: 'Googlebot',
        shortLabel: 'Googlebot',
        description: 'Inspect crawler-specific server responses.',
    },
    {
        id: 'custom',
        label: 'Custom…',
        shortLabel: 'Custom',
        description: 'Send a custom User-Agent string for this tab.',
    },
];

const PROFILE_IDS = new Set(BROWSER_IDENTITY_PROFILES.map(({ id }) => id));

function chromeVersion(defaultUserAgent) {
    return defaultUserAgent.match(/\bChrome\/([^\s]+)/i)?.[1] || '142.0.0.0';
}

function cleanDesktopChromeUserAgent(defaultUserAgent) {
    return defaultUserAgent
        .replace(/\s(?:Electron|Perci)\/[^\s]+/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function boundedCustomUserAgent(value) {
    return String(value || '').trim().slice(0, MAX_CUSTOM_USER_AGENT_LENGTH);
}

export function resolveBrowserIdentityUserAgent(
    profileId,
    { defaultUserAgent = '', customUserAgent = '' } = {},
) {
    const id = PROFILE_IDS.has(profileId) ? profileId : 'default';
    const version = chromeVersion(defaultUserAgent);

    if (id === 'chrome-macos') {
        return cleanDesktopChromeUserAgent(defaultUserAgent);
    }
    if (id === 'chrome-windows') {
        return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`;
    }
    if (id === 'safari-iphone') {
        return 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1';
    }
    if (id === 'chrome-android') {
        return `Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Mobile Safari/537.36`;
    }
    if (id === 'googlebot') {
        return 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
    }
    if (id === 'custom') {
        return boundedCustomUserAgent(customUserAgent) || defaultUserAgent;
    }
    return defaultUserAgent;
}

export function applyBrowserIdentityToWebview(
    webview,
    profileId,
    {
        defaultUserAgent = '',
        customUserAgent = '',
        reload = false,
    } = {},
) {
    const userAgent = resolveBrowserIdentityUserAgent(profileId, {
        defaultUserAgent,
        customUserAgent,
    });

    if (!webview?.setUserAgent || !userAgent) return { changed: false, userAgent };
    if (webview.getUserAgent?.() === userAgent) return { changed: false, userAgent };

    webview.setUserAgent(userAgent);
    if (reload && webview.reload) webview.reload();
    return { changed: true, userAgent };
}
