# Changelog

Notable changes to Reaction Player. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the version matches `package.json`.

## [Unreleased]

### Changed: clearer text, quieter terminal

- Wording across the app is shorter and plainer (settings hints, toasts, errors, prompts), uses contractions, and is American English throughout ("color", "gray").
  The new-session hint no longer says the source "always sits on top", which stopped being true when layers became reorderable.
- The eyedropper now says so when the system won't let the app read the screen (on Windows, Graphics Capture can refuse), instead of failing silently.
- Chromium's internal error lines (for example the `wgc_capture_source` ones from a denied screen capture) are no longer printed to the terminal. Set `RP_DEBUG=1` to see them. On Windows the app also
  prefers the older screen-capture path, which avoids that refusal.

### Added: a color picker

- **Settings → Appearance → Colors** now chooses where the colors come from: **Classic**, **From wallpaper**, or **Custom**.
- **Custom** has a picker for the accent and one for the second accent: a swatch that opens the system color picker, a hex field (`#rgb` or `#rrggbb`), quick colors (including the two found in your wallpaper),
  and an **eyedropper** that reads any pixel on the screen. Changes apply live. The second accent can be left to the app, which makes one 40° round the color wheel from the accent.
- A color too dark to read on black is made lighter (keeping its hue), and the page says so. "Keep the black base" works with Custom as well.
- Older saves that had the wallpaper switch on keep it on (it becomes the "From wallpaper" choice).

### Changed: wallpaper colors are opt-in, with a black-base mode

- **Picking a wallpaper asks first.** If it has color in it, a prompt previews the accent, second accent and glow and asks "Use the wallpaper's colors?". Nothing changes until you say yes, and the colors stay off by default.
  "Do not ask again" (also in Appearance) stops the prompt.
- **Keep the black base** (on by default, for OLED screens): only the accent colors and the Home glow and cursor animation change. Turn it off to tint the text, lines and hover tones too. Backgrounds are black either way.
- With the colors on, a new wallpaper applies its colors straight away.
- The Master audio hint now says the master provides the clock (and the sound only if "Mute the other videos" is on); the Demo and Load session entry points follow that preference too.

### Added: colors from the wallpaper

- **Settings → Appearance → Colors from the wallpaper.** Like an Omarchy theme following its wallpaper: the color the picture is most made of becomes the accent, a second, different color
  becomes the second accent, the text, lines and hover tones are tinted to match, and the Home glow, embers and menu underline take the colors too. The canvas and the backgrounds stay black.
  A picture with no color to follow (gray, black and white) keeps the classic yellow and says so. The theme is worked out once when the wallpaper changes and saved, so it is there at once on the next start.
- Colors are chosen in OKLCH, so the accent always reads on black (it is kept at least 7:1 against it), whether the wallpaper is pale or dark.

### Fixed: preferences were not being saved

- On desktop, **settings were never written to disk** (playback preferences, layout, the new theme): the settings object is reactive state that Electron's IPC cannot copy, and the failed write was
  swallowed, so only the last-session id survived a restart. Settings are now written as plain data, and a failed write is logged.

### Changed: saving a layout as a preset

- The player's **Save** button saves the session (listed under Continue and Load session) and its message now offers **Save layout as preset** (or **Update preset**
  when the session already has one). The same action is in the canvas right-click menu, and in the Layers panel. Saving again updates the same preset instead of adding a copy.

### Fixed: no sound, no picture subtitles, a muted reaction, and a nagging popup

- **Audio that Chromium cannot decode now plays.** Many movie and anime releases carry AC-3 (Dolby Digital), E-AC-3, DTS or TrueHD audio, which
  Chromium silently drops: the video played with no sound. The player now converts that one track to AAC (the video is not touched), keeps the copy in the
  app's cache folder, and plays it in step with the video, following play, pause, seeking, speed and volume. The first time it shows "Preparing audio…".
  ffmpeg ships inside the app for this (a system `ffmpeg` is the fallback). The Audio track menu lists every track in the file, including these, marked "Converted".
- **Picture subtitles (PGS)**, the format on Blu-ray rips, are decoded and drawn over the video at their authored position. MKV files whose blocks the muxer
  compressed with zlib (as in your file) are handled too.
- **The reaction is no longer muted when a session starts.** Every video is audible; Preferences → Playback → "Mute the other videos" brings the old behavior back.
- **The "play another source?" question has a threshold**, 15 minutes past the end of the source by default (Preferences → Playback; 0 turns it off).
- A file whose video cannot be decoded now says why (HEVC/H.265 needs "HEVC Video Extensions" on Windows) and Preferences shows whether video is decoded by the graphics chip or the processor.
- Fixed: closing or reloading the window while the app was still starting could replace `settings.json` with an empty file.

### Fixed and added: audio tracks and subtitles

- **Files with several audio tracks now show all of them.** Chromium leaves `video.audioTracks` off unless the `AudioVideoTracks` feature is on, so every
  file looked like it had one track. It is on now. Right-click a layer → **Audio track** lists them with their names and languages, and the choice is
  remembered with the session (and per episode in a source playlist).
- **Subtitles.** Right-click a layer → **Subtitles**: Off, every text subtitle track stored in the video (MKV, WebM and MP4 `mov_text`), subtitle files
  beside the video (`episode.srt`, `episode.en.srt`…), or **Load a subtitle file…** (`.srt`, `.vtt`, `.ass`, `.ssa`). A delay stepper shifts them in
  time. They are drawn over the layer, scale with it, and follow `\an` top and bottom placement and italics from ASS files. Picture subtitles
  (PGS, VobSub) are listed but cannot be shown.
- Chromium never exposes subtitles stored inside a file, so the main process reads them out of the container (`electron/tracks.ts`).

### Added: several sources, and the keyboard follows the clip

- **Source playlist.** A reactor reacting to several episodes can add more sources. They play in the source layer, one after another, and
  the reaction keeps the clock. When an episode ends the next one is swapped in at once, on its first frame, and does **not** play. It waits
  until you start it (`N`, the **Start it** bar, or the play button in the playlist), so the break between episodes is as long as the reactor's.
  An episode can instead start by itself after a set break.
- **Sources panel** in the Layers panel: drag episodes or use the arrows to change the order, set each break, remove an episode, jump to one.
- **Add a source** from the Layers panel, the source layer's right-click menu, the New Session dialog (**Add another source**), or the prompt below.
- **A prompt appears when the reaction runs longer than the source** (by more than 5 s): "Play another source?".
- **Unlinked, the shortcuts act on the active clip** (the last layer you clicked or selected, drawn with a dotted outline) instead of the whole frame:
  `Space`, `←` `→`, `,` `.` and `M`. Linked, they still act on everything.
- Playlists are saved with the session and in exported layout files.

### Changed: Home menu

- The hovered menu word glows, and its underline draws in across the whole word and fades out when the pointer leaves. It no longer follows the pointer.

### Changed: a native desktop app

- Reaction Player is now an **Electron** app (electron-vite and electron-builder) for Arch Linux and Wayland first, then
  Windows and macOS. The window is black and sandboxed (`contextIsolation`, no Node in the page) and talks to the main process
  through a typed `window.electronAPI`. `npm run dev:web` still runs the UI in a browser with fallbacks.
- **Everything is unlocked.** The free and Pro tiers, the plan table, plan badges, Stripe, cloud sync, the Profile and
  Subscription tabs (`billing.ts`, `cloud.ts`) are gone. Four videos, 4K, unlimited custom presets and the last eight studio
  captures are for everyone.
- **Quit really quits.** It saves, then closes the window and the app. The "Session closed / Reopen" screen is gone.
- **Local videos are permanent.** They are stored by absolute path and played from `local-media://`, which serves the file with
  HTTP Range support, so seeking is instant and a session reopens by itself after a restart.
- Sessions, presets, settings, thumbnails and the wallpaper are plain files in the data folder, written atomically.
- Copy frame uses Electron's native clipboard; fullscreen is the native window; export and import use native dialogs.
- Remote video responses get permissive CORS headers so frames can be read back.
- Linux starts with VA-API hardware decoding, native Wayland, GPU rasterization and zero-copy.
- The single-file build (`build:single`) is retired.
- The hit-test for the pointer now lives on the Stage, not on each layer.

### Added: free layer ordering

- Every layer has a `zIndex`. Order layers by dragging them in the Layers panel (or its up and down arrows), from the right-click
  menu (Bring to front, Bring forward, Send backward, Send to back), or with `]` and `[` (`Shift` for the front and back).
- Each layer can be hidden or locked on its own. Clicks pass through hidden and locked layers to the ones beneath.
- Two new standard presets put the reaction in a corner on top of the source.
- `zIndex` is saved with sessions, exported layout files and presets. Older saves open with the old stacking (source on top).
- Packaging: `.pacman`, `.AppImage` and `.tar.gz` for Linux, NSIS and portable `.exe` for Windows, `.dmg` and `.zip` for macOS;
  a GitHub workflow builds all three systems on every push and attaches them to `v*` releases.

### Changed

- Home is now a title screen. A large glowing **Continue**, with the session it reopens (or **New session** before the first
  one), then Load, Presets, Demo and Settings in a row, small links under that (Shortcuts) and the version in the bottom-right corner. Hovering or focusing an item draws a glowing line from its left edge to
  the pointer, and the arrow keys move through the menu. Your wallpaper is the artwork; with none the screen stays black.
- The Home menu has its own Quit, so Home no longer shows the dock. The other pages keep it.
- The wallpaper text in Settings now says the picture sits behind the Home menu, and that a soft shade along the bottom and left
  keeps the menu readable.

### Added

- A glowing trail that follows the pointer across Home, with a few drifting sparks. It is off when your system asks for reduced
  motion, and a tap on a touch screen sends up a small spray of sparks instead of a trail.
- Touch targets on Home are at least 44 px, and the screen reflows for portrait phones and tablets, narrow windows and short
  landscape screens.
- Cinzel for the Home menu, under the SIL Open Font License 1.1. The license text is in `src/assets/fonts/`.

## [0.1.0] - 2026-11-07

First version in this repository.

### Added

- Player: a black canvas with a reaction layer and a source layer that can each be moved and resized, with the source
  always painted on top. Layouts, crop, opacity, aspect lock, theater mode and fullscreen.
- Sync engine: one master clock, drift correction on every frame, a hard seek only for large drift, a per-video offset
  with a stepper, frame stepping, and timelines for videos of unequal length.
- Pages: Home, New session, Session, Load session, Presets with the frame-sampling alignment studio, and Settings
  (Appearance, Preferences, Profile, Subscription).
- Free and Pro tiers: 2 or 4 videos, up to 1080p or 4K, 3 or unlimited custom presets, cloud sync, and the last eight
  captures per video in the studio.
- A Stripe Payment Link seam (`billing.ts`) and a cloud sync adapter (`cloud.ts`), each with a working local fallback.
- A single-file build (`npm run build:single`), the README, `docs/ARCHITECTURE.md` and `docs/PROGRESS.md`.

### Known gaps

- See "Open questions and known gaps" in `docs/PROGRESS.md`.
