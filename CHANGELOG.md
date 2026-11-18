# Changelog

Notable changes to Reaction Player. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the version matches `package.json`.

## [Unreleased]

### Changed

- Home is now a title screen. A large glowing **Continue**, with the session it reopens (or **New session** before the first
  one), then Load, Presets, Demo and Settings in a row, small links under that (Profile, Subscription, Shortcuts) and your plan
  with what it includes in the bottom-right corner. Hovering or focusing an item draws a glowing line from its left edge to
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
