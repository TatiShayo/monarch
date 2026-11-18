# USB Shelf 3.0 Audit & Tizen 4.0 Verification

## 1. Preserved Core Fixes (v1.0 -> v2.0 -> v3.0)

| Area | Issue | Verified Fix |
|---|---|---|
| **Video layer visibility** | `html` and `body` both had opaque backgrounds; AVPlay renders on a hardware plane *behind* the Chromium layer, hiding playback. | `html, body` have **no background**; `<object id="av-player" type="application/avplayer">` sits at `z-index: 0`; `#app` (`z-index: 1`) hides via `body.playing #app { display: none; }` while `#player` (`z-index: 2`, transparent) holds subtitles/OSD. |
| **Chromium 56 CSS compat** | Avoids modern CSS features unsupported or slow on 2018 Tizen 4.0 (Chromium 56). | Zero CSS `grid`, zero flex `gap`, zero `var()`, zero `backdrop-filter`, zero `aspect-ratio`, zero `inset`; `-webkit-` prefixed gradients/transforms/transitions/keyframes; pooled 7-row DOM (`ROWPOOL`). |
| **Strict ES5 JS** | Tizen 4.0 WebKit lacks ES2020+ syntax (`?.`, `??`, `let`/`const`, `=>`, template literals). | 100% strict ES5 validated via static AST/regex scanner in `verify_unit.js`. |
| **AVPlay `SET_MODE_4K`** | Samsung docs specify `SET_MODE_4K` only for adaptive streaming manifests and deprecate it on newer firmware. | Dropped `SET_MODE_4K` for local USB playback. |
| **AVPlay `setSpeed()`** | Non-integer rates (`0.75x`, `1.25x`, `1.5x`) fail because AVPlay `setSpeed(long)` only accepts integer multipliers. | `SPEEDS = [1, 2]` only. |
| **AVPlay `seekTo(0)`** | Samsung Multimedia Q&A documents that `seekTo(0)` fails / cannot seek directly to `0 ms`. | Clamps rewind targets during active playback to `100 ms` (`P.dur > 1000 ? 100 : 0`), displaying `0:00` safely. On initial open at start (`startAt === 0`), `seekTo` is skipped cleanly. |
| **Seek race conditions** | Calling `seekTo` repeatedly while another async seek is in flight triggers `PLAYER_ERROR_INVALID_STATE`. | `SEEK_DEBOUNCE = 450ms` + `P.seeking` guard ensures only one seek is in flight; `P.sid++` invalidates stale async callbacks on stop/close/track-switch. |
| **Open URI format** | `file.toURI()` returns percent-encoded `file:///...`, which AVPlay rejects on some Tizen builds unless passed an unencoded local filesystem path. | `candidateUris()` tries decoded local path (`/opt/storage/...`), then decoded `file://`, then raw `toURI()` sequentially on prepare error. |
| **Subtitles & UTF-8 BOM/multibyte** | `FileStream.read(n)` counts characters rather than bytes, failing/truncating UTF-8 `.srt` files; 16-bit/Windows-1252 files garble. | `readBytes()` reads `readBytes()` / `readBase64()` chunks and `utf8Decode()` handles UTF-8 BOM, UTF-16 LE/BE BOM, 4-byte surrogate pairs, and Latin-1/Windows-1252 fallback. `.srt` cue reader strips `\uFEFF` and overlaps cleanly via binary search + backward scan (`cuesAt()`). |
| **Embedded subtitle suppression** | Tizen draws native subtitles independently if not muted when showing custom OSD/SRT. | Calls `setSilentSubtitle(true)` when using external SRT / off, and handles `onsubtitlechange` + `setSelectTrack('TEXT', idx)` + `setSubtitlePosition(ms)` cleanly when an embedded track is chosen. |
| **Episode end overwrite race** | Calling `teardown(true)` after `setDone()` when advancing to Up Next could overwrite `done=1` if `P.cur` was slightly shy of `P.dur - tail`. | `onEnded()` calls `setDone()` then `teardown(false); dbFlush();` before starting Up Next or exiting. |
| **Diagnostics `lastErr` persistence** | Earlier `P.lastErr` carried across sessions after a successful open. | `onPrepared()` resets `P.lastErr = ''` on clean open while still logging and retaining genuine failure errors. |
| **Remote key registration & hotplug** | Unchecked `registerKey()` throws on missing remote keys; unplugged USB causes stale handles. | Checks `getSupportedKeys()` before registering each key; `addStorageStateChangeListener()` tears down active playback/browsing cleanly on unmount and re-scans USB roots. |
| **Suspend / restore (`visibilitychange`)** | Switching TV input / Home loses play position or leaves AVPlay wedged. | `suspend()` + `saveProgress()` + `dbFlush()` on `document.hidden`; `restore()` with 1500ms `getState()` check that reopens at `P.cur` if the hardware decoder did not resume cleanly. |

## 2. USB Shelf 3.0 -> 3.1 Visual, Color Theory & Netflix Player Upgrades

- **60-30-10 Obsidian / White / Crimson Color Theory (v3.1.0)**:
  - **60% Obsidian Canvas:** `#0c0c0f` -> `#141418` -> `#1b1b21` layered charcoal surfaces (`#000000` in OLED Black). Zero `#3b7bff` neon blue backgrounds across Home, Browse, Detail, Customize, Pickers, or Player OSD.
  - **30% Luminous White Focus:** Focused rows, buttons, transport controls, and modal items use high-contrast `#ffffff` fill with `#111114` ink; poster cards use crisp `#ffffff` focus ring.
  - **10% Intentional Accent:** Netflix Crimson (`#e50914`, default) reserved strictly for brand bar, hero eyebrow/CTA, progress bars, scrubber fill, and active selection dots (`Amber Gold`, `Silver Glass`, `Muted Slate` options in Customize).
- **Authentic Netflix TV App Player (v3.1.0)**:
  - Top bar with back chevron, title/episode subtitle, and live `"Ends at HH:MM"` finish clock (zero codec pill noise on HUD).
  - Thin `6px`->`10px` scrubber with floating `#osd-bub` time callout above the knob, `-MM:SS` remaining time, and transient `#seek-flash` (`-10s` / `+30s`) badge.
  - Split transport & utility bar: circular Play/Pause (`CSS` vector bars/triangle), `-10s`, `+10s`, `Next Ep`, `Episodes` (left) + `Audio & Subtitles` and `Settings` (right).
  - **2-Column Audio & Subtitles Modal (`#as-modal`):** Audio tracks on left, Subtitles + inline `+/-500 ms` Sync on right.
  - **In-Player Episodes Drawer (`#ep-drawer`):** Jump directly to any episode in the season without leaving playback.
  - **Skip Intro Pill (`#skip-intro`):** Floating bottom-right `Skip Intro +85s` pill during `5s..110s` of TV episodes, plus `Next Episode` countdown card (`#upnext`).
  - **Hidden Settings Drawer:** Aspect Ratio, Playback Speed (`1x`/`2x`), Subtitle Sync/Size/Pill/Position, and Diagnostics.
- **Frame-Inspired Offline Polish (v3.1.0)**:
  - **Live Top-Right Wall Clock (`#hdr-clock`):** Minimalist 12h clock updated every 15s offline.
  - **Dynamic Moody Tonal Tint (`#bg-tint`):** Deterministic low-saturation radial tint shifted per item hue (`Ambient Tint: On/Off` in Customize).
  - **Ambient Gallery Mode (`#gallery`):** Fullscreen 16:9 art screensaver cycling cached local artwork with large thin clock + `Now Showing · Title`, launched via `Ambient Gallery` tile or `Ambient Idle` (`Off` / `3 min` / `5 min`), instant exit on any key.
  - **Atmospheric Opening Splash (`#play-splash`):** `Switching to <Title>` card with dimmed backdrop + spinner + `Press Back to cancel` while AVPlay prepares.
