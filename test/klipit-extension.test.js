import { describe, it, expect } from 'vitest';
import { getKlipitExtensionPath, normalizeKlipitHealth } from '../electron/lib/klipit.cjs';
import path from 'path';
import pkg from '../package.json';

const RESOURCES = '/Applications/Perci.app/Contents/Resources';

describe('klipit.cjs', () => {
    describe('getKlipitExtensionPath', () => {
        it('keeps the extension in asarUnpack so it exists as real files on disk', () => {
            // session.loadExtension cannot read through asar, so the packaged
            // path below is only correct while this rule is in place.
            expect(pkg.build.asarUnpack).toContain('electron/extensions/**/*');
            expect(pkg.build.files).toContain('electron/**/*');
        });

        it('resolves the packaged path to the unpacked copy', () => {
            const expected = path.join(RESOURCES, 'app.asar.unpacked', 'electron', 'extensions', 'klipit');
            expect(getKlipitExtensionPath(RESOURCES, true)).toBe(expected);
        });

        it('does not resolve to Resources/electron, which no packaged build contains', () => {
            // The original bug: `files` packs electron/** into app.asar, so
            // nothing is ever written to Resources/electron directly.
            const naive = path.join(RESOURCES, 'electron', 'extensions', 'klipit');
            expect(getKlipitExtensionPath(RESOURCES, true)).not.toBe(naive);
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
