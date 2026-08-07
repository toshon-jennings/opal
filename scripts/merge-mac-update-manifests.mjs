import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ARCHES = ['arm64', 'x64'];

function validateManifest(manifest, arch) {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error(`${arch} update manifest must be a YAML object`);
  }
  if (typeof manifest.version !== 'string' || manifest.version.length === 0) {
    throw new Error(`${arch} update manifest is missing a version`);
  }
  if (!Array.isArray(manifest.files) || manifest.files.length === 0) {
    throw new Error(`${arch} update manifest has no files`);
  }

  for (const extension of ['.zip', '.dmg']) {
    const match = manifest.files.find((file) =>
      typeof file?.url === 'string'
      && file.url.includes(`-${arch}`)
      && file.url.endsWith(extension));
    if (!match) {
      throw new Error(`${arch} update manifest has no ${arch} ${extension} file`);
    }
  }
}

export function mergeMacUpdateManifests(manifests) {
  for (const arch of ARCHES) validateManifest(manifests[arch], arch);

  const [version] = new Set(ARCHES.map((arch) => manifests[arch].version));
  if (ARCHES.some((arch) => manifests[arch].version !== version)) {
    throw new Error('macOS update manifest versions do not match');
  }

  const files = ARCHES.flatMap((arch) => manifests[arch].files);
  const urls = files.map((file) => file.url);
  if (new Set(urls).size !== urls.length) {
    throw new Error('macOS update manifests contain duplicate file URLs');
  }

  const primary = manifests.arm64;
  const releaseDates = ARCHES
    .map((arch) => Date.parse(manifests[arch].releaseDate))
    .filter(Number.isFinite);

  return {
    ...primary,
    files,
    ...(releaseDates.length > 0
      ? { releaseDate: new Date(Math.max(...releaseDates)).toISOString() }
      : {}),
  };
}

function main([arm64Path, x64Path, outputPath]) {
  if (!arm64Path || !x64Path || !outputPath) {
    throw new Error('usage: merge-mac-update-manifests <arm64.yml> <x64.yml> <output.yml>');
  }

  const merged = mergeMacUpdateManifests({
    arm64: yaml.load(fs.readFileSync(arm64Path, 'utf8')),
    x64: yaml.load(fs.readFileSync(x64Path, 'utf8')),
  });
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, yaml.dump(merged, { lineWidth: -1, noRefs: true }));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
