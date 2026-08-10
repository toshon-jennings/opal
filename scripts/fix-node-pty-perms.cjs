// Runs as postinstall. node-pty ships its macOS spawn-helper non-executable, so
// every fresh `npm install` / `npm ci` leaves a dev tree where opening a
// terminal fails with `posix_spawnp failed`. Packaged builds already get this
// from the electron-builder afterPack hook; this covers the dev tree.
//
// Approving node-pty's install scripts does NOT fix this: prebuild.js only
// checks that the prebuild directory exists, and post-install.js only touches
// build/Release, which is empty when prebuilds are used.
const path = require('node:path');
const { chmodNodePtyHelpers } = require('./after-pack.cjs');

if (process.platform !== 'darwin') process.exit(0);

try {
  const fixed = chmodNodePtyHelpers(path.join(__dirname, '..', 'node_modules', 'node-pty'));
  if (fixed.length > 0) {
    console.log(`[perci] made ${fixed.length} node-pty spawn-helper(s) executable`);
  }
} catch (err) {
  // Never fail an install over this — the app still starts, only terminals break.
  console.warn(`[perci] could not fix node-pty permissions: ${err.message}`);
}
