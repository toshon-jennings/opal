import { describe, expect, it } from 'vitest';
import {
    applyBrowserIdentityToWebview,
    BROWSER_IDENTITY_PROFILES,
    resolveBrowserIdentityUserAgent,
} from '../src/lib/browserIdentity.js';

const electronUserAgent = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    'AppleWebKit/537.36 (KHTML, like Gecko)',
    'Perci/0.44.2 Chrome/142.0.0.0 Electron/42.0.1 Safari/537.36',
].join(' ');

describe('Localhost browser identity profiles', () => {
    it('restores the exact Electron identity when Default is selected', () => {
        expect(resolveBrowserIdentityUserAgent('default', {
            defaultUserAgent: electronUserAgent,
        })).toBe(electronUserAgent);
    });

    it('offers a Chrome on macOS identity without Perci or Electron product tokens', () => {
        const userAgent = resolveBrowserIdentityUserAgent('chrome-macos', {
            defaultUserAgent: electronUserAgent,
        });

        expect(userAgent).toContain('Chrome/142.0.0.0');
        expect(userAgent).not.toContain('Electron/');
        expect(userAgent).not.toContain('Perci/');
    });

    it('uses the embedded Chromium major version for device presets', () => {
        expect(resolveBrowserIdentityUserAgent('chrome-windows', {
            defaultUserAgent: electronUserAgent,
        })).toContain('Windows NT 10.0; Win64; x64');

        expect(resolveBrowserIdentityUserAgent('chrome-android', {
            defaultUserAgent: electronUserAgent,
        })).toContain('Chrome/142.0.0.0 Mobile');
    });

    it('accepts a bounded custom identity and safely falls back for unknown profiles', () => {
        expect(resolveBrowserIdentityUserAgent('custom', {
            defaultUserAgent: electronUserAgent,
            customUserAgent: `  ${'x'.repeat(600)}  `,
        })).toHaveLength(512);

        expect(resolveBrowserIdentityUserAgent('unknown', {
            defaultUserAgent: electronUserAgent,
        })).toBe(electronUserAgent);
    });

    it('exposes unique, user-facing profile identifiers', () => {
        const ids = BROWSER_IDENTITY_PROFILES.map(({ id }) => id);

        expect(new Set(ids).size).toBe(ids.length);
        expect(ids).toEqual(expect.arrayContaining([
            'default',
            'chrome-macos',
            'chrome-windows',
            'safari-iphone',
            'chrome-android',
            'googlebot',
            'custom',
        ]));
    });

    it('updates and reloads an attached Electron webview only when identity changes', () => {
        let currentUserAgent = electronUserAgent;
        let reloads = 0;
        const webview = {
            getUserAgent: () => currentUserAgent,
            setUserAgent: (nextUserAgent) => { currentUserAgent = nextUserAgent; },
            reload: () => { reloads += 1; },
        };

        expect(applyBrowserIdentityToWebview(webview, 'safari-iphone', {
            defaultUserAgent: electronUserAgent,
            reload: true,
        })).toMatchObject({
            changed: true,
            userAgent: expect.stringContaining('iPhone'),
        });
        expect(reloads).toBe(1);

        expect(applyBrowserIdentityToWebview(webview, 'safari-iphone', {
            defaultUserAgent: electronUserAgent,
            reload: true,
        }).changed).toBe(false);
        expect(reloads).toBe(1);
    });
});
