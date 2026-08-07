const fs = require('node:fs');
const path = require('node:path');

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
  const helpers = [
    path.join(nodePtyRoot, 'build', 'Release', 'spawn-helper'),
    path.join(nodePtyRoot, 'prebuilds', 'darwin-arm64', 'spawn-helper'),
    path.join(nodePtyRoot, 'prebuilds', 'darwin-x64', 'spawn-helper'),
  ].filter(fs.existsSync);

  if (helpers.length === 0) {
    throw new Error('Packaged node-pty has no macOS spawn-helper');
  }
  for (const helper of helpers) fs.chmodSync(helper, 0o755);
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
