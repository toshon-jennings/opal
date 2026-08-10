const fs = require('node:fs');
const path = require('node:path');

// node-pty publishes prebuilds/*/spawn-helper as mode 0644 — verified in the
// registry tarball for 1.1.0 — and none of its install scripts chmod them. Both
// a freshly installed dev tree and a packaged app therefore need the bit
// restored, or PTY creation dies with `posix_spawnp failed`.
function chmodNodePtyHelpers(nodePtyRoot) {
  const helpers = [
    path.join(nodePtyRoot, 'build', 'Release', 'spawn-helper'),
    path.join(nodePtyRoot, 'prebuilds', 'darwin-arm64', 'spawn-helper'),
    path.join(nodePtyRoot, 'prebuilds', 'darwin-x64', 'spawn-helper'),
  ].filter(fs.existsSync);

  for (const helper of helpers) fs.chmodSync(helper, 0o755);
  return helpers;
}

function restoreNodePtyHelperModes(appOutDir, productFilename) {
  const nodePtyRoot = path.join(
    appOutDir,
    `${productFilename}.app`,
    'Contents',
    'Resources',
    'app.asar.unpacked',
    'node_modules',
    'node-pty',
  );
  const helpers = chmodNodePtyHelpers(nodePtyRoot);

  if (helpers.length === 0) {
    throw new Error('Packaged node-pty has no macOS spawn-helper');
  }
  return helpers;
}

async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  restoreNodePtyHelperModes(
    context.appOutDir,
    context.packager.appInfo.productFilename,
  );
}

module.exports = afterPack;
module.exports.restoreNodePtyHelperModes = restoreNodePtyHelperModes;
module.exports.chmodNodePtyHelpers = chmodNodePtyHelpers;
