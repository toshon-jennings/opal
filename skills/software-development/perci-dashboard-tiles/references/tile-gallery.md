# Tile Gallery — Real Examples

Concrete tile definitions from `src/lib/appCatalog.js` showing every
presentation variant used in production.

## Icon + Artwork + iconSize (Cleanmac)

```js
// src/lib/appCatalog.js
import cleanmacBg from '../assets/cleanmac-bg.jpeg';

{
  id: CLEANMAC_WINDOW_ID,
  icon: TerminalSquare,
  title: 'Cleanmac',
  desc: 'Clean developer caches on macOS',
  hue: '#10b981',
  artwork: true,
  bgImage: cleanmacBg,
  iconSize: 34,
}
```

- Also listed in `LOGO_WHITE_BOX_IDS` (gets white chip bg for the icon)
- `iconSize: 34` fills the 38px container

## Logo + Artwork + Fill-Cover (AutoForge)

```js
import autoforgeLogo from '../assets/autoforge-logo.png';
import autoforgeBg from '../assets/autoforge-bg.jpeg';

{
  id: AUTOFORGE_WINDOW_ID,
  icon: null,
  logo: autoforgeLogo,
  title: 'AutoForge',
  desc: 'Autonomous coding agent',
  hue: '#f97316',
  artwork: true,
  bgImage: autoforgeBg,
}
```

- Listed in `LOGO_FILL_COVER_IDS` → logo fills container with `object-fit: cover`

## Logo + Artwork + White-Box (G-Dash)

```js
import gdashLogo from '../assets/gdash2-cropped.png';
import gdashBg from '../assets/gdash-bg.jpg';

{
  id: GDASH_WINDOW_ID,
  icon: null,
  logo: gdashLogo,
  title: 'G-Dash',
  desc: 'Google Workspace dashboard',
  hue: '#4285f4',
  artwork: true,
  bgImage: gdashBg,
}
```

- Listed in `LOGO_WHITE_BOX_IDS` → white chip behind logo
- Custom `logoStyle` in DashboardMode.jsx: `{ width: '100%', height: '100%', borderRadius: 'inherit', objectFit: 'contain', padding: '5px' }`

## Logo + Fill-Cover + Artwork (Open Notebook)

```js
import cleanmacLogo from '../assets/cleanmac-logo.jpeg';
import openNotebookBg from '../assets/open-notebook-bg.jpeg';

{
  id: OPEN_NOTEBOOK_WINDOW_ID,
  logo: cleanmacLogo,
  title: 'Open Notebook',
  desc: 'Embedded localhost notebook window',
  hue: '#10b981',
  artwork: true,
  bgImage: openNotebookBg,
}
```

- Listed in `LOGO_FILL_COVER_IDS` → logo fills container
- `artwork: true` + `bgImage` → background image layer behind the logo

## Icon Only, No Artwork (Power Workspace — native tile)

```js
{
  id: MODES.POWER_WORKSPACE,
  icon: Sparkles,
  title: 'Power Workspace',
  desc: 'Ideas, runs & next action',
  hue: '#f97316',
}
```

- Native tile (top section), no artwork, no logo
- Renders ModeIcon component (custom SVG), not Lucide icon
