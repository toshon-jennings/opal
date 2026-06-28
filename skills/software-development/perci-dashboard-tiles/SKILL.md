---
name: perci-dashboard-tiles
description: "Use when adding or modifying Perci Dashboard tiles in src/lib/appCatalog.js — background artwork, icon sizing, logo presentation, and tile metadata. Covers the SYSTEM_TILES and NATIVE_TILES definitions consumed by DashboardMode.jsx and SirPerciLauncher.jsx."
version: 1.0.0
author: Hermes Agent
license: MIT
metadata:
  hermes:
    tags: [perci, dashboard, tiles, artwork, icons, ui]
    related_skills: [desktop-app-development, material-3]
---

# Perci Dashboard Tiles

## Overview

The Perci Dashboard renders a grid of launchable tiles from a single source of
truth: `src/lib/appCatalog.js`. Two consumer components read this catalog:

- **DashboardMode.jsx** — the main dashboard grid (native tiles + system tiles)
- **SirPerciLauncher.jsx** — the dock/launcher

Each tile is defined by a shape with optional fields for artwork, background
images, icon sizing, and logo presentation. This skill documents how those
fields work together so you can add or modify tiles correctly.

## Tile Shape

```js
{
  id: 'unique-id',           // WINDOW_ID constant or MODES key
  icon: TerminalSquare,      // Lucide icon component (use null if `logo` is set)
  logo: myLogo,              // Static image import (SVG/PNG/JPEG). Use null if `icon` is set
  title: 'My App',           // Display name
  desc: 'Short description', // Subtitle text
  hue: '#10b981',            // Accent color for icon chip background + border
  artwork: true,             // OPTIONAL — enables the background image layer
  bgImage: myBgImage,        // OPTIONAL — static image import for artwork (requires artwork: true)
  iconSize: 34,              // OPTIONAL — size for icon-only tiles (no logo)
}
```

## Key Files

| File | Role |
|------|------|
| `src/lib/appCatalog.js` | Single source of truth — all tile definitions, image imports |
| `src/components/DashboardMode.jsx` | Dashboard grid renderer (lines ~524-575 for system tiles) |
| `src/components/DashboardMode.css` | Tile styles (`.dash-tile-system`, `.dash-tile-hero`, `.dash-tile-art`, `.dash-tile-icon`) |
| `src/components/SirPerciLauncher.jsx` | Dock/launcher — same catalog, different layout |

## Adding a Background Image (Artwork)

### 1. Copy the image to `src/assets/`

```bash
cp ~/Downloads/my-image.jpeg src/assets/my-tile-bg.jpeg
```

Use JPEG for photos (smaller file size), PNG for graphics with transparency,
or SVG for vector artwork.

### 2. Import it in `src/lib/appCatalog.js`

Add the import alongside the other `bgImage` imports (alphabetically):

```js
import myTileBg from '../assets/my-tile-bg.jpeg';
```

### 3. Add `artwork: true` and `bgImage` to the tile definition

```js
{
  id: MY_WINDOW_ID,
  icon: Server,
  title: 'My App',
  desc: 'Does useful things',
  hue: '#ef4444',
  artwork: true,
  bgImage: myTileBg,
}
```

### How it renders

When `artwork: true`, the tile gets the `dash-tile-hero` class and a
`<span class="dash-tile-art">` layer is created:

```jsx
{artwork && (
  <span
    className="dash-tile-art flex items-center justify-center overflow-hidden"
    aria-hidden="true"
    style={bgImage ? { backgroundImage: `url('${bgImage}')` } : undefined}
  />
)}
```

The `.dash-tile-art` class applies:
- `position: absolute; inset: 0` — fills the tile
- `opacity: 0.2` — subtle background (0.3 on hover)
- `background-size: cover; background-position: center`
- `z-index: 0` — behind the icon/logo and text

The tile's icon/logo and text children are lifted to `z-index: 1` so they
render on top of the artwork.

## Filling the Icon/Logo Container

### Icon-only tiles (no logo)

For tiles that use `icon` (renders a Lucide `<Icon>` component), the
container is 38x38px with 11px border-radius. By default the icon renders
at 20px, which looks small in the container.

**To fill the container**, add an `iconSize` field to the tile definition:

```js
{
  id: CLEANMAC_WINDOW_ID,
  icon: TerminalSquare,
  title: 'Cleanmac',
  hue: '#10b981',
  iconSize: 34,  // 34px fills the 38px container with 2px padding
}
```

The render logic in DashboardMode.jsx uses it:

```jsx
{logo ? <img src={logo} ... /> : <Icon size={iconSize || 20} />}
```

**Recommended sizes:**
- 34px for most icons in the 38px container (2px visual padding)
- 32px if the icon has visual weight that needs more breathing room

### Logo tiles (no icon)

For tiles that use `logo` (renders an `<img>`), the logo presentation is
controlled by two mechanisms:

**a) `LOGO_WHITE_BOX_IDS`** — Set of tile IDs that get a white background
chip behind the logo (for dark/line-art logos). Defined in appCatalog.js:

```js
export const LOGO_WHITE_BOX_IDS = new Set([GDASH_WINDOW_ID, MODES.STUDIOOS, MODES.LIGHTHOUSE, HERMES_WINDOW_ID]);
```

**b) `LOGO_FILL_COVER_IDS`** — Set of tile IDs where the logo fills the
entire container using `object-fit: cover`:

```js
export const LOGO_FILL_COVER_IDS = new Set([EIDOS_WINDOW_ID, KLIPIT_WINDOW_ID, MODES.BARS, ...]);
```

**c) Per-tile `logoStyle`** — Inline style overrides for specific tiles:

```jsx
if (id === GDASH_WINDOW_ID || id === MODES.LIGHTHOUSE)
  logoStyle = { width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'contain', padding: '5px' };
else if (id === MODES.STUDIOOS)
  logoStyle = { width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'contain', padding: '2px' };
else if (isFillCover)
  logoStyle = { width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'cover' };
else if (id === HERMES_WINDOW_ID)
  logoStyle = { width: '28px', height: '28px' };
```

**Decision guide for new tiles:**

| Logo type | Approach |
|-----------|----------|
| Dark/line-art logo on transparent bg | Add to `LOGO_WHITE_BOX_IDS` |
| Full-color logo that should fill container | Add to `LOGO_FILL_COVER_IDS` |
| Specific sizing needs | Add a per-tile `logoStyle` branch in DashboardMode.jsx |

## Tile Categories

### NATIVE_TILES (top section)

Perci's own workspace modes (Chat, Code, Agents, etc.). These do NOT have
`artwork` or `bgImage` — they use ModeIcons (custom SVG components) and
render with the `dash-tile-native` class.

### SYSTEM_TILES (bottom section)

External apps and runtimes (OpenClaw, Hermes, Eidos, etc.). These can have
`artwork: true` + `bgImage`. They render with `dash-tile-system` class.

The two sections are separated by a divider and have independent
alphabetical sorting toggles.

## Image Import Conventions

All assets are imported as ES modules at the top of `appCatalog.js`:

```js
import myBg from '../assets/my-bg.jpeg';
import myLogo from '../assets/my-logo.png';
```

Vite resolves these at build time and outputs hashed filenames in production.
Use `import` syntax — do NOT use `require()` or dynamic paths.

**File naming:** Use descriptive hyphenated names:
- Backgrounds: `{name}-bg.{ext}` (e.g. `openclaw-bg.jpg`, `lighthouse-bg.jpg`)
- Logos: `{name}-logo.{ext}` (e.g. `gdash-logo.svg`, `eidos-logo.png`)

## Common Pitfalls

1. **Forgetting `artwork: true` when adding `bgImage`.** The `.dash-tile-art` span is only rendered when `artwork: true`. Without it, the `bgImage` field is ignored.

2. **Using `bgImage` without importing it.** The import must be at the top of `appCatalog.js`, not inline in the array.

3. **Icon too small in container.** Default is 20px in a 38px container. Use `iconSize: 34` for icon-only tiles that should fill their chip.

4. **Logo not filling container.** Check if the tile is in `LOGO_FILL_COVER_IDS` or `LOGO_WHITE_BOX_IDS`. If neither, the logo renders at the default 24x24 `.dash-tile-logo` size.

5. **Not checking both consumers.** A change to `appCatalog.js` affects both DashboardMode.jsx and SirPerciLauncher.jsx. Verify both render correctly.

6. **Forgetting to commit the asset file.** Adding `import x from '../assets/x.jpeg'` is not enough — the file must exist in `src/assets/` and be tracked by git.

## Verification Checklist

- [ ] Image file exists in `src/assets/`
- [ ] Import added to `appCatalog.js` (top of file, alphabetically)
- [ ] Tile definition has correct fields (`artwork`/`bgImage`/`iconSize` as needed)
- [ ] If logo tile: correct presentation (white-box, fill-cover, or custom style)
- [ ] Dashboard shows the tile with artwork/icon correctly
- [ ] Sir Perci launcher also renders it correctly
- [ ] `git add` both the asset file and the modified source files
