# Reaction Player — build notes (read this first after any restart)

Run from the project root: `npm run dev` (Electron), `npm run dev:web` (browser), `npm run check`, `npm test`, `npm run build`,
`npm run dist:linux`. `README.md` covers usage, packaging and the desktop features; `docs/ARCHITECTURE.md` covers how the pieces fit.

Stack: Electron (electron-vite, electron-builder) · Svelte 5 runes · Vite 8 · Tailwind 4 (`@theme` tokens in `src/app.css`) · `@lucide/svelte` · Archivo variable font
(plus Cinzel, on Home's title screen only).
Hash router (`#/`, `#/session`, `#/presets`, `#/sessions`, `#/settings/<appearance|preferences>`).
The root font size is 14 px, so Tailwind spacing utilities scale by 0.875; explicit `px` values and border widths do not.

## Status

- [x] Home, New session, Session (player), Load session, Presets and alignment studio, Settings (two tabs)
- [x] Sync engine, including videos of unequal length
- [x] Desktop app: Electron main and preload, `local-media://` streaming, file persistence, native dialogs, clipboard and fullscreen
- [x] Everything unlocked: tiers, billing, cloud sync, profile and plan badges removed
- [x] Free layer ordering: `zIndex`, Layers panel, context menu, `[` `]` shortcuts, per-layer hide and lock, migration of old saves
- [x] Packaging (pacman, AppImage, tar.gz, NSIS, portable, dmg, zip) and the GitHub Actions workflow
- [x] Unit tests (`npm test`)

## Design rules (decided, so do not re-debate)

- True `#000` everywhere, hairline borders (`border-line`, `border-line-strong`), square-ish corners, **no blur anywhere**.
- Yellow `#FFD400` (`text-accent`, `bg-accent`) only marks live or selected things: the source layer, the playhead, the linked
  state, one primary button.
- Reaction layers are white or grey, with a dashed outline when selected. The source layer has a yellow outline. Stacking
  is each layer's `zIndex` (new layouts put the source on top).
- Archivo only. Page titles use `.title-wide` (width 125, weight 800). Numbers use `.num` (tabular). Sentence case, no all
  caps, no eyebrows.
- Icon-only HUD buttons use `IconButton` (its label is both the tooltip and the aria-label). Tooltips: `use:tip={{text,kbd,side}}`.
- No shadows except floating surfaces (`.float` menus and dialogs, and toasts).

### The one exception: Home's title screen

Home is set like a game's title screen, after a screen recording the owner supplied (that game's artwork, name and text are not
used). It is the only place that breaks the rules above, and it is kept to `components/home/`, `actions/streak.ts` and
`utils/embers.ts`:

- **Type.** Cinzel (`src/assets/fonts/cinzel-latin-wght.woff2`, SIL Open Font Licence 1.1, licence text beside it) for the menu
  words, in capitals with wide tracking. The wordmark stays Archivo, and so does all the small print.
- **Light instead of shadow.** A glow on the menu text, a bloom behind "Continue", a line that runs from the left edge of the
  hovered or focused item to the pointer (`use:streak`), and a canvas of embers that follows the pointer (`EmberTrail.svelte`
  drives `EmberField` in `utils/embers.ts`). The colours are the `--ember*` and `--paper*` custom properties in `app.css`: a warm
  amber, not the app's yellow. The logo mark keeps its yellow.
- **Still true on Home.** Nothing is blurred (no `filter: blur`, no `backdrop-filter`, and the wallpaper is never blurred). With no
  wallpaper the ground is `#000` with a faint warm light low on the left. The wallpaper is the artwork; a soft shade along the
  bottom and left keeps the menu readable on any picture.
- **Motion and touch.** `prefers-reduced-motion` switches the ember canvas off (the hover line stays). The canvas paints about
  60 times a second while the pointer moves and about 30 for the drifting sparks at rest; it stops once Home is left and pauses
  while the tab is hidden. Touch gets a small spray of sparks where it lands, not a trail.
- **Size.** Targets are at least 44 px on a coarse pointer (38 px on a short landscape screen). Portrait screens up to 900 px
  stack into one column; below 720 px the corner keeps only the version; below 420 px of height the screen scrolls
  instead of clipping.
- Every other page keeps the plain Dock look. Do not bring Cinzel, glow or the trail to them without deciding it here first.

## What exists

- `lib/types.ts` `Session`, `SessionVideo`, `Alignment`, `LayerTransform` (`x y w h` in 0..1, `crop`, `opacity`, `fit`, `aspect`),
  `Preset`, `AppSettings`, `PlaybackPrefs`, `MenuEntry`. `LayerTransform` also has `zIndex`, `hidden`, `locked`.
- `lib/constants.ts` `MAX_VIDEOS`, `DEFAULT_SETTINGS`, `SHORTCUTS` (with a `{step}` placeholder the dialog fills in),
  `ASPECT_OPTIONS`, `CANVAS_ASPECTS`, `MIN_LAYER_SIZE`, `SNAP_DISTANCE`, `PLAYBACK_RATES`, `OFFSET_STEPS`, `HARD_SEEK_THRESHOLD_S`.
- Stores (singletons): `session`, `settings`, `presets`, `router`, `ui`, plus `persistence.ts` (files on desktop, LocalStorage and IndexedDB in a browser).
  - `session`: `current`, `saved`, `lastId`, `selectedId`, `master`, `canContinue`, `lastSession`; `create`, `open`, `resume`, `save`,
    `close`, `duplicate`, `remove`, `rename`, `exportJSON`, `importConfig`, `updateVideo`, `setVolume`, `toggleMute`, `setRate`, `setOffset`,
    `nudgeOffset`, `setMaster`, `relink`, `select`, `setLayer`, `resetLayer`, `applyLayout`, `applyPreset`, `setLocked`, `setTheater`,
    `setCanvasAspect`, `recordTimes`, `reorderLayer`, `canReorderLayer`, `setStackOrder`.
  - `settings`: `settings`, `playback`, `wallpaper`; `patchPlayback`, `setWallpaper`, `setWallpaperClear`, `setDefaultLayout`, `resetSettings`.
  - `presets`: `builtIn`, `custom`, `all`, `forCount(n)`, `save`, `rename`, `remove`.
  - `ui`: `toast(msg, kind, action?)`, `openMenu(x, y, entries)`, `newSessionOpen`, `shortcutsOpen`.
  - `router`: `go('home' | { name: 'settings', tab })`, `hrefFor(route)`.
- Engine: `playback.svelte.ts` (the `playback` singleton: clock, transport, drift correction, frame stepping, copy frame,
  thumbnails), `timeline.ts` (pure timeline and drift maths), `track.ts` (one `<video>` plus frame-rate measurement),
  `layouts.ts`, `zorder.ts` (stacking and hit-testing), `migrate.ts`, `capture.ts`, `media.ts`, `probe.ts`, `aspect.ts`, `demo.ts`, `sessionFactory.ts`, `importConfig.ts`, and
  `appActions.ts` (`continueLast` and `quitApp`, shared by the Dock and the Home menu so they cannot drift apart).
- Utilities: `geometry.ts`, `format.ts`, `file.ts` (`saveJSON` and `openJSONText`, which use the native dialogs on desktop; `saveBlob` and `pickFiles` for the browser;
  `copyCanvasToClipboard`, which uses Electron's clipboard on desktop), `fullscreen.ts`, and
  `embers.ts` (`EmberField`, the pointer glow's canvas engine; it has no Svelte in it).
- UI kit `components/ui/`: Button, IconButton, Modal, ContextMenu, MenuPanel, Segmented, Slider, NumberField, Switch, Toasts,
  EmptyState, LayoutPreview, ShortcutsDialog. Actions: `tip`, `dropzone`, `portal`, `focusTrap`, `clickOutside`, `layerGesture`, `streak`.
- Home `components/home/`: `TitleMenu.svelte` (the menu, the small links and the version), `EmberTrail.svelte` (mounts an
  `EmberField` on a canvas over the page), and the New session dialog parts. `pages/Home.svelte` lays the wallpaper, the edge shade,
  the menu and the trail in one box that is also the drop target for videos.
- `__APP_VERSION__` (the version on Home) is defined in `electron.vite.config.ts` and `vite.config.ts` from `package.json` and typed in `src/globals.d.ts`.
- Demo clips: `src/assets/demo/source.webm` (flashes at 2.0 s and 8.0 s) and `reaction.webm` (3.5 s and 9.5 s), so the reaction
  needs `offsetMs = +1500` to line up. `scripts/make-demo-clips.sh` regenerates them.

## Behaviour worth remembering

- **Unequal lengths.** The linked timeline is the union of all footage. A video outside its own footage waits on its first or last
  frame, a virtual clock carries the timeline while the master has none, playback ends when every video has ended, a single
  frame step follows the video on screen, and `audioFollowsFootage` (default on) lends the master's sound to the first video that
  has footage.
- **Lane heights** come from one number. `LANE_H` in `components/session/metrics.ts` is exposed as `--lane` on the transport, and
  the master lane, the per-video lanes and the stage inset all read it, so the dock and the canvas cannot drift apart.
- **The shortcut list** is `SHORTCUTS` in `constants.ts` and must match the `switch` in `pages/Session.svelte`.
- **Local files** are stored by absolute path on desktop and played through `local-media://`. A relink prompt appears only on layers whose file is gone (or, in a browser, on every local layer after a reload).
- **Stacking** is `zIndex`; the Stage hit-tests from the top, skipping hidden and locked layers. Old saves are migrated on load.
- **Tailwind only scans `src/` and `index.html`** (`source(none)` and two `@source` lines at the top of `src/app.css`). Do not remove
  them: with automatic detection the docs and old builds leak class names into the stylesheet.

## Verification log

- 2026-11-19, the desktop conversion: `npm run check` 0 errors and 0 warnings; `npm test` 80 tests; `npm run build`; the Linux packages built
  with electron-builder. The app was run in Electron under Xvfb and driven with Playwright (see "How it was checked" in
  `docs/ARCHITECTURE.md`): Range requests, canvas tainting, native clipboard, fullscreen, z-order shortcuts and menu, lock click-through,
  restart persistence, automatic reopen of a saved local path, the missing-file prompt, and the packaged (asar) build.
- **Not verified:** Windows and macOS builds on real machines, VA-API on a real Wayland GPU session, a real file-manager drag and drop,
  the CI workflow on GitHub's own runners, Safari and Firefox (the browser fallback is for development), screen readers.
- Earlier history (the browser version, Home's title screen) was verified in headless Chromium; those notes are in the git history.

## Open questions and known gaps

- **Home navigation.** The dock has a Home item. Quit closes the app, so it is no longer the way back to Home.
- The Layers panel on a phone leaves the canvas about 94 px wide; it wants a bottom sheet.
- The phone dock shows icons without visible labels, and the phone transport drops frame steps, speed and volume.
- "Try the demo" in the New session dialog shows no loading state while the clips decode (the Home menu's Demo item does).
- The ember trail was measured in Chromium only. Firefox, Safari, a low-power phone and a very large 4K display are untested; if
  it is heavy anywhere, lower `SUBDIVIDE` or the mote count in `seedMotes` (both in `utils/embers.ts`), or turn it off with `stop()`.
- No HLS or DASH.
- In the alignment studio, onion skin and wipe act on the source layer, which may no longer be the top one.
- Hardware acceleration in Preferences only controls GPU compositing hints; the decoder is Chromium's (VA-API on Linux).
- `npm audit` reports two low-severity advisories (prototype poisoning in `deepmerge`, pulled in by `@sveltejs/vite-plugin-svelte`).
  It is a build-time dependency that never reaches the bundle, and no fix was available on 2026-11-07. Check again whenever
  dependencies are updated.

## Conventions

- Pages that sit beside the dock wrap their content in `<PageShell>` (Home and the player do not); the title is
  `<h1 class="title-wide text-[28px] md:text-[34px]">`.
- Never blur. Never shadow except on floating surfaces. No all caps, no eyebrows, no "·"-joined meta strings (use icons and separate
  spans). Home's title screen is the one exception to the shadow and capitals rules (see above); it still never blurs.
- Write long files in small pieces (outline first, then sections); one long response once hit the output limit.
- The code lives in `Sadaragavan/ReactionPlayer-Copy`, branch `main`. Make small commits and run the
  checklist in `CLAUDE.md` first; user-visible changes get a line under `[Unreleased]` in `CHANGELOG.md`.
- CI (`.github/workflows/build-desktop.yml`) runs `npm ci`, `npm run check` and `npm test`, then builds installers on Linux, Windows and
  macOS and uploads them as artifacts; a `v*` tag attaches them to a release.
