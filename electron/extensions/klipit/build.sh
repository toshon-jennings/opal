#!/usr/bin/env bash
# Build Klippit into two loadable artifacts from the single codebase:
#   dist/chrome   — Manifest V3 with side_panel + chrome.sidePanel
#   dist/firefox  — Manifest V3 with sidebar_action + background.scripts
#
# Also packages each into a store-ready .zip (manifest at the zip root).
#
# Usage: ./build.sh           # build + zip
#        ./build.sh --no-zip  # build only
set -euo pipefail
cd "$(dirname "$0")"

VERSION=$(grep -m1 '"version"' manifest.json | sed -E 's/.*"version" *: *"([^"]+)".*/\1/')

rm -rf dist
mkdir -p dist/chrome dist/firefox

for target in chrome firefox; do
  cp -R src vendor icons "dist/$target/"
  # preview.html is a dev-only harness (mocks chrome.*); not part of the shipped extension.
  rm -f "dist/$target/src/preview.html"
done

cp manifest.json          dist/chrome/manifest.json
cp manifest.firefox.json  dist/firefox/manifest.json

echo "Built v$VERSION:"
echo "  dist/chrome   -> load via chrome://extensions (Load unpacked)"
echo "  dist/firefox  -> load via about:debugging (Load Temporary Add-on -> manifest.json)"

if [ "${1:-}" != "--no-zip" ]; then
  command -v zip >/dev/null || { echo "zip not found; skipping packaging." >&2; exit 0; }
  for target in chrome firefox; do
    out="$PWD/dist/klippit-$target-v$VERSION.zip"
    rm -f "$out"
    # Zip from *inside* the dir so manifest.json sits at the archive root
    # (required by the Chrome Web Store and AMO). Exclude macOS cruft.
    ( cd "dist/$target" && zip -rqX "$out" . -x '*.DS_Store' )
    echo "  packaged $(basename "$out")  ($(du -h "$out" | cut -f1))"
  done
fi
