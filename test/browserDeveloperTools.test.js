import { describe, expect, it } from 'vitest';
import {
    appendBrowserDiagnostic,
    BROWSER_VIEWPORT_PRESETS,
    browserConsoleLevel,
    formatJsonDocument,
    resolveBrowserViewport,
} from '../src/lib/browserDeveloperTools.js';

describe('Localhost browser developer tools', () => {
    it('offers bounded viewport presets while keeping Fit as the safe default', () => {
        expect(BROWSER_VIEWPORT_PRESETS.map(({ id }) => id)).toEqual([
            'fit',
            'iphone',
            'android',
            'tablet',
            'desktop',
        ]);
        expect(resolveBrowserViewport('iphone')).toMatchObject({
            width: 390,
            height: 844,
        });
        expect(resolveBrowserViewport('unknown')).toMatchObject({
            id: 'fit',
            width: null,
            height: null,
        });
    });

    it('keeps a bounded newest-first diagnostic summary with safe text', () => {
        let diagnostics = [];
        for (let index = 0; index < 45; index += 1) {
            diagnostics = appendBrowserDiagnostic(diagnostics, {
                kind: index === 44 ? 'crash' : 'console',
                level: index === 44 ? 'error' : 'info',
                message: index === 44 ? `  ${'x'.repeat(600)}  ` : `message ${index}`,
                timestamp: index,
            });
        }

        expect(diagnostics).toHaveLength(40);
        expect(diagnostics[0]).toMatchObject({
            kind: 'crash',
            level: 'error',
            timestamp: 44,
        });
        expect(diagnostics[0].message).toHaveLength(400);
        expect(diagnostics.at(-1).message).toBe('message 5');
    });

    it('formats a JSON document without executing or mutating its content', () => {
        expect(formatJsonDocument('{"ok":true,"items":[1,2]}')).toEqual({
            ok: true,
            formatted: '{\n  "ok": true,\n  "items": [\n    1,\n    2\n  ]\n}',
        });
        expect(formatJsonDocument('not json')).toEqual({
            ok: false,
            error: 'The page content is not valid JSON.',
        });
        expect(formatJsonDocument('   ')).toEqual({
            ok: false,
            error: 'The page does not contain JSON text.',
        });
        expect(formatJsonDocument(`{"value":"${'x'.repeat(1_000_000)}"}`)).toEqual({
            ok: false,
            error: 'The JSON document is too large to format safely.',
        });
    });

    it('normalizes Electron console severities for the diagnostic summary', () => {
        expect(browserConsoleLevel(0)).toBe('info');
        expect(browserConsoleLevel(2)).toBe('warning');
        expect(browserConsoleLevel(3)).toBe('error');
        expect(browserConsoleLevel('error')).toBe('error');
        expect(browserConsoleLevel('unknown')).toBe('info');
    });
});
