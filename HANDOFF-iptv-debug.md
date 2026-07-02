# IPTV Window — Debug Handoff (RESOLVED)

## Status: ✅ Fixed and verified in Electron

The IPTV TV screen rendered **blank white**. Root-caused and fixed.

## Root cause
The TV is an `<iframe src="…/iptv-player.html">`. The dev server middleware in
`vite.config.js` sets `Content-Security-Policy: frame-ancestors 'none'` and
`X-Frame-Options: DENY` on every response except `/gdash/*`. So the player page
could not be framed → Chromium blocked it with `ERR_BLOCKED_BY_RESPONSE`
(confirmed in the Electron renderer log: *"Framing 'http://localhost:5173/'
violates … frame-ancestors 'none'"*) → the iframe painted blank white. The
sidebar/channels rendered fine because they are normal React, not framed content.

The G-Dash surface hit this exact wall earlier and was given a `/gdash/`
framing exception; the IPTV player needed the same.

## Fixes applied
1. **`vite.config.js`** — `allowsSameOriginFrame()` now also matches
   `/iptv-player.html`, so the player page is served with `frame-ancestors 'self'`
   / `X-Frame-Options: SAMEORIGIN`. **COEP/COOP are kept** on the player: the app
   shell is cross-origin isolated (`COOP: same-origin` + `COEP: require-corp`), so
   even this *same-origin* iframe must itself send `COEP: require-corp` or it
   fails to load. (A first attempt that stripped COEP from the player broke the
   frame under isolation — don't do that.)
2. **`src/components/RetroTvPlayer.tsx`** — the player URL is resolved with
   `new URL('iptv-player.html', window.location.href)` instead of the absolute
   `/iptv-player.html`, so it also works in the packaged build (loaded over
   `file://`, where `/…` points at the filesystem root).
3. **`public/iptv-player.html`** — the hls.js `<script>` now uses the relative
   `vendor/hls.min.js` for the same `file://` reason.

## Verification (web build, Vite preview)
- Player iframe is now `same-origin` + `accessible`, body background `rgb(0,0,0)`
  (the player page), `window.Hls` is a `function` inside the iframe — i.e. it
  loads instead of going white. Stable across full reloads.
- `npm run build` passes; `dist/iptv-player.html` ships the relative hls path and
  `dist/vendor/hls.min.js` is emitted.

## Follow-up: "Autoplay blocked" → playback fix (also applied)
After the framing fix, the TV loaded but showed the player's "Autoplay blocked"
overlay in **real Electron** too. Cause: the player checked
`video.canPlayType('application/vnd.apple.mpegurl')` FIRST. Desktop Chromium /
Electron report that as truthy ("maybe") but cannot actually demux HLS, so it
routed to `video.src = m3u8` → `DEMUXER_ERROR_COULD_NOT_PARSE` → `play()` rejected
→ mislabeled "Autoplay blocked".

Fix in **`public/iptv-player.html`**: reordered to the official hls.js pattern —
**hls.js first when `Hls.isSupported()`**, native HLS only as the Safari/iOS
fallback. Also added a "Tap to play" click-to-resume affordance for genuine
autoplay rejections. Static file: no rebuild, just close/reopen the IPTV window.

## Final Electron verification
Confirmed in the running Perci Electron app on 2026-06-28:
- `http://localhost:5173/iptv-player.html` is served with
  `frame-ancestors 'self'`, `X-Frame-Options: SAMEORIGIN`, and
  `COEP: require-corp`.
- Closing and reopening the IPTV window refetched the static player page.
- The stale 2GB Sydney stream showed the expected "Network error — stream may be
  offline" state instead of the prior autoplay/CSP failure.
- Searching for and selecting "Al Jazeera (1080p)" produced visible live video
  inside the real Electron IPTV window.
- The renderer log had no new `did-fail-load -27 ERR_BLOCKED_BY_RESPONSE`
  entries after the reopen; the remaining entries are pre-fix/pre-restart
  history.

## Follow-up: favorites and channel-list position
Confirmed and fixed on 2026-06-28:
- The only favorite affordance was a tiny icon in the TV control cluster, so it
  was easy to miss. `IptvMode.jsx`/`.css` now expose a labeled
  `Favorite`/`Favorited` toggle in the current-channel bar and a star toggle on
  each channel row.
- Selecting a channel after scrolling down could make the channel selector feel
  like it refreshed back to the top. The channel row component now has a stable
  identity outside `IptvMode`, and selection snapshots/restores the sidebar/list
  scroll positions after changing channels.
- Validation: focused ESLint on `src/components/IptvMode.jsx`,
  `git diff --check` for the touched IPTV files, live Electron check for
  scroll retention and favorite toggling, and `npm run build`.

## Follow-up: audio control
Confirmed and fixed on 2026-06-29:
- The host looked like it could unmute, but the iframe player treated a missing
  `mute` query parameter as muted (`muteParam !== '0'`). Rebuilding the iframe
  URL to unmute was also brittle because it reloads the stream and re-enters
  Chromium/Electron autoplay policy.
- `RetroTvPlayer.tsx` now starts every stream with `mute=1` so autoplay can
  begin, then sends a `postMessage` to the iframe when the user toggles audio.
  `public/iptv-player.html` handles that message by setting `video.muted` and
  `video.volume` on the existing video element, without reloading the stream.
- The TV audio button is now labeled `Unmute` / `Audio on`, so the current audio
  state is visible instead of being icon-only.
- Validation: focused ESLint on `src/components/RetroTvPlayer.tsx` and
  `src/components/IptvMode.jsx`, `git diff --check`, a Playwright probe that
  verified iframe `postMessage` changes the player from `muted=true, volume=0`
  to `muted=false, volume=1`, live Electron check that the button changes from
  `UNMUTE` to `AUDIO ON`, and `npm run build`.
