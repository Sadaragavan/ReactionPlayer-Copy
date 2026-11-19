# Changelog

Notable changes to Reaction Player. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the version matches `package.json`.

## [Unreleased]

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
- Cinzel for the Home menu, under the SIL Open Font Licence 1.1. The licence text is in `src/assets/fonts/`.

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
