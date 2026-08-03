#!/usr/bin/env node
/**
 * build-og-image — render the social preview card
 *
 * Shoots site/og/og-template.html in headless Chrome at exactly 1200×630
 * (the Open Graph standard, and what X, Slack, Discord, LinkedIn and
 * Facebook all crop from) and writes site/assets/perci-og.png.
 *
 * Re-run after editing the template or the brand tokens in site/style.css.
 *
 * Usage:
 *   node scripts/build-og-image.mjs
 *   node scripts/build-og-image.mjs --out site/assets/perci-og.png
 */

import { existsSync, statSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

const TEMPLATE = resolve(__dirname, 'og/og-template.html');
const WIDTH = 1200;
const HEIGHT = 630;

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
];

function findChrome() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const found = CHROME_CANDIDATES.find((p) => existsSync(p));
  if (!found) {
    console.error(
      'No Chrome-family browser found. Set CHROME_PATH to a Chrome/Chromium binary.'
    );
    process.exit(1);
  }
  return found;
}

const outArg = process.argv.indexOf('--out');
const OUT = resolve(
  REPO_ROOT,
  outArg !== -1 && process.argv[outArg + 1]
    ? process.argv[outArg + 1]
    : 'site/assets/perci-og.png'
);

if (!existsSync(TEMPLATE)) {
  console.error(`Template missing: ${TEMPLATE}`);
  process.exit(1);
}

const chrome = findChrome();

execFileSync(
  chrome,
  [
    '--headless',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    '--force-color-profile=srgb',
    '--allow-file-access-from-files',
    '--virtual-time-budget=4000',
    `--window-size=${WIDTH},${HEIGHT}`,
    `--screenshot=${OUT}`,
    pathToFileURL(TEMPLATE).href,
  ],
  { stdio: ['ignore', 'ignore', 'pipe'] }
);

if (!existsSync(OUT)) {
  console.error('Chrome exited without writing a screenshot.');
  process.exit(1);
}

const kb = (statSync(OUT).size / 1024).toFixed(1);
console.log(`✓ ${OUT.replace(`${REPO_ROOT}/`, '')} — ${WIDTH}×${HEIGHT}, ${kb} KB`);
