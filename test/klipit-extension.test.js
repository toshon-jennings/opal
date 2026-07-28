import { describe, it, expect } from 'vitest';
import { getKlipitExtensionPath, normalizeKlipitHealth } from '../electron/lib/klipit.cjs';
import path from 'path';

describe('klipit.cjs', () => {
    describe('getKlipitExtensionPath', () => {
        it('resolves packaged path relative to resources', () => {
            const resourcesPath = '/Applications/Perci.app/Contents/Resources';
            const expected = path.join(resourcesPath, 'electron', 'extensions', 'klipit');
            expect(getKlipitExtensionPath(resourcesPath, true)).toBe(expected);
        });

        it('resolves development path relative to lib directory', () => {
            const result = getKlipitExtensionPath('/unused', false);
            expect(result.endsWith(path.join('electron', 'extensions', 'klipit'))).toBe(true);
        });
    });

    describe('normalizeKlipitHealth', () => {
        it('handles successful load', () => {
            const ext = { id: 'abc123def456', name: 'Klipit', version: '0.4.4' };
            const result = normalizeKlipitHealth(ext, 'bundled');
            expect(result).toEqual({
                status: 'loaded',
                id: 'abc123def456',
                name: 'Klipit',
                version: '0.4.4',
                source: 'bundled',
                error: null
            });
        });

        it('handles missing extension', () => {
            const result = normalizeKlipitHealth(null, 'development');
            expect(result).toEqual({
                status: 'missing',
                id: null,
                name: 'Klipit',
                version: null,
                source: 'development',
                error: null
            });
        });

        it('handles load failure and sanitizes paths', () => {
            const error = new Error("Failed to load extension at /Users/admin/perci/electron/extensions/klipit: manifest not found");
            const result = normalizeKlipitHealth(null, 'bundled', error);
            expect(result.status).toBe('failed');
            expect(result.error).toContain('Failed to load extension at [path]');
            expect(result.error).not.toContain('/Users/admin');
        });
    });
});
