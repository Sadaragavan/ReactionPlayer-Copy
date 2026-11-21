# Architecture

How Reaction Player is put together, and why. Read `README.md` first for what it does and how to run it.

## In one paragraph

An Electron app: a small main process (`electron/`) owns the window, the files and the `local-media://` protocol, and a single-page
Svelte 5 renderer (`src/`) does everything else. There is no backend. A **session** (two to four videos, their offsets, and where each one sits
on a black canvas) is the one piece of state that matters. **Stores** own state, the **engine** turns a session into
synchronised playback, **components** draw it, and a small **persistence** layer keeps it across visits. The renderer reaches the system only through the typed `window.electronAPI` bridge.

```text
pages ──► components ──► stores (Svelte 5 runes) ◄──► engine (clock, sync, capture, layout maths)
                              │                              │
                              ▼                              ▼
                        persistence                    <video> elements
                  (files in the data folder)       (one per session video)

window.electronAPI (preload) ◄── IPC ──► electron/main.ts: files, dialogs, clipboard, fullscreen, local-media://
```

## Decisions that shape the code

- **State lives in class singletons with `$state` fields** (`session`, `settings`, `presets`, `router`, `ui`, `playback`).
  Components read them directly and re-render on change; nothing is passed through context or prop chains.
- **Coordinates are fractions of the canvas** (`0..1`). A layout means the same thing at any window size, and a fixed
  canvas aspect (16:9, 9:16, 4:3, 1:1, 21:9) keeps an alignment pixel-exact. `fill` follows the window instead.
- **Stacking is explicit.** Every `LayerTransform` has a `zIndex`. `engine/zorder.ts` sorts (`sortByZ`), hit-tests (`hitTest`) and reorders
  (`reorder`); the live stage, the capture code, the layer panel and the studio all use it. `engine/migrate.ts` gives old saves a `zIndex`.
- **One placement maths.** `utils/geometry.ts` (`videoPlacement`, `moveRect`, `resizeRect`, `snapMove`) and
  `engine/capture.ts` (`drawLayer`) are shared by the player, the alignment studio and the thumbnails, so what you
  align is what you get.
- **Hash routing** (`#/session`, …) needs no server rewrites and works from `file://`, a static host or a single inlined
  HTML file.
- **No blur, no shadow except on floating surfaces.** True `#000`, hairline borders, one yellow accent for live state.
  Tokens are in `src/app.css` under `@theme`. The root font size is 14 px, so Tailwind spacing scales with it.
- **No tiers.** Every feature is on. The only limit is four videos.
- **Untrusted input is validated.** A session file loaded from disk goes through `engine/importConfig.ts`: every field is
  checked or clamped, ids are regenerated, and the layout comes back locked.

## Data model (`src/lib/types.ts`)

| Type | What it is |
| --- | --- |
| `Session` | `id`, `name`, `videos[]`, `alignment`, `canvasAspect`, `isLinked`, `isTheaterMode`, `masterId`, `clock`, `thumbnail`, timestamps (`lastModified`, `updatedAt`). |
| `SessionVideo` | `role` (`source`, `reaction`, `extra`), `kind` (`file` or `url`), `url`, `filePath` (a local file's absolute path), `fileName`, `duration`, `currentTime`, `volume`, `muted`, `playbackRate`, `offsetMs`, `audioTrack`. |
| `Alignment` | `layoutType`, `locked`, `coordinates` (a `LayerTransform` per video id), `base` (the slots as last applied, so "Reset viewport alignment" knows where home is). |
| `LayerTransform` | A rect `x y w h` in canvas fractions, plus `zIndex` (higher is on top), `hidden`, `locked`, plus `crop {t r b l}`, `opacity`, `fit` (`contain` or `cover`) and `aspect` lock. |
| `Preset` | Slot-based, so it applies to any set of videos: slot 0 source, 1 reaction, 2 and 3 extras. Custom presets remember the canvas aspect they were aligned on. |
| `AppSettings`, `PlaybackPrefs` | Preferences. |

Invariants: `masterId` is always one of `videos[].id`; the master's `offsetMs` is 0; a non-master video plays at
`local = master + offsetMs / 1000`.

## The player

### Stage and layers (`components/player`)

`Stage` draws the black canvas inside the space the HUD leaves free (`inset`), keeping the session's aspect ratio, and
renders one `Layer` per video, bottom to top by `zIndex` (`videosByZ`). A `Layer` is only drawn: it positions itself with
`rectToStyle`, shows the picture under `fit` and `crop`, and ignores the pointer (its resize grips are the one exception).

The **Stage owns the pointer**. A press is turned into canvas fractions and tested with `hitTest` from the highest `zIndex` to the
lowest, skipping hidden and locked layers. The layer it finds is selected, played or paused (when the alignment is locked), given
the right-click menu, or dragged with `beginGesture` from `actions/layerGesture.ts`: move, eight resize handles, edge and centre
snapping (`SNAP_DISTANCE`), a minimum size (`MIN_LAYER_SIZE`) and the aspect lock. The studio binds the same gesture to its own
layers with `use:layerGesture`. Snap guides are drawn as one-pixel yellow lines. A locked alignment ignores drags. A hidden layer is
drawn at zero opacity rather than removed, so its video keeps presenting frames and stays in sync.

Stacking changes go through `session.reorderLayer(id, op)` (`front`, `forward`, `backward`, `back`) and `session.setStackOrder`
(drag and drop); both re-number the stack 0…n-1. The menu, the `[` `]` shortcuts and the Layers panel all call them.

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
of small links) and the version bottom-right. The lead is "Continue", with the last session's name and age, when
`session.lastSession` exists, and "New session" otherwise. `engine/appActions.ts` holds `continueLast` and `quitApp`, which the
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
| `session` | The open session (`current`), snapshots of all saved ones (`saved`), layer and video mutations, stacking, create/open/duplicate/remove/rename, export, import. Every mutation schedules a debounced save. |
| `settings` | `AppSettings`, the wallpaper, and `playback`. |
| `presets` | Built-in standard presets plus the user's. |
| `router` | The hash route, `go()` and `hrefFor()`. |
| `ui` | Toasts, the context menu, the New Session and shortcuts dialogs. |

`stores/persistence.ts` has one API and two backends. On **desktop** every call goes over IPC to `electron/storage.ts`, which keeps
`settings.json` (a flat key → value object; the settings store and the last session id), `presets.json`, `sessions/<id>.json`, the
thumbnails (cut out of the JSON into `thumbnails/`) and the wallpaper (`wallpapers/`) in the data folder (`app.getPath('userData')`).
Writes are atomic (temp file, then rename), queued per file, and awaited before the app quits; an unreadable file is renamed
`*.corrupt-<time>`, never deleted. In a **browser** the same calls use LocalStorage and IndexedDB. `App.svelte` awaits
`initPersistence()` (it loads `settings.json`), then boots `settings`, `session` and `presets` together and renders the route; it
flushes the session and the settings on `pagehide`. Anything read back from storage goes through `engine/migrate.ts`.

Local videos on desktop are stored as `SessionVideo.filePath`. `engine/media.ts` turns a path into `local-media://media/<path>`
(`src/shared/mediaUrl.ts`); `electron/media.ts` serves it from disk with `Range` support (`electron/range.ts`) and only for video
and picture extensions. On open, `restoreSessionMedia` checks that each path still exists; those that do not show **Choose file**.
In a browser the registry keeps blob URLs and File System Access handles instead. The sample clips use a `demo:source` /
`demo:reaction` scheme (`engine/demo.ts`), so saved demo sessions survive a rebuild that changes the hashed asset names.

## Audio tracks and subtitles

Chromium's `video.audioTracks` exists only with the `AudioVideoTracks` Blink feature, which `electron/main.ts` switches on; the layer menu
lists them and `SessionVideo.audioTrack` (re-applied by `playback.#applyAudioTrack` when the video loads) remembers the choice. Chromium never exposes
subtitles stored in a container, so `electron/tracks.ts` reads them: it lists the audio and subtitle tracks of Matroska/WebM and the subtitle
tracks of MP4, and extracts the text of SubRip, ASS/SSA (MKV) and `tx3g` (MP4) tracks by walking only the file's structure (seeking past the
media data). `src/shared/subtitles.ts` parses `.srt`, `.vtt` and `.ass` files and finds the cues at a time. `engine/subtitles.svelte.ts` holds each layer's
cues and the probe results; `Layer` loads them for `SessionVideo.subtitle` and `SubtitleOverlay` draws them. Both choices are saved per video
(and per playlist episode, mirrored like the other fields).

## Source playlists

A reactor may react to several episodes, so the source layer can hold a playlist (`SessionVideo.sources`, `sourceIndex`, `firstOffsetMs`).
`engine/playlist.ts` places the episodes on the timeline: the first where `firstOffsetMs` puts it, each later one after the previous ends plus
its `gapMs`, or not at all (`gapMs: null`) until the user starts it. The layer mirrors the current episode's fields (`mirrorCurrentItem`), so
the sync engine still sees one video per layer; a `waiting` layer is inactive and parked on its first frame (`timeline.ts`). The reaction keeps
the clock (a playlist cannot be the master). Linked, `playback.#followPlaylist` swaps the episode by the clock (`sourceIndexAt`), the moment
the previous one ends; unlinked, an `ended` event does. `startNextSource` turns "now" into the episode's break. `timelineVideos()` gives the
whole playlist's stretch to `timelineRange`. `SourcePrompt` asks to start a waiting episode, or to add one when the reaction outlasts the source.

Unlinked, the keyboard acts on `session.activeVideo` (the last clicked or selected layer); linked it acts on the whole frame.

## The desktop shell (`electron/`)

- `main.ts` sets the Chromium switches before `ready` (on Linux: `ozone-platform-hint=auto`, VA-API decode features, Wayland window
  decorations; everywhere: `ignore-gpu-blocklist`, GPU rasterization, zero-copy), registers the privileged `local-media` scheme, and
  opens one black, dark-themed window with `contextIsolation`, `sandbox` and no Node integration. The window never navigates
  away; external links open in the system browser. Permission requests are denied.
- IPC handlers check that the sender is our window showing our page (`trusted`) and validate their arguments.
- `onHeadersReceived` rewrites the CORS headers (`Access-Control-Allow-Origin: *`, `Cross-Origin-Resource-Policy: cross-origin`) of
  media responses, so remote videos do not taint the canvas.
- Fullscreen is the native window; Copy frame writes a PNG with Electron's clipboard; session export and import use the native
  save and open dialogs. Quit closes the app after queued writes finish.
- `preload.ts` is the only bridge. It is built as CommonJS (a sandboxed preload cannot be an ES module).

## Presets and the alignment studio (`components/presets`)

Presets are slots, so they apply to any session; `coordinatesToSlots` and `slotsToCoordinates` convert between a
session's per-video layout and a preset. Applying a custom preset also restores the canvas aspect it was aligned on.
The studio (`studio.svelte.ts`, with `sampling.ts` for loading clips and grabbing frames) lets you pick a frame from each
video, then place the layers over each other in one of three views: normal, onion skin (the source turns see-through) or
a wipe line. Views change what is drawn, never what is saved. Each video keeps its last eight captures. Saving writes a preset with a composed thumbnail.

## Build and delivery

`electron.vite.config.ts` builds three targets with electron-vite: main (ESM, `out/main`), preload (CommonJS, `out/preload`) and the
Svelte renderer (`out/renderer`, `base: './'` so it loads from `file://`). `vite.config.ts` is the plain browser dev server and build
(`npm run dev:web`). `electron-builder.yml` packages `out/` into `release/`; the GitHub workflow runs the checks, then builds on
Linux, Windows and macOS.

Tailwind's automatic class detection is switched off in `src/app.css` (`source(none)`) and pinned to `src/` and `index.html`
with `@source`. Left on, it also reads `docs/`, the README and old builds, which feeds stale class names back
into the stylesheet and makes a fresh build differ from the one that was tested. Markup added outside `src/` needs its own
`@source` line.

## How it was checked

- `npm run check` is clean (0 errors, 0 warnings) and `npm test` passes: z-order sorting, reordering and hit-testing, migration of
  saves without `zIndex`, union timeline maths, `Range` parsing, the `local-media://` handler against real files, atomic storage and
  session import.
- The built app was run in Electron (under Xvfb) and driven with Playwright: `window.electronAPI` is present and Node is not; a `Range`
  request to `local-media://` answers `206`; a non-media file is refused; a `crossorigin` video from `local-media://` draws to a canvas without
  tainting it; the native clipboard write and fullscreen work; the z-order shortcuts, the context menu and locking behave; a session
  and its stacking survive a restart; a saved local path reopens by itself and a missing one shows **Choose file**.
- The Linux packages (`.pacman`, `.AppImage`, `.tar.gz`) were built, and the unpacked app started and served `local-media://`.
- **Not verified here:** Windows and macOS builds (the workflow builds them), VA-API decoding on real Wayland hardware (the test
  machine had no GPU), the clipboard on a real Wayland session, and dragging a file from a file manager (the drop handler uses
  `webUtils.getPathForFile`, which needs a real drop).

## Extending it

- **A page.** Add a `RouteName` in `types.ts`, parse it in `router.svelte.ts`, render it in `App.svelte`, and wrap its
  content in `PageShell`. Add a `Dock` item if it needs one, and a button in `TitleMenu.svelte` if it should be reachable from Home.
- **A setting.** Add the field to `PlaybackPrefs` or `AppSettings`, a default in `DEFAULT_SETTINGS`, and a `SettingRow` in the
  matching tab. Old saved settings are merged over the defaults, so no migration is needed.
- **A shortcut.** Add it to the `switch` in `Session.svelte` and to `SHORTCUTS` in `constants.ts` so the dialog lists it.
- **A system call.** Add the method to `ElectronAPI` in `src/shared/api.ts`, implement it in `electron/preload.ts` (one `invoke`), handle it in
  `electron/main.ts` with `handle()` (sender check, argument validation), and give the caller a fallback for the browser.

## Known gaps

Recorded from the UI review; none block use.

- The Layers panel on a phone leaves the canvas about 94 px wide; it wants a bottom sheet.
- The phone dock shows icons without visible labels, and touch screens have no tooltips.
- "Try the demo" in the New session dialog shows no loading state while the clips decode (the Home menu's Demo item does).
- The ember trail on Home was measured in Chromium only.
- The phone transport drops frame steps, speed and volume; speed is still in the right-click menu.
- No HLS or DASH.
- In the alignment studio, onion skin and wipe act on the source layer, which may no longer be the top one now that layers can be reordered.
