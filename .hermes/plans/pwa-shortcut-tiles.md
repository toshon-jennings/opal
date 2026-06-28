# PWA Shortcut Tiles — Implementation Plan

## Goal
Allow users to register a URL as a "PWA shortcut" in Perci. A tile
automatically appears in the SYSTEM & EXTERNAL section of the Dashboard,
using the site's favicon as the logo. Clicking the tile opens the URL in
a partitioned webview window. A "Remove" button appears on tile hover to
uninstall.

## Decisions (confirmed)
- **Favicon storage:** Data URI stored in the PWA registry (persisted via persistentStore).
- **Tile presentation:** White box (`LOGO_WHITE_BOX_IDS`).
- **Webview partition:** Per-PWA, keyed by origin — `persist:pwa-<host>`.
- **Scope:** Web app shortcut (webview loading a URL), not full PWA installation.
- **Uninstall:** Remove button appears on tile hover.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│  Dashboard (DashboardMode.jsx)                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │  SYSTEM & EXTERNAL section                        │  │
│  │  [static tiles...] [pwa_twitter] [pwa_gmail] ...  │  │
│  │                                  [+] Add PWA       │  │
│  └───────────────────────────────────────────────────┘  │
│                         │ click tile                     │
│                         ▼                                │
│  openWindow('pwa_twitter.com')                           │
│                         │                                │
│                         ▼                                │
│  App.jsx window router → PwaShortcutWindow               │
│                         │                                │
│                         ▼                                │
│  <webview partition="persist:pwa-twitter.com"            │
│           src="https://twitter.com" />                   │
└─────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────┐
│  Add PWA Modal (AddPwaModal.jsx)                        │
│  ┌───────────────────────────────────────────────────┐  │
│  │  URL: [https://twitter.com        ] [Preview]     │  │
│  │                                                   │  │
│  │  Preview:                                          │  │
│  │  ┌─────┐                                          │  │
│  │  │ 🐦  │  Twitter                                 │  │
│  │  └─────┘  twitter.com                             │  │
│  │                                                   │  │
│  │                           [Cancel]  [Add to Perci] │  │
│  └───────────────────────────────────────────────────┘  │
│                         │ submit                        │
│                         ▼                                │
│  IPC: pwa:extract-favicon → main process                │
│       → fetch page, get favicon, return data URI        │
│       → writeJsonStorage('perci_pwa_registry', [...])   │
└─────────────────────────────────────────────────────────┘
```

## Files to Create / Modify

### 1. NEW: `electron/pwa-favicon.cjs` (or inline in main.cjs)

Extract favicon from a URL. Runs in the main process to avoid CORS.

**Logic:**
```
1. Create a hidden BrowserWindow (or use a throwaway webContents)
2. Load the URL
3. Listen for 'page-favicon-uploaded' event (Electron native)
4. Fall back to fetching https://<origin>/favicon.ico directly
5. Convert NativeImage → toDataURL() → return data URI
6. Also capture page title from 'page-title-updated'
```

**IPC handlers to add in `electron/main.cjs`:**
- `pwa:extract-favicon` → `{ url }` → returns `{ faviconDataUri, title, origin }`
- Timeout after 15s, return error if unreachable.

**Why main process:** Renderer can't reliably fetch arbitrary URLs due to CORS.
Electron's `webContents` can load any URL and natively emits favicon events.

### 2. NEW: `src/components/AddPwaModal.jsx`

A modal for adding a new PWA shortcut.

**Props:**
- `isOpen` / `onClose` / `onAdd(pwaEntry)`

**State:**
- `url` (input value)
- `preview` (null | { title, favicon, origin, url })
- `loading` / `error`

**Flow:**
1. User types URL, clicks "Preview"
2. Call `window.electron.extractFavicon(url)` via IPC
3. Show preview card with favicon + title + origin
4. User clicks "Add to Perci" → call `onAdd(entry)` → close

**Shape of entry:**
```js
{
  id: 'pwa_twitter.com',       // derived from origin
  url: 'https://twitter.com',
  origin: 'twitter.com',
  title: 'Twitter',
  favicon: 'data:image/png;base64,...',
  hue: '#1da1f2',              // optional: extracted or default
  addedAt: '2026-06-28T...',
}
```

### 3. NEW: `src/components/PwaShortcutWindow.jsx`

The window component that renders when a PWA tile is clicked.

**Props:** Standard window props from ModeContext (id, url via registry lookup).

**Render:**
```jsx
<webview
  src={pwa.url}
  partition={`persist:pwa-${pwa.origin}`}
  className="absolute inset-0 h-full w-full border-0"
  allowpopups="true"
/>
```

**Reuse patterns from `LocalhostMode.jsx`** — specifically the webview
wrapper, error handling, and loading states. But simpler: no URL bar,
no sidebar, just the webview filling the window frame.

### 4. MODIFY: `src/lib/persistentStore.js`

Add to `PERSISTED_KEYS`:
```js
'perci_pwa_registry',
```

This ensures the PWA registry hydrates from appData on startup.

### 5. MODIFY: `src/lib/pwaRegistry.js` (new helper)

A small module wrapping registry CRUD:

```js
// src/lib/pwaRegistry.js
import { readJsonStorage, writeJsonStorage } from './persistentStore';

const REGISTRY_KEY = 'perci_pwa_registry';

export function getPwaRegistry() {
  return readJsonStorage(REGISTRY_KEY, []);
}

export function addPwa(entry) {
  const list = getPwaRegistry();
  if (list.some(p => p.id === entry.id)) return list; // dedupe
  const next = [...list, entry];
  writeJsonStorage(REGISTRY_KEY, next);
  return next;
}

export function removePwa(id) {
  const next = getPwaRegistry().filter(p => p.id !== id);
  writeJsonStorage(REGISTRY_KEY, next);
  return next;
}

export function pwaToTile(pwa) {
  return {
    id: pwa.id,
    logo: pwa.favicon,
    title: pwa.title,
    desc: pwa.origin,
    hue: pwa.hue || '#6b7280',
    isPwa: true, // flag for hover Remove button
  };
}
```

### 6. MODIFY: `src/lib/appCatalog.js`

Add PWA tiles to the `SYSTEM_TILES` array dynamically at import time
won't work (they're dynamic). Instead:

- Import `getPwaRegistry, pwaToTile` from `pwaRegistry`
- Create a function `getSystemTiles()` that merges static + PWA tiles
- Export `getSystemTiles` alongside the static arrays

Actually — simpler approach: DashboardMode already reads `SYSTEM_TILES`.
We just need to **append** PWA tiles at render time in DashboardMode.
No need to modify appCatalog's static array.

**Changes to appCatalog.js:**
- Add a new export: `PWA_TILE_IDS = new Set()` (populated at runtime)
- Or just check `id.startsWith('pwa_')` in DashboardMode

**Changes to LOGO_WHITE_BOX_IDS:**
- PWA tiles need to be in this set. Since IDs are dynamic, we can't
  statically add them. Instead, modify the render logic in
  DashboardMode.jsx to treat any tile with `isPwa: true` as white-box.

### 7. MODIFY: `src/components/DashboardMode.jsx`

**Key changes:**

a) Import `getPwaRegistry, removePwa` from pwaRegistry
b) Add state: `const [pwaTiles, setPwaTiles] = useState(getPwaRegistry().map(pwaToTile))`
c) Subscribe to a custom event `pwa:changed` so AddPwaModal can trigger refresh
d) Merge `pwaTiles` into the system section render
e) Add "Add PWA" button at the end of the system tiles grid
f) On tile hover, show a Remove "×" button for tiles where `isPwa === true`
g) Remove handler: `removePwa(id)` → refresh state → also close open window if any

**Render modification (around line 524):**
```jsx
{[...orderedSystemTiles, ...pwaTiles].map((tile, i) => {
  // existing render logic, plus:
  // if tile.isPwa → white-box treatment + Remove button on hover
})}
```

**Remove button (appears on hover, top-right of tile):**
```jsx
{tile.isPwa && (
  <button
    className="dash-tile-remove"
    onClick={(e) => { e.stopPropagation(); handleRemovePwa(tile.id); }}
    aria-label={`Remove ${tile.title}`}
  >
    ×
  </button>
)}
```

### 8. MODIFY: `src/App.jsx` (window router)

Add a route in the window rendering switch:

```jsx
// In the component that maps window.id → React component
if (id.startsWith('pwa_')) {
  return <PwaShortcutWindow key={id} win={win} pwaId={id} />;
}
```

The PwaShortcutWindow looks up the PWA entry from the registry by id
to get the URL.

### 9. MODIFY: `electron/preload.cjs`

Expose the new IPC:

```js
extractFavicon: (url) => ipcRenderer.invoke('pwa:extract-favicon', { url }),
```

### 10. MODIFY: `src/components/DashboardMode.css`

Add styles for:
- `.dash-tile-remove` — absolute top-right, hidden by default, shown on `.dash-tile-system:hover`
- `.dash-tile-remove:hover` — red background
- `.dash-add-pwa` — dashed-border "+" tile at end of system section

## Implementation Order

1. **persistentStore.js** — add `perci_pwa_registry` to PERSISTED_KEYS (1 line)
2. **pwaRegistry.js** — new module with CRUD + pwaToTile (30 lines)
3. **electron/main.cjs** — favicon extraction IPC handler (60 lines)
4. **electron/preload.cjs** — expose `extractFavicon` (1 line)
5. **PwaShortcutWindow.jsx** — webview window component (80 lines)
6. **App.jsx** — route pwa_* ids to PwaShortcutWindow (5 lines)
7. **AddPwaModal.jsx** — add-URL modal (120 lines)
8. **DashboardMode.jsx** — merge PWA tiles, render, remove button, add button (60 lines)
9. **DashboardMode.css** — remove button + add tile styles (20 lines)

## Edge Cases & Validation

- **Duplicate origin:** If user adds the same URL twice, dedupe by origin (show toast "Already added")
- **Invalid URL:** Validate with `new URL()` before IPC call; show inline error
- **No favicon found:** Use a default globe icon as fallback (still add the tile)
- **Favicon too large:** Cap data URI at ~50KB; if favicon is absurdly large, downscale or use fallback
- **HTTP vs HTTPS:** Normalize — if user types `twitter.com`, prepend `https://`
- **Window already open:** If user clicks a PWA tile while that PWA window is already open, just focus it (existing openWindow behavior handles this)
- **Remove while open:** If user removes a PWA tile while its window is open, close the window too

## Verification Checklist

- [ ] Add PWA via modal → tile appears in SYSTEM section with favicon
- [ ] Tile uses white-box presentation (visible on both light/dark)
- [ ] Click tile → opens webview window loading the URL
- [ ] Webview uses `persist:pwa-<origin>` partition
- [ ] Reload app → PWA tiles persist (hydrated from appData)
- [ ] Hover tile → Remove button appears
- [ ] Click Remove → tile disappears, window closes if open
- [ ] Duplicate URL → rejected gracefully
- [ ] Invalid URL → error message, no crash
- [ ] No favicon → tile still created with fallback icon
- [ ] Sir Perci launcher also shows PWA tiles (inherits from same catalog merge)
