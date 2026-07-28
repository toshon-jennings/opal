# Klipit

A personal link-memory browser extension. Save links with one click, capture
*why* you saved them while it's still fresh, jot standalone notes, and connect
related items into clusters — all stored locally, no backend, no account.

<p align="center">
  <img src="assets/klippit-mark.svg" opacity="0.7" width="24" height="24">
</p>

## Why

**The problem this solves:** You find a link, mean to come back, and later have no
idea why it mattered. Or, you just leave it open and add weight to drag down your RAM. Klipit makes capture frictionless and attaches the
context at the moment you have it.

## Features

- **One-click link capture** — saves URL, title, favicon, and timestamp from the
  active tab. Also bound to `Cmd/Ctrl+Shift+S`, which works even when the panel
  is closed.
- **Inline context** — right after saving, a free-text field appears. Type why
  you saved it, or press Esc to skip. No forms.
- **Standalone notes** — first-class objects, not attached to any URL.
- **Tags as grouping** — add tags inline on any card (the "+ tag" pill), remove
  them with the pill's ×, and switch the **Groups** view to organize everything
  into sections by tag. Because items can hold multiple tags, the same item
  appears under every group it belongs to — clusters, not folders. Untagged
  items collect in a trailing group.
- **Connections + graph** — manually connect any two items (link↔link,
  link↔note, note↔note) with an optional reason, and explore the whole web in a
  force-directed **Graph** view that shows **every** saved item (connected ones
  cluster; unlinked ones float as hollow rings). Pan, zoom, drag, click to
  highlight a node's neighbours, double-click to open. Items that **share a tag** are linked with
  faint dashed edges (thicker the more tags they share, labelled on selection),
  so clusters form before you connect anything by hand — toggle these off with
  "tag links". Any card with connections has a graph button that **jumps to and
  centres that item** in the graph.
- **Capture a selection** — right-click selected text on any page →
  *Save selection to Klipit*. It becomes a note that remembers its source page
  (shown as a clickable "from …" line).
- **Tag manager** — rename, merge, or delete tags across everything at once
  (footer → **Tags**). The tag cloud also caps at the most-used few with a
  "+N more" toggle so it never takes over the panel.
- **Search / filter** across titles, URLs, notes, and tags.
- **Export / import** the whole store as JSON for backup or migration.

## Architecture

```
manifest.json            Chrome MV3 manifest (side_panel + chrome.sidePanel)
manifest.firefox.json    Firefox MV3 manifest (sidebar_action + background.scripts)
vendor/
  browser-polyfill.min.js  Mozilla WebExtensions polyfill — promise-based `browser.*`
  fonts/                   Self-hosted woff2 (Fraunces + Hanken Grotesk) — no remote calls
src/
  storage.js             StorageManager — the single source of truth (chrome.storage.local)
  background.js           Service worker: opens the panel, handles the save shortcut + selection capture
  graph.js                KlipitGraph — dependency-free force-directed canvas graph
  sidepanel.html/css/js   The UI
  fonts.css               @font-face declarations pointing at vendor/fonts
  preview.html            Dev-only harness: mocks chrome.* + seeds data for design iteration
icons/                   Generated PNG icons (16/32/48/128)
build.sh                 Produces dist/chrome and dist/firefox (excludes preview.html)
```

## Design

The aesthetic is an **editorial archive** — "your commonplace book." Warm paper
with a faint grain in light mode, deep warmth at night (`prefers-color-scheme`).
A characterful serif (**Fraunces**, variable, with its SOFT/WONK axes) sets the
brand and item titles; a refined humanist sans (**Hanken Grotesk**) carries the
UI. The palette is considered rather than default: **ink-teal** for links and
actions, **ochre** for notes — each shown as a colored "spine" down the card's
left edge. Fonts are bundled locally (no Google Fonts requests — fitting for a
privacy-respecting local tool), icons are inline SVG, and the list reveals with a
single staggered fade. Respects `prefers-reduced-motion`.

### Previewing the design without loading the extension

`src/preview.html` mocks the `chrome.*` APIs in memory, seeds sample data, and
loads the *real* `storage.js` + `sidepanel.js`, framed at the panel's true width.
Serve the folder and open it:

```bash
python3 -m http.server 8777
# then open http://localhost:8777/src/preview.html
```

No bundler. `storage.js` attaches `StorageManager` / `klippitStorage` to
`globalThis` so the **same file** is shared by both the side panel
(`<script src>`) and the service worker (`importScripts`) — no ESM, no build
step required.

### Data model (in `storage.js`)

- **Item** — a `link` or a `note`. They share one table so connections can cross
  types. Fields: `id, type, url, title, favicon, note, tags[], createdAt, updatedAt`.
- **Connection** — an undirected, deduplicated edge between two item ids, with an
  optional `label`. Deleting an item cascades to its connections.

Storage keys: `klippit:items`, `klippit:connections`, `klippit:schema`.

## Cross-browser notes

Single codebase, two build artifacts. Where Chrome and Firefox diverge:

| Concern        | Chrome (MV3)                          | Firefox (MV3)                              |
| -------------- | ------------------------------------- | ------------------------------------------ |
| Panel UI       | `side_panel` + `chrome.sidePanel`     | `sidebar_action` + `browser.sidebarAction` |
| Background     | classic service worker (`importScripts`) | event page via `background.scripts`     |
| Polyfill load  | `importScripts()` in the worker       | listed first in `background.scripts`       |
| ID / min ver   | n/a                                   | `browser_specific_settings.gecko`          |

`background.js` feature-detects (`browser.sidePanel` vs `browser.sidebarAction`)
rather than sniffing the user agent, and guards `importScripts` so the one file
runs in both contexts.

## Performance & limits

- **Storage** is `chrome.storage.local` (single-profile, ~5–10 MB depending on
  browser). Comfortable for thousands of links/notes; not meant for bulk archives
  of full page content.
- **Graph layout** uses a brute-force O(n²) force simulation (every node repels
  every other each frame). It's smooth for tens to low-hundreds of items, which
  covers the intended personal-archive scale. Past ~several hundred nodes it will
  start to feel heavy. If/when that matters, options in rough order of effort:
  spatial partitioning (Barnes–Hut) to make repulsion ~O(n log n); simulating
  only connected nodes while parking unlinked ones on a calm outer ring; or
  freezing the layout after it settles and only re-simulating on data change.
- **Tag edges** are already guarded against hairballs: tags on more than 10
  items don't generate edges, and at most 400 tag edges are drawn
  (`TAG_FANOUT_MAX` / `TAG_EDGE_MAX` in `sidepanel.js`).

## Build & load

```bash
./build.sh          # builds dist/chrome + dist/firefox and store-ready .zips
./build.sh --no-zip # build only
```

This also writes `dist/klippit-chrome-v<version>.zip` and
`dist/klippit-firefox-v<version>.zip` with `manifest.json` at the archive root —
ready to upload to the Chrome Web Store / AMO.

The logo lives in `assets/klippit-mark.svg` (master); `icons/icon-*.png` are
rasterized from it. To regenerate after editing the SVG:

```bash
python3 -c "import cairosvg; [cairosvg.svg2png(url='assets/klippit-mark.svg', write_to=f'icons/icon-{s}.png', output_width=s, output_height=s) for s in (16,32,48,128)]"
```

**Chrome:** go to `chrome://extensions`, enable Developer mode, **Load unpacked**,
select `dist/chrome`. Click the toolbar icon to open the side panel.

**Firefox:** go to `about:debugging#/runtime/this-firefox`, **Load Temporary
Add-on**, select `dist/firefox/manifest.json`. Open the sidebar from the toolbar
icon or the Sidebars menu.

During development you can also load the project root directly in Chrome (it uses
`manifest.json`); use `dist/firefox` for Firefox since the manifest differs.
