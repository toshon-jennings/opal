#!/usr/bin/env node
/**
 * config-map — Perci config topology lens
 *
 * Maps every configuration surface (persisted storage keys, API key slots,
 * env vars, IPC channels) into a single topology. Orphans, single-key
 * drilldowns, and Graphify-compatible export.
 *
 * Usage:
 *   node scripts/config-map.mjs
 *   node scripts/config-map.mjs --orphans
 *   node scripts/config-map.mjs --graph --out graphify-out/config-topology.json
 *   node scripts/config-map.mjs --key theme
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const DEFAULT_GRAPH_OUT = resolve(REPO_ROOT, 'graphify-out/config-topology.json');
const SNAPSHOT_PATH = resolve(
  process.env.HOME || '~',
  '.config/config-map-snapshot.json',
);

// ── Arg parsing ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const get = (flag) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : null;
};

const FLAG_ORPHANS = has('--orphans');
const FLAG_GRAPH = has('--graph');
const FLAG_DIFF = has('--diff');
const OUT_PATH = get('--out');
const FAMILY = get('--family');
const KEY = get('--key');
const CONFIG_PATH = get('--config');

// ── Persistent key manifest ───────────────────────────────────────────────
function loadPersistentKeys() {
  const storePath = CONFIG_PATH || resolve(REPO_ROOT, 'src/lib/persistentStore.js');
  if (!existsSync(storePath)) {
    console.error(`Cannot find persistentStore at ${storePath}`);
    process.exit(1);
  }

  const src = readFileSync(storePath, 'utf8');
  const persisted = extractArray(src, 'PERSISTED_KEYS');
  const apiKeys = extractArray(src, 'API_KEY_STORAGE_KEYS');

  return { persisted, apiKeys };
}

function extractArray(src, name) {
  const start = src.indexOf(`${name} = [`);
  if (start === -1) return [];
  const bracketStart = src.indexOf('[', start);
  let depth = 0;
  let end = bracketStart;
  for (let i = bracketStart; i < src.length; i++) {
    if (src[i] === '[') depth++;
    if (src[i] === ']') depth--;
    if (depth === 0) { end = i + 1; break; }
  }
  const arrSrc = src.slice(bracketStart, end);
  const items = [...arrSrc.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  return items;
}

// ── Readers/writers scan ──────────────────────────────────────────────────
function findReferences(key) {
  const readers = new Set();
  const writers = new Set();

  try {
    const grepOut = execSync(
      `grep -rn "${key}" ${REPO_ROOT}/src/ --include="*.js" --include="*.jsx" --include="*.ts" --include="*.tsx" 2>/dev/null || true`,
      { encoding: 'utf8', timeout: 10000 },
    );
    for (const line of grepOut.split('\n').filter(Boolean)) {
      const [file, ...rest] = line.split(':');
      const context = rest.join(':');
      if (/readStringStorage|readJsonStorage|localStorage\.getItem|memoryStore\[/.test(context)) {
        readers.add(file.replace(REPO_ROOT + '/', ''));
      }
      if (/writeStringStorage|writeJsonStorage|localStorage\.setItem|memoryStore\[.+\]\s*=/.test(context)) {
        writers.add(file.replace(REPO_ROOT + '/', ''));
      }
    }
  } catch {
    // grep not available or timed out
  }

  return { readers: [...readers], writers: [...writers] };
}

// ── Env vars ──────────────────────────────────────────────────────────────
function scanEnvVars() {
  const found = new Set();
  try {
    const out = execSync(
      `grep -rn "process\\\\.env\\\\." ${REPO_ROOT}/src/ ${REPO_ROOT}/electron/ ${REPO_ROOT}/scripts/ --include="*.js" --include="*.jsx" --include="*.cjs" --include="*.mjs" 2>/dev/null || true`,
      { encoding: 'utf8', timeout: 10000 },
    );
    for (const line of out.split('\n').filter(Boolean)) {
      const m = line.match(/process\.env\.(\w+)/);
      if (m) found.add(m[1]);
    }
  } catch {
    // ignore
  }
  return [...found];
}

// ── IPC channels ─────────────────────────────────────────────────────────
function scanIpcChannels() {
  const channels = new Set();
  try {
    const out = execSync(
      `grep -rn "ipcRenderer\\\.invoke\\\|ipcRenderer\\\.send\\\|ipcMain\\\.handle\\\|ipcMain\\\.on" ${REPO_ROOT}/src/ ${REPO_ROOT}/electron/ --include="*.js" --include="*.jsx" --include="*.cjs" --include="*.mjs" 2>/dev/null || true`,
      { encoding: 'utf8', timeout: 10000 },
    );
    for (const line of out.split('\n').filter(Boolean)) {
      const m = line.match(/(?:invoke|send|handle|on)\(['"]([^'"]+)['"]/);
      if (m && m[1]) channels.add(m[1]);
    }
  } catch {
    // ignore
  }
  return [...channels];
}

// ── Diff ──────────────────────────────────────────────────────────────────
function diffWithSnapshot(currentKeys) {
  if (!existsSync(SNAPSHOT_PATH)) {
    console.log('No previous snapshot found. Run without --diff to establish baseline.');
    console.log(`  (snapshot would be saved to ${SNAPSHOT_PATH})`);
    return null;
  }
  const prev = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
  const prevSet = new Set(prev);
  const currSet = new Set(currentKeys);

  const added = currentKeys.filter((k) => !prevSet.has(k));
  const removed = [...prevSet].filter((k) => !currSet.has(k));

  console.log('\n── Config diff ──────────────────────────────────────');
  if (added.length) {
    console.log('\nAdded:');
    added.forEach((k) => console.log(`  + ${k}`));
  }
  if (removed.length) {
    console.log('\nRemoved:');
    removed.forEach((k) => console.log(`  - ${k}`));
  }
  if (!added.length && !removed.length) {
    console.log('\nNo changes since last snapshot.');
  }
  console.log('');
  return { added, removed };
}

// ── Snapshot saving ──────────────────────────────────────────────────────
function saveSnapshot(keys) {
  const dir = dirname(SNAPSHOT_PATH);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(SNAPSHOT_PATH, JSON.stringify(keys, null, 2) + '\n');
}

// ── Graphify export ──────────────────────────────────────────────────────
function exportGraph(persisted, apiKeys, envVars, ipcChannels) {
  const nodes = [];
  const edges = [];

  // Storage layer node
  nodes.push({
    id: 'storage:persistentStore',
    type: 'storage',
    label: 'persistentStore',
    description: 'Electron appData / localStorage bridge via persistentStore.js',
  });

  nodes.push({
    id: 'storage:env',
    type: 'storage',
    label: 'process.env',
    description: 'Node.js environment variables (main process)',
  });

  nodes.push({
    id: 'storage:ipc',
    type: 'storage',
    label: 'IPC bridge',
    description: 'Electron IPC channels between main and renderer',
  });

  // Key nodes
  for (const key of persisted) {
    nodes.push({
      id: `key:${key}`,
      type: 'config-key',
      label: key,
      family: 'persisted',
      storage: 'persistentStore',
    });
    edges.push({ from: 'storage:persistentStore', to: `key:${key}`, relation: 'persists' });
  }

  for (const key of apiKeys) {
    nodes.push({
      id: `key:${key}`,
      type: 'config-key',
      label: key,
      family: 'api-keys',
      storage: 'persistentStore',
      sensitive: true,
    });
    edges.push({ from: 'storage:persistentStore', to: `key:${key}`, relation: 'persists' });
  }

  for (const env of envVars) {
    nodes.push({
      id: `env:${env}`,
      type: 'env-var',
      label: env,
      family: 'env',
      storage: 'process.env',
    });
    edges.push({ from: 'storage:env', to: `env:${env}`, relation: 'provides' });
  }

  for (const ch of ipcChannels) {
    nodes.push({
      id: `ipc:${ch}`,
      type: 'ipc-channel',
      label: ch,
      family: 'ipc',
      storage: 'ipc-bridge',
    });
    edges.push({ from: 'storage:ipc', to: `ipc:${ch}`, relation: 'routes' });
  }

  return {
    meta: {
      tool: 'config-map',
      generatedAt: new Date().toISOString(),
      repo: 'perci',
      nodeCount: nodes.length,
      edgeCount: edges.length,
    },
    nodes,
    edges,
  };
}

// ── Plain text output ────────────────────────────────────────────────────
function printTable(family, entries, withRefs = false) {
  console.log(`\n── ${family} ──────────────────────────────────────`);
  console.log(`  ${entries.length} key${entries.length === 1 ? '' : 's'}\n`);

  for (const key of entries) {
    if (withRefs && !KEY) {
      const { readers, writers } = findReferences(key);
      console.log(`  ${key}`);
      if (readers.length) console.log(`    read:   ${readers.slice(0, 3).join(', ')}${readers.length > 3 ? ' …' : ''}`);
      if (writers.length) console.log(`    write:  ${writers.slice(0, 3).join(', ')}${writers.length > 3 ? ' …' : ''}`);
      if (!readers.length && !writers.length) console.log(`    ⚠ orphaned — no active reader/writer`);
    } else {
      console.log(`  ${key}`);
    }
  }
}

// ── Main ─────────────────────────────────────────────────────────────────
function main() {
  const { persisted, apiKeys } = loadPersistentKeys();

  // Single-key drilldown
  if (KEY) {
    console.log(`\n── config-map: ${KEY} ──────────────────────────────`);
    const { readers, writers } = findReferences(KEY);
    console.log(`\n  Storage: persistentStore`);
    console.log(`  Readers (${readers.length}):`);
    readers.forEach((r) => console.log(`    ← ${r}`));
    console.log(`  Writers (${writers.length}):`);
    writers.forEach((w) => console.log(`    → ${w}`));
    if (!readers.length && !writers.length) {
      console.log('\n  ⚠ No references found — key may be orphaned or only referenced dynamically.');
    }
    console.log('');
    return;
  }

  // Diff mode
  if (FLAG_DIFF) {
    const allKeys = [...persisted, ...apiKeys];
    diffWithSnapshot(allKeys);
    return;
  }

  const envVars = scanEnvVars();
  const ipcChannels = scanIpcChannels();

  // Graph export
  if (FLAG_GRAPH) {
    const graph = exportGraph(persisted, apiKeys, envVars, ipcChannels);
    const outPath = OUT_PATH || DEFAULT_GRAPH_OUT;
    const outDir = dirname(outPath);
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }
    writeFileSync(outPath, JSON.stringify(graph, null, 2) + '\n');
    console.log(`Config topology exported to ${outPath}`);
    console.log(`  ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
    return;
  }

  // Orphans mode
  if (FLAG_ORPHANS) {
    console.log('\n── config-map: orphaned keys ──────────────────────');
    const orphans = [];
    for (const key of [...persisted, ...apiKeys]) {
      const { readers, writers } = findReferences(key);
      if (!readers.length && !writers.length) orphans.push(key);
    }
    if (orphans.length === 0) {
      console.log('\n  No orphaned keys found.');
    } else {
      console.log(`\n  ${orphans.length} orphaned key${orphans.length === 1 ? '' : 's'}:\n`);
      orphans.forEach((k) => console.log(`  ⚠ ${k}`));
    }
    console.log('');
    return;
  }

  // Family filter
  if (FAMILY) {
    switch (FAMILY) {
      case 'persisted':
        printTable('Persisted keys', persisted, true);
        break;
      case 'api-keys':
        printTable('API key slots', apiKeys);
        break;
      case 'env':
        printTable('Environment variables', envVars);
        break;
      case 'ipc':
        printTable('IPC channels', ipcChannels);
        break;
      case 'windows':
        printTable('Window state keys', persisted.filter((k) => /window|bounds|open/.test(k)));
        break;
      default:
        console.error(`Unknown family: ${FAMILY}. Use: persisted, api-keys, env, ipc, windows`);
        process.exit(1);
    }
    console.log('');
    return;
  }

  // Default: full topology
  console.log('\n══════════════════════════════════════════════════════');
  console.log('  config-map — Perci config topology');
  console.log('══════════════════════════════════════════════════════');

  printTable('Persisted keys', persisted);
  printTable('API key slots', apiKeys);
  printTable('Environment variables', envVars);
  printTable('IPC channels', ipcChannels);

  console.log('──────────────────────────────────────────────────────');
  console.log(`  Total: ${persisted.length + apiKeys.length} storage keys, ${envVars.length} env vars, ${ipcChannels.length} IPC channels`);
  console.log('──────────────────────────────────────────────────────');
  console.log('\n  Tips:');
  console.log('    config-map --orphans     find keys with no readers');
  console.log('    config-map --key <name>  drill into a single key');
  console.log('    config-map --graph       export for graphify');
  console.log('    config-map --diff        compare vs last snapshot');
  console.log('');

  // Save snapshot for future --diff
  saveSnapshot([...persisted, ...apiKeys]);
}

main();
