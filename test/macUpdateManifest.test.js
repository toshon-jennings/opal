import { describe, expect, it } from 'vitest';
import { mergeMacUpdateManifests } from '../scripts/merge-mac-update-manifests.mjs';

function manifest(arch, overrides = {}) {
  return {
    version: '1.2.3',
    files: [
      { url: `Perci-1.2.3-${arch}-mac.zip`, sha512: `${arch}-zip`, size: 10 },
      { url: `Perci-1.2.3-${arch}.dmg`, sha512: `${arch}-dmg`, size: 20 },
    ],
    path: `Perci-1.2.3-${arch}-mac.zip`,
    sha512: `${arch}-zip`,
    releaseDate: arch === 'arm64' ? '2026-08-07T12:00:00.000Z' : '2026-08-07T12:01:00.000Z',
    ...overrides,
  };
}

describe('mergeMacUpdateManifests', () => {
  it('keeps both architectures while retaining ARM64 as the compatibility fallback', () => {
    const merged = mergeMacUpdateManifests({
      arm64: manifest('arm64'),
      x64: manifest('x64'),
    });

    expect(merged.files.map((file) => file.url)).toEqual([
      'Perci-1.2.3-arm64-mac.zip',
      'Perci-1.2.3-arm64.dmg',
      'Perci-1.2.3-x64-mac.zip',
      'Perci-1.2.3-x64.dmg',
    ]);
    expect(merged.path).toBe('Perci-1.2.3-arm64-mac.zip');
    expect(merged.sha512).toBe('arm64-zip');
    expect(merged.releaseDate).toBe('2026-08-07T12:01:00.000Z');
  });

  it('rejects architecture files with mismatched versions', () => {
    expect(() => mergeMacUpdateManifests({
      arm64: manifest('arm64'),
      x64: manifest('x64', { version: '1.2.4' }),
    })).toThrow('versions do not match');
  });

  it('rejects a manifest missing its architecture-specific ZIP', () => {
    expect(() => mergeMacUpdateManifests({
      arm64: manifest('arm64'),
      x64: manifest('x64', { files: [{ url: 'Perci-1.2.3-x64.dmg' }] }),
    })).toThrow('no x64 .zip file');
  });
});
