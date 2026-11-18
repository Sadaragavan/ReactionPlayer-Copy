# Architecture

How Reaction Player is put together, and why. Read `README.md` first for what it does and how to run it.

## In one paragraph

A single-page Svelte 5 app with no backend. A **session** (two to four videos, their offsets, and where each one sits
on a black canvas) is the one piece of state that matters. **Stores** own state, the **engine** turns a session into
synchronised playback, **components** draw it, and a small **persistence** layer keeps it across visits. Payment and
cloud sync sit behind two narrow interfaces so a real server can be added without touching the UI.

```text
pages ──► components ──► stores (Svelte 5 runes) ◄──► engine (clock, sync, capture, layout maths)
                              │                              │
                              ▼                              ▼
                        persistence                    <video> elements
                  (LocalStorage + IndexedDB)       (one per session video)

billing.ts ◄── Subscription tab          cloud.ts ◄── session store (push) / Subscription tab (pull)
```

## Decisions that shape the code

- **State lives in class singletons with `$state` fields** (`session`, `settings`, `presets`, `router`, `ui`, `playback`).
  Components read them directly and re-render on change; nothing is passed through context or prop chains.
- **Coordinates are fractions of the canvas** (`0..1`). A layout means the same thing at any window size, and a fixed
  canvas aspect (16:9, 9:16, 4:3, 1:1, 21:9) keeps an alignment pixel-exact. `fill` follows the window instead.
- **The source is always on top.** `paintOrder()` is the only place that decides stacking, and both the live stage and
  the capture code use it.
- **One placement maths.** `utils/geometry.ts` (`videoPlacement`, `moveRect`, `resizeRect`, `snapMove`) and
  `engine/capture.ts` (`drawLayer`) are shared by the player, the alignment studio and the thumbnails, so what you
  align is what you get.
- **Hash routing** (`#/session`, …) needs no server rewrites and works from `file://`, a static host or a single inlined
  HTML file.
- **No blur, no shadow except on floating surfaces.** True `#000`, hairline borders, one yellow accent for live state.
  Tokens are in `src/app.css` under `@theme`. The root font size is 14 px, so Tailwind spacing scales with it.
- **Everything is gated through `settings.limits` / `settings.isPro`**, never by comparing plan strings.
- **Untrusted input is validated.** A session file loaded from disk goes through `engine/importConfig.ts`: every field is
  checked or clamped, ids are regenerated, and the layout comes back locked.

## Data model (`src/lib/types.ts`)

| Type | What it is |
| --- | --- |
| `Session` | `id`, `name`, `videos[]`, `alignment`, `canvasAspect`, `isLinked`, `isTheaterMode`, `masterId`, `clock`, `thumbnail`, timestamps (`lastModified` for the browser, `updatedAt` as the sync revision, `syncedAt`). |
| `SessionVideo` | `role` (`source`, `reaction`, `extra`), `kind` (`file` or `url`), `url`, `fileName`, `duration`, `currentTime`, `volume`, `muted`, `playbackRate`, `offsetMs`, `audioTrack`. |
| `Alignment` | `layoutType`, `locked`, `coordinates` (a `LayerTransform` per video id), `base` (the slots as last applied, so "Reset viewport alignment" knows where home is). |
| `LayerTransform` | A rect `x y w h` in canvas fractions, plus `crop {t r b l}`, `opacity`, `fit` (`contain` or `cover`) and `aspect` lock. |
| `Preset` | Slot-based, so it applies to any set of videos: slot 0 source, 1 reaction, 2 and 3 extras. Custom presets remember the canvas aspect they were aligned on. |
| `AppSettings`, `PlaybackPrefs`, `Profile` | Preferences, the plan (`userTier`, `billing`), and the local profile. |

Invariants: `masterId` is always one of `videos[].id`; the master's `offsetMs` is 0; a non-master video plays at
`local = master + offsetMs / 1000`.

## The player

### Stage and layers (`components/player`)

`Stage` draws the black canvas inside the space the HUD leaves free (`inset`), keeping the session's aspect ratio, and
renders one `Layer` per video in `paintOrder`. `Layer` positions itself with `rectToStyle`, shows the picture under
`fit` and `crop`, and wires pointer gestures from `actions/layerGesture.ts`: move, eight resize handles, edge and centre
snapping (`SNAP_DISTANCE`), a minimum size (`MIN_LAYER_SIZE`) and the aspect lock. The same gesture action drives the
alignment studio. Snap guides are drawn as one-pixel yellow lines. A locked alignment ignores gestures.

### Sync engine (`engine/playback.svelte.ts`, `timeline.ts`, `track.ts`)

`Track` wraps one `<video>`. It listens to lifecycle events and, through `requestVideoFrameCallback`, measures the real
frame rate from the gap between consecutive presented frames (median of the last 15, snapped to common rates).
Stepping and paused seeks depend on that number; until it is measured the engine assumes 30 fps.

`PlaybackEngine` is the shared clock and transport:

- **Linked.** The master video's playhead is the clock `T` (negative when another video starts first). Each follower is
  checked against `T` on every master frame and on a ~12 ms animation-frame loop. `planCorrection` decides: leave it
  alone under the tolerance (default 20 ms), nudge `playbackRate` by at most ±8 % for moderate drift (with hysteresis
  so it does not flutter), hard-seek beyond `HARD_SEEK_THRESHOLD_S` (0.35 s).
- **Unequal lengths.** The timeline is the union of all footage (`timelineRange`). A video whose local time is outside
  `[0, duration)` is parked on its first or last frame while the clock keeps running (a virtual clock advances by frame
  delta when the master has no footage). Playback ends only when every video has ended. A single frame step follows the
  video that is on screen. With `audioFollowsFootage`, the sound of a master that has no footage is lent to the first
  video that does.
- **Unlinked.** Every element plays on its own; the HUD scrubs and steps them one by one so offsets can be dialled in by
  eye. Linking captures the playheads as offsets (`offsetsFromLocals`) so nothing jumps; changing the master rebases them
  (`rebaseOffsets`).
- **Frames.** `frameIndexAt` and `frameCentre` make paused seeks land in the middle of a frame, so stepping is
  deterministic rather than subject to floating-point noise.
- The engine reports `playing`, `clock`, `times`, `running`, `dims`, `fps`, `failed` and `buffering` as reactive state,
  and writes playheads back to the session store (`recordTimes`) about once a second so a reload resumes in place.

### HUD (`components/session`, `pages/Session.svelte`)

The controls dock to the window edges rather than floating over the picture: `TopBar` (44 px), `Transport` at the
bottom (one 36 px lane per video when unlinked, a single master lane when linked, morphing between them over 380 ms), and
the optional `LayersPanel` (296 px) on the right. `metrics.ts` holds those numbers and the canvas follows them with the
same easing. The HUD fades after `hudAutoHideMs` of stillness; theater mode removes it. Keyboard handling is one
`onkeydown` in `Session.svelte` (see `SHORTCUTS` in `constants.ts` for the list), and it steps aside while you type, while
a menu or dialog is open, and for Ctrl/Cmd/Alt chords.

### Home (`pages/Home.svelte`, `components/home/`)

Home is the app's title screen and the one page not set like the rest (the rules, and where they stop, are under "The one
exception" in `docs/PROGRESS.md`). `Home.svelte` is one box that is also the drop target for videos (`use:dropzone`, which opens
New session with the files). Inside it, bottom to top: the wallpaper (an `<img>` with `object-fit: cover`, so a GIF animates, and
never blurred) or a faint warm light on black; an edge shade for legibility; `TitleMenu`; and `EmberTrail`.

`TitleMenu` is a CSS grid: the wordmark and profile button on top, the menu bottom-left (a large lead item, a row of items, a row
of small links) and the plan block bottom-right. The lead is "Continue", with the last session's name and age, when
`session.lastSession` exists, and "New session" otherwise. The plan block is built from `settings.limits` (and `TIER_LIMITS.pro`
for the line about Pro), so it says what the code enforces. `engine/appActions.ts` holds `continueLast` and `quitApp`, which the
Dock shares. Arrow keys walk the buttons in reading order, only while focus is already inside the menu so dialogs keep their keys.

`use:streak` (`actions/streak.ts`) gives every item its hover line. It writes the pointer's x inside the element to `--sx` and sets
`data-hot` while the item is hovered or has keyboard focus; the stylesheet draws the line (`::after`) and its bright head
(`::before`) from those two. Keyboard focus lights the full width.

`EmberTrail` mounts an `EmberField` (`utils/embers.ts`, plain TypeScript) on a `pointer-events: none` canvas blended with
`screen`. The field follows the pointer with a spring (the comet head), keeps the last 720 ms of positions and draws them as a
tapered ribbon in three additive passes (haze, body, hot core), with a head, a few shed sparks and slow drifting motes. Its frame
loop runs only while something is moving, at about half rate when only motes are, and it stops when Home unmounts, pauses while
the tab is hidden, and stays off under `prefers-reduced-motion`. Touch only bursts sparks where it lands.

## State and persistence

| Store | Owns |
| --- | --- |
| `session` | The open session (`current`), snapshots of all saved ones (`saved`), layer and video mutations, create/open/duplicate/remove/rename, export, import, `syncAll`. Every mutation schedules a debounced save. |
| `settings` | `AppSettings`, the profile, the wallpaper, and the derived `limits`, `isPro`, `playback`. |
| `presets` | Built-in standard presets plus the user's, capped by `limits.maxCustomPresets`. |
| `router` | The hash route, `go()` and `hrefFor()`. |
| `ui` | Toasts, the context menu, the New Session and shortcuts dialogs, the dormant "Quit" screen. |

`stores/persistence.ts` splits storage by size and shape. **LocalStorage** holds small synchronous values (settings,
profile, last session id). **IndexedDB** (`reaction-player`) holds `sessions`, `presets`, `handles` (File System Access
handles), `kv` (the wallpaper, which can be megabytes) and `cloud` (the demo mirror). Every call is wrapped, so a blocked
or full store degrades to "not saved". `App.svelte` boots `settings`, `session` and `presets` together, then renders the
route; it flushes the session on `pagehide` and when the tab is hidden.

Local video files cannot be persisted, so `engine/media.ts` keeps a registry of blob URLs. A session stores only the file
name. On resume the registry tries the saved file handle (Chromium); otherwise the player shows **Choose file** on
exactly the layers that need it. The sample clips use a `demo:source` / `demo:reaction` scheme (`engine/demo.ts`), so saved
demo sessions survive a rebuild that changes the hashed asset names.

## Presets and the alignment studio (`components/presets`)

Presets are slots, so they apply to any session; `coordinatesToSlots` and `slotsToCoordinates` convert between a
session's per-video layout and a preset. Applying a custom preset also restores the canvas aspect it was aligned on.
The studio (`studio.svelte.ts`, with `sampling.ts` for loading clips and grabbing frames) lets you pick a frame from each
video, then place the layers over each other in one of three views: normal, onion skin (the source turns see-through) or
a wipe line. Views change what is drawn, never what is saved. Free keeps captures one at a time; Pro also keeps the last
eight per video. Saving writes a preset with a composed thumbnail.

## Server seams

- **`billing.ts`.** `BillingAdapter` (`startCheckout`, `portalUrl`, `live`). `StripeLinkAdapter` is used when
  `VITE_STRIPE_LINK_MONTHLY` or `VITE_STRIPE_LINK_YEARLY` is set; otherwise `DemoAdapter` flips the plan on this device.
  A browser cannot prove a payment, so production needs a webhook that grants the entitlement and a replacement for the
  `settings.setTier('pro')` call in `SubscriptionTab.svelte`.
- **`cloud.ts`.** `CloudSyncAdapter` (`push`, `pull`, `isAvailable`). The default `LocalMirrorAdapter` copies sessions
  into the `cloud` IndexedDB store. The session store pushes after saves when `limits.cloudSync` is true; "Sync now"
  pushes and pulls. Conflicts compare `updatedAt`.

## Build and delivery

`vite.config.ts` uses `base: './'` and a `$lib` alias. `npm run build` writes `dist/`. `npm run build:single` adds
`vite-plugin-singlefile`, which inlines JS, CSS, the fonts and the sample clips into one `dist/index.html` (about 1 MB);
it also writes into `dist/`, so copy the file out before rebuilding. The hosted live preview is that file wrapped as an
artifact page (title, a dark `color-scheme`, a black ground, then the inlined CSS and module script).

Tailwind's automatic class detection is switched off in `src/app.css` (`source(none)`) and pinned to `src/` and `index.html`
with `@source`. Left on, it also reads `docs/`, the README and any old build in `dist/`, which feeds stale class names back
into the stylesheet and makes a fresh build differ from the one that was tested. Markup added outside `src/` needs its own
`@source` line.

## How it was checked

- `npm run check` (svelte-check) is clean: 0 errors, 0 warnings.
- Nine Playwright suites in headless Chromium, run against the production build (the engine-level length suite needs the dev
  server; the smoke, transport, session and length suites were repeated on the single-file build), and the final build was
  opened once in the artifact viewer:
  smoke and sync; transport (frame stepping, link and unlink, offset capture: a 264 ms nudge while unlinked became
  +1764 ms when relinked); session HUD, menus, theater and shortcuts; every page including wallpaper upload and link;
  a 390 px phone layout; menus and flows (preset apply, Presets to new session, Quit and Reopen); a sandbox simulation
  (blocked storage, a throwing file picker, a rejecting clipboard, refused fullscreen); unequal lengths through the engine
  (54 checks) and through the real screens (13 checks).
- The Home title screen was added later and checked on the dev server (menu actions, keyboard, Pro, reduced motion, paint
  rates, touch, and layout at 13 sizes); the details are in the verification log in `docs/PROGRESS.md`.
- Not verifiable here: a real Stripe checkout or webhook, a real cloud backend, File System Access handle persistence
  across restarts (it needs a real permission prompt), the clipboard and fullscreen inside a sandboxed viewer, Safari and
  Firefox, real touch hardware (touch was emulated), and screen readers.

## Extending it

- **A page.** Add a `RouteName` in `types.ts`, parse it in `router.svelte.ts`, render it in `App.svelte`, and wrap its
  content in `PageShell`. Add a `Dock` item if it needs one, and a button in `TitleMenu.svelte` if it should be reachable from Home.
- **A setting.** Add the field to `PlaybackPrefs` or `AppSettings`, a default in `DEFAULT_SETTINGS`, and a `SettingRow` in the
  matching tab. Old saved settings are merged over the defaults, so no migration is needed.
- **A shortcut.** Add it to the `switch` in `Session.svelte` and to `SHORTCUTS` in `constants.ts` so the dialog lists it.
- **A paid feature.** Add a field to `TierLimits`, set it in `TIER_LIMITS`, read it through `settings.limits`, and show a
  `ProBadge` where it is locked. The plan table in the Subscription tab should say the same thing the code enforces.
- **Real billing or sync.** Implement `BillingAdapter` or `CloudSyncAdapter` and assign it to `billing.adapter` or
  `cloud.adapter` before the app mounts.

## Known gaps

Recorded from the UI review; none block use.

- The Layers panel on a phone leaves the canvas about 94 px wide; it wants a bottom sheet.
- The dock has no Home item and the wordmark is not a link. From Load session and Presets the only way back to Home is Quit
  then Reopen; from Settings there is also the "See Home" button on Appearance; the player has its own Home button.
- The phone dock shows icons without visible labels, and touch screens have no tooltips.
- "Try the demo" in the New session dialog shows no loading state while the clips decode (the Home menu's Demo item does).
- The ember trail on Home was measured in Chromium only.
- The phone transport drops frame steps, speed and volume; speed is still in the right-click menu.
- No HLS or DASH, and no real payment verification or cloud backend.
