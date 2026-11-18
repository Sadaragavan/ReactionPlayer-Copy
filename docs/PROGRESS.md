# Reaction Player — build notes (read this first after any restart)

Run from the project root: `npm run dev`, `npm run check` (svelte-check), `npm run build`, `npm run build:single`.
`README.md` covers usage, plans and payment; `docs/ARCHITECTURE.md` covers how the pieces fit.

Stack: Svelte 5 runes · Vite 8 · Tailwind 4 (`@theme` tokens in `src/app.css`) · `@lucide/svelte` · Archivo variable font
(plus Cinzel, on Home's title screen only).
Hash router (`#/`, `#/session`, `#/presets`, `#/sessions`, `#/settings/<appearance|preferences|profile|subscription>`).
The root font size is 14 px, so Tailwind spacing utilities scale by 0.875; explicit `px` values and border widths do not.

## Status: complete

- [x] Home, New session, Session (player), Load session, Presets and alignment studio, Settings (four tabs)
- [x] Sync engine, including videos of unequal length
- [x] Free and Pro tiers, Stripe Payment Link seam, cloud sync seam (both with working local fallbacks)
- [x] Browser verification (see the log below)
- [x] Production build, single-file build, hosted live preview, README, architecture doc, UI element inventory, source zip
- [x] Private GitHub repository (`Sadaragavan/ReactionPlayer`, branch `main`) with a changelog and CI

## Design rules (decided, so do not re-debate)

- True `#000` everywhere, hairline borders (`border-line`, `border-line-strong`), square-ish corners, **no blur anywhere**.
- Yellow `#FFD400` (`text-accent`, `bg-accent`) only marks live or selected things: the source layer, the playhead, the linked
  state, one primary button.
- Reaction layers are white or grey, with a dashed outline when selected. The source layer has a yellow outline and is
  **always painted on top** (`paintOrder` in `engine/layouts.ts`).
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
  stack into one column; below 720 px the plan block keeps only the tier and version; below 420 px of height the screen scrolls
  instead of clipping.
- **The plan block** is generated from `TIER_LIMITS` through `settings.limits`, like the table in Settings → Subscription, so it
  cannot promise more than the code enforces.
- Every other page keeps the plain Dock look. Do not bring Cinzel, glow or the trail to them without deciding it here first.

## What exists

- `lib/types.ts` `Session`, `SessionVideo`, `Alignment`, `LayerTransform` (`x y w h` in 0..1, `crop`, `opacity`, `fit`, `aspect`),
  `Preset`, `AppSettings`, `PlaybackPrefs`, `MenuEntry`, and the `BillingAdapter` and `CloudSyncAdapter` contracts.
- `lib/constants.ts` `TIER_LIMITS`, `PRICING`, `DEFAULT_SETTINGS`, `SHORTCUTS` (with a `{step}` placeholder the dialog fills in),
  `ASPECT_OPTIONS`, `CANVAS_ASPECTS`, `MIN_LAYER_SIZE`, `SNAP_DISTANCE`, `PLAYBACK_RATES`, `OFFSET_STEPS`, `HARD_SEEK_THRESHOLD_S`.
- Stores (singletons): `session`, `settings`, `presets`, `router`, `ui`, plus `persistence.ts` for LocalStorage and IndexedDB.
  - `session`: `current`, `saved`, `lastId`, `selectedId`, `master`, `canContinue`, `lastSession`; `create`, `open`, `resume`, `save`,
    `close`, `duplicate`, `remove`, `rename`, `exportJSON`, `syncAll`, `updateVideo`, `setVolume`, `toggleMute`, `setRate`, `setOffset`,
    `nudgeOffset`, `setMaster`, `relink`, `select`, `setLayer`, `resetLayer`, `applyLayout`, `applyPreset`, `setLocked`, `setTheater`,
    `setCanvasAspect`, `recordTimes`.
  - `settings`: `settings`, `profile`, `tier`, `isPro`, `limits`, `playback`, `wallpaper`; `patchPlayback`, `setTier`, `setPlan`,
    `setWallpaper`, `updateProfile`, `resetSettings`.
  - `presets`: `builtIn`, `custom`, `all`, `forCount(n)`, `canAddCustom`, `save`, `rename`, `remove`.
  - `ui`: `toast(msg, kind, action?)`, `openMenu(x, y, entries)`, `newSessionOpen`, `shortcutsOpen`, `dormant`.
  - `router`: `go('home' | { name: 'settings', tab })`, `hrefFor(route)`.
- Engine: `playback.svelte.ts` (the `playback` singleton: clock, transport, drift correction, frame stepping, copy frame,
  thumbnails), `timeline.ts` (pure timeline and drift maths), `track.ts` (one `<video>` plus frame-rate measurement),
  `layouts.ts`, `capture.ts`, `media.ts`, `probe.ts`, `aspect.ts`, `demo.ts`, `sessionFactory.ts`, `importConfig.ts`, and
  `appActions.ts` (`continueLast` and `quitApp`, shared by the Dock and the Home menu so they cannot drift apart).
- Utilities: `geometry.ts`, `format.ts`, `file.ts` (`saveBlob` and `saveJSON`, which use the viewer's `downloads` capability when
  sandboxed and a normal download otherwise; `pickFiles`, `downscaleToDataURL`, `copyCanvasToClipboard`), `fullscreen.ts`, and
  `embers.ts` (`EmberField`, the pointer glow's canvas engine; it has no Svelte in it).
- UI kit `components/ui/`: Button, IconButton, Modal, ContextMenu, MenuPanel, Segmented, Slider, NumberField, Switch, Toasts, ProBadge,
  EmptyState, LayoutPreview, ShortcutsDialog. Actions: `tip`, `dropzone`, `portal`, `focusTrap`, `clickOutside`, `layerGesture`, `streak`.
- Home `components/home/`: `TitleMenu.svelte` (the menu, the small links and the plan block), `EmberTrail.svelte` (mounts an
  `EmberField` on a canvas over the page), and the New session dialog parts. `pages/Home.svelte` lays the wallpaper, the edge shade,
  the menu and the trail in one box that is also the drop target for videos.
- `__APP_VERSION__` (the "v0.1.0" in the plan block) is defined in `vite.config.ts` from `package.json` and typed in `src/globals.d.ts`.
- Demo clips: `src/assets/demo/source.webm` (flashes at 2.0 s and 8.0 s) and `reaction.webm` (3.5 s and 9.5 s), so the reaction
  needs `offsetMs = +1500` to line up. `scripts/make-demo-clips.sh` regenerates them.

## Behaviour worth remembering

- **Unequal lengths.** The linked timeline is the union of all footage. A video outside its own footage waits on its first or last
  frame, a virtual clock carries the timeline while the master has none, playback ends when every video has ended, a single
  frame step follows the video on screen, and `audioFollowsFootage` (default on) lends the master's sound to the first video that
  has footage.
- **Lane heights** come from one number. `LANE_H` in `components/session/metrics.ts` is exposed as `--lane` on the transport, and
  the master lane, the per-video lanes and the stage inset all read it, so the dock and the canvas cannot drift apart.
- **The plan table in Settings → Subscription must say what the code enforces.** Enforced today: 2 or 4 videos, up to 1080p or 4K,
  cloud sync, 3 or unlimited custom presets, and the last eight captures per video in the studio (Pro). Onion skin, wipe and crop are free.
- **The shortcut list** is `SHORTCUTS` in `constants.ts` and must match the `switch` in `pages/Session.svelte`.
- **Local files** are never persisted, only their names. A relink prompt appears on exactly the layers that need it.
- **Tailwind only scans `src/` and `index.html`** (`source(none)` and two `@source` lines at the top of `src/app.css`). Do not remove
  them: with automatic detection the docs and old builds leak class names into the stylesheet.

## Verification log

- `npm run check`: 0 errors, 0 warnings.
- Headless Chromium (Playwright) against the production build (the engine-level length suite on the dev server; the smoke,
  transport, session and length suites repeated on the single-file build), with generated clips of 6, 8 and 20 s at 24 and 30 fps:
  smoke and sync; transport (frame steps, link and unlink, offset capture); session HUD, menus, theater and shortcuts; every page,
  including wallpaper upload and link; a 390 px phone layout; menus and flows (preset apply, Presets to new session, Quit and Reopen);
  a sandbox simulation (blocked storage, throwing file picker, rejecting clipboard, refused fullscreen); unequal lengths through the
  engine (54 checks) and through the real screens (13 checks). All passing, no console errors.
- Home title screen, in headless Chromium against the dev server (2026-11-10): 36 behaviour checks (every menu action, Continue
  after a session and Quit then Reopen, arrow-key focus, the Pro plan block, reduced motion, the paint rate at rest and while moving,
  the loop stopping once Home is left, dropping two videos), a 10-check touch pass on a phone, and layout checks at 13 sizes from
  568×320 to 1920×1080 in the Free, Pro and long-display-name states. No overflow, off-screen blocks, overlaps or console messages.
- The final single-file build was opened in the artifact viewer: Home renders, the demo starts, both layers show with the 1.5 s offset.
  The viewer logs two harmless notices (autoplay and screen wake lock are not allowed in the frame).
- A fresh clone of the GitHub repository installs from the lockfile (`npm ci`, Node 22.22) and builds the same files as the verified
  build: `dist/` is identical and the single-file `index.html` has the same SHA-256 (`4c155573…c190`).
- **Not verified:** a real Stripe checkout or webhook, a real cloud backend, File System Access handle persistence across restarts,
  the clipboard and fullscreen inside a sandboxed viewer, Safari and Firefox, real touch hardware, screen readers, and the CI
  workflow on GitHub's own runners (its commands pass locally).

## Open questions and known gaps

- **Home navigation.** The dock has no Home item and the wordmark is not a link. From Load session and Presets the only way back to
  Home is Quit then Reopen; from Settings there is also the "See Home" button on Appearance; the player has its own Home button.
  Left as is: it is a design decision (there is a comment on it in the UI inventory doc).
- The Layers panel on a phone leaves the canvas about 94 px wide; it wants a bottom sheet.
- The phone dock shows icons without visible labels, and the phone transport drops frame steps, speed and volume.
- "Try the demo" in the New session dialog shows no loading state while the clips decode (the Home menu's Demo item does).
- The ember trail was measured in Chromium only. Firefox, Safari, a low-power phone and a very large 4K display are untested; if
  it is heavy anywhere, lower `SUBDIVIDE` or the mote count in `seedMotes` (both in `utils/embers.ts`), or turn it off with `stop()`.
- No HLS or DASH, no real payment verification, no real cloud backend (both have adapters ready: `billing.ts`, `cloud.ts`).
- `npm audit` reports two low-severity advisories (prototype poisoning in `deepmerge`, pulled in by `@sveltejs/vite-plugin-svelte`).
  It is a build-time dependency that never reaches the bundle, and no fix was available on 2026-11-07. Check again whenever
  dependencies are updated.

## Conventions

- Pages that sit beside the dock wrap their content in `<PageShell>` (Home and the player do not); the title is
  `<h1 class="title-wide text-[28px] md:text-[34px]">`.
- Free users: `settings.limits.maxCustomPresets` is 3 and `advancedSampler` is false. Gate with `<ProBadge />` and a button to
  `router.go({ name: 'settings', tab: 'subscription' })`.
- Never blur. Never shadow except on floating surfaces. No all caps, no eyebrows, no "·"-joined meta strings (use icons and separate
  spans). Home's title screen is the one exception to the shadow and capitals rules (see above); it still never blurs.
- Write long files in small pieces (outline first, then sections); one long response once hit the output limit.
- The code lives in the private GitHub repository `Sadaragavan/ReactionPlayer`, branch `main`. Make small commits and run the
  checklist in `CLAUDE.md` first; user-visible changes get a line under `[Unreleased]` in `CHANGELOG.md`.
- CI (`.github/workflows/ci.yml`) runs `npm ci`, `npm run check`, `npm run build` and `npm run build:single` on every push and pull
  request, and keeps the single-file build as a downloadable artifact for 14 days.
