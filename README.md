# Reaction Player

A frame-accurate reaction player, as a native desktop app for **Arch Linux (Wayland first)**, Windows and macOS. The
source video and your reaction sit as layers on a pure-black canvas. Every layer can be moved, resized, cropped and
**stacked in any order**, and one shared clock keeps them together. The interface stays out of the way: black, a
single yellow accent, no blur.

Electron · Svelte 5 · Vite · Tailwind 4 · Lucide · no backend, no account, no plans: every feature is on for everyone.

## Run it

```bash
npm install
npm run dev            # the desktop app, with hot reload
npm run dev:web        # the same UI in a browser at http://localhost:5173 (for quick UI work; see "In a browser" below)
npm run check          # svelte-check + tsc for renderer, main and preload; expect 0 errors and 0 warnings
npm test               # vitest: z-order, hit-testing, timeline maths, Range parsing, storage, import
npm run build          # production bundle of main, preload and renderer into out/
npm run preview        # run the production bundle in Electron
```

Needs Node 20.19+ or 22.12+.

### Packaging

```bash
npm run dist:linux     # release/*.pacman, *.AppImage, *.tar.gz (x64)
npm run dist:win       # release/*-setup.exe (NSIS) and *-portable.exe (x64)
npm run dist:mac       # release/*.dmg and *.zip (x64 and arm64, unsigned)
```

Building the Arch `.pacman` package needs `bsdtar` (`libarchive-tools` on Debian and Ubuntu, `libarchive` on Arch).
Windows and macOS packages are built on their own systems; the GitHub workflow does all three.

### Install on Arch / Omarchy

Download `reaction-player-<version>-linux-x64.pacman` from the workflow run's artifacts (or a release), then:

```bash
sudo pacman -U reaction-player-*.pacman
```

It installs to `/opt/Reaction Player/` with a desktop entry (category AudioVideo) and an icon. The AppImage runs on
any distribution: `chmod +x reaction-player-*.AppImage && ./reaction-player-*.AppImage`.

## What is in it

| Screen | Route | What it does |
| --- | --- | --- |
| Home | `#/` | A title screen. **Continue** (or **New session** before the first one) in large type, then Load, Presets, Demo and Settings. Drop videos anywhere to start a session. Your wallpaper (image or GIF, never blurred) is its artwork; without one it is black. |
| New session | dialog | Pick a layout (split, grid, picture-in-picture) or a preset, add two to four videos from files or links, name it. |
| Session | `#/session` | The player. Layers on the black canvas, controls docked to the window edges, theater mode, native fullscreen, right-click menu, layers panel. |
| Load session | `#/sessions` | Saved sessions with a thumbnail, rename, duplicate, delete, export and import of a layout file (native save and open dialogs). |
| Presets | `#/presets` | Standard and custom layouts (no limit), plus the alignment studio: grab a frame from each video, compare with onion skin or a wipe line, align, save. The studio keeps the last eight captures per video. |
| Settings | `#/settings/<tab>` | Appearance (wallpaper) and Preferences (sync engine, playback, controls, your data folder). |

### The player

- **Layers.** Drag to move, eight handles to resize, snap to the canvas edges and centre. Crop, opacity, fit and
  aspect lock per layer. Lock the layout so nothing moves by accident. Up to four videos, any resolution the machine can decode.
- **Layer order (z-order).** Every layer has a `zIndex`. Layers are painted from the lowest to the highest, and a click is
  tested from the highest down, skipping hidden and locked layers, so a locked layer lets clicks through to what is under it.
  Change the order in three places:
  - **Layers panel (`P`)**: drag a row, or use its up and down arrows. Each row also has a lock and a hide toggle.
  - **Right-click a layer**: Bring to front, Bring forward, Send backward, Send to back.
  - **Keyboard**: `]` forward, `[` backward, `Shift` + `]` to the front, `Shift` + `[` to the back.
  New layouts start with the source on top; there are also presets with the reaction in a corner on top of the source.
  Sessions, exported layout files and presets all keep `zIndex`; older saves that lack it open with the old source-on-top order.
- **Canvas.** 16:9, 9:16, 4:3, 1:1, 21:9, or fill the window. A fixed shape keeps an alignment exact at any window size.
- **Sync.** Linked mode runs every video from one master clock, each with its own offset (steppers for ±1, ±10 and
  ±100 ms). Small drift is absorbed by a barely audible speed nudge, large drift by a seek.
  Unlinked mode plays and scrubs each video on its own so you can find the offset by eye, then link.
- **Frame stepping.** `,` and `.` step one frame using the frame rate measured from the video itself.
- **Videos of different lengths.** The timeline is the union of all footage. A video that has not started yet, or
  has ended, waits on its first or last frame while the others play, and playback stops when every video has ended.
- **Copy frame** (right-click a layer) puts that video's current picture, with its crop, on the system clipboard through
  Electron's native clipboard, so it works the same on Wayland, X11, Windows and macOS.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play or pause everything |
| `L` | Link or unlink the timelines |
| `T` | Theater mode |
| `F` | Fullscreen (the native window) |
| `←` `→` | Seek by the Preferences step (5 s by default); one frame while paused |
| `Shift` + `←` `→` | Always the full step, even while paused |
| `,` `.` | One frame back or forward |
| `M` | Mute the master audio |
| `P` | Layers panel |
| `]` / `[` | Bring the selected layer forward / send it backward |
| `Shift` + `]` / `Shift` + `[` | Bring the selected layer to the front / send it to the back |
| `Esc` | Leave theater mode, then deselect, then close the panel |
| `?` | Show the shortcuts (works on every screen) |

In the alignment studio `,` `.` step the sampled video, `C` captures the frame, and the wipe line moves with the arrow keys (1 %, Shift for 10 %).

## Your videos and your data

- **Local videos are remembered by path.** A video you pick with the native dialog or drop on the window is stored in the
  session as its absolute path and played through the `local-media://` protocol, which serves the file from disk with
  full HTTP `Range` support (`206 Partial Content`). Seeking, scrubbing and frame stepping are instant and nothing is
  loaded into memory. Reopen the app and the session continues; only a file you moved or deleted asks for **Choose file**.
  The protocol serves only video and picture file types, and only to the app's own window.
- **Remote links** work too. The app relaxes the CORS headers of remote video responses, so **Copy frame** and the
  alignment studio can read their pixels.
- **Everything is a plain file** in the app's data folder, written atomically:
  - Linux: `~/.config/reaction-player`
  - Windows: `%APPDATA%\reaction-player`
  - macOS: `~/Library/Application Support/reaction-player`

  `settings.json`, `presets.json`, `sessions/<id>.json`, `thumbnails/` and `wallpapers/`. Preferences → Open folder shows it.
- **Playback** uses Chromium's hardware decoding. On Linux the app starts with VA-API enabled
  (`VaapiVideoDecodeLinuxGL`, `VaapiVideoDecoder`), `--ozone-platform-hint=auto` (native Wayland under Hyprland, X11
  elsewhere), GPU rasterization and zero-copy, so two 1080p60 videos decode on the GPU. You need a working VA-API
  driver (`libva-mesa-driver`, `intel-media-driver` or `libva-nvidia-driver`; check with `vainfo`). Containers: MP4, MKV, WebM, MOV;
  codecs: H.264, VP8/VP9, AV1 and AAC/Opus/Vorbis as Chromium supports them.

### In a browser

`npm run dev:web` runs the same interface without Electron, with browser fallbacks: IndexedDB and LocalStorage for storage,
`<input type="file">` and the File System Access API for videos (blob URLs, so local files need **Choose file** after a
reload), the browser clipboard, and downloads. It exists for testing the UI; the desktop app is the product.

## Project layout

```text
electron/
  main.ts                           window, Chromium flags, local-media:// protocol, CORS relaxing, IPC
  preload.ts                        the typed window.electronAPI bridge (contextIsolation, sandbox)
  media.ts, range.ts                the Range-serving protocol handler and its header parser
  storage.ts                        atomic file persistence in the data folder
src/
  shared/                           the IPC contract (api.ts) and local-media URL helpers, used by both sides
  App.svelte, main.ts, app.css      shell, global layers, design tokens (@theme) and base styles
  assets/demo/                      the two sample clips; fonts/ holds Archivo (variable width) and Cinzel, with their licences
  lib/
    pages/                          Home, Session, Presets, Sessions, Settings
    components/                     home, player, presets, session, sessions, settings, shell, ui
    engine/                         playback (clock + sync), timeline, track, layouts, zorder, migrate, capture, media, probe, demo, sessionFactory, appActions
    stores/                         session, settings, presets, router, ui, persistence (Svelte 5 runes)
    platform/                       `desktop` / `isDesktop`: the Electron bridge, or null in a browser
    actions/                        tooltip, dropzone, dom (portal, focus trap, click outside), layerGesture, streak
    utils/                          geometry, format, file, fullscreen, embers
    types.ts, constants.ts          shared contracts, limits, defaults, shortcuts
tests/                              vitest suites
build/icon.png                      the app icon (electron-builder derives .ico and .icns from it)
electron.vite.config.ts             desktop build (main, preload, renderer); vite.config.ts is the browser dev server
electron-builder.yml                packaging targets
docs/ARCHITECTURE.md                how the pieces fit
docs/PROGRESS.md                    status, decisions and what was verified
scripts/make-demo-clips.sh          regenerates the sample clips (needs ffmpeg with libvpx-vp9, libopus, drawtext)
.github/workflows/build-desktop.yml type check, tests and a Linux, Windows and macOS build on every push
CHANGELOG.md                        what changed in each version
CLAUDE.md                           the checklist and the easy-to-break rules for anyone changing the code
```

## CI

`.github/workflows/build-desktop.yml` runs on every push, on pull requests, on manual dispatch and on `v*` tags:
`npm ci && npm run check && npm test`, then builds on `ubuntu-latest`, `windows-latest` and `macos-latest`. The installers
(`.pacman`, `.AppImage`, `.tar.gz`, `.exe`, `.dmg`, `.zip`) are uploaded as workflow artifacts on every run, and a `v*`
tag attaches them to a GitHub Release. The macOS build is unsigned (there is no Apple certificate): open it with
right-click → Open the first time. The Windows installer is unsigned too, so SmartScreen may warn.

## More

- `docs/ARCHITECTURE.md` explains the data model, the sync engine, the layer maths and the persistence layer.
- `docs/PROGRESS.md` records what was built, the design rules, and what was tested and how.
- `CHANGELOG.md` lists what changed in each version. Before a commit, run the checklist in `CLAUDE.md`.
- The sample clips flash and beep at the same moment but at different times, so the reaction needs `+1500 ms`
  to line up. That is what the demo session ships with, and it is a quick way to try the offset stepper.
