#!/bin/bash
# Grab the image currently on the macOS clipboard, resize to 2000px wide,
# and write it as a WebP into the site's screenshot folder.
# Usage: grab-clip.sh <basename>     e.g. grab-clip.sh perci-desktop
set -euo pipefail

NAME="${1:?usage: grab-clip.sh <basename>}"
DIR=/Users/toshonjennings/opal/site/assets/screenshots
TMP=$(mktemp -t clipgrab).png

osascript >/dev/null 2>&1 <<OSA
set f to (open for access POSIX file "$TMP" with write permission)
set eof f to 0
write (the clipboard as «class PNGf») to f
close access f
OSA

if [ ! -s "$TMP" ]; then echo "ERROR: clipboard holds no PNG image"; exit 1; fi

SRC_DIMS=$(sips -g pixelWidth -g pixelHeight "$TMP" 2>/dev/null | awk '/pixel/{printf "%s ", $2}')
cwebp -q 88 -resize 2000 0 "$TMP" -o "$DIR/$NAME.webp" >/dev/null 2>&1
OUT_DIMS=$(sips -g pixelWidth -g pixelHeight "$DIR/$NAME.webp" 2>/dev/null | awk '/pixel/{printf "%s ", $2}')

rm -f "$TMP"
echo "wrote $NAME.webp  source=[$SRC_DIMS] output=[$OUT_DIMS] size=$(du -h "$DIR/$NAME.webp" | cut -f1)"
