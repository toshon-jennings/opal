import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import afterPack from '../scripts/after-pack.cjs';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe('afterPack', () => {
  it('makes packaged node-pty helpers executable before macOS signing', async () => {
    const appOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'perci-after-pack-'));
    temporaryDirectories.push(appOutDir);
    const nodePtyRoot = path.join(
      appOutDir,
      'Perci.app',
      'Contents',
      'Resources',
      'app.asar.unpacked',
      'node_modules',
      'node-pty',
    );
    const helpers = [
      path.join(nodePtyRoot, 'build', 'Release', 'spawn-helper'),
      path.join(nodePtyRoot, 'prebuilds', 'darwin-x64', 'spawn-helper'),
    ];
    for (const helper of helpers) {
      fs.mkdirSync(path.dirname(helper), { recursive: true });
      fs.writeFileSync(helper, 'fixture', { mode: 0o644 });
    }

    await afterPack({
      electronPlatformName: 'darwin',
      appOutDir,
      packager: { appInfo: { productFilename: 'Perci' } },
    });

    for (const helper of helpers) {
      expect(fs.statSync(helper).mode & 0o777).toBe(0o755);
    }
  });

  it('does nothing for non-macOS packages', async () => {
    await expect(afterPack({ electronPlatformName: 'win32' })).resolves.toBeUndefined();
  });
});
