# Reaction Player

An Electron desktop app (Svelte 5, Vite 8, Tailwind 4): a black canvas where a reaction video and a source video play in
sync as movable layers with a free stacking order. It needs Node 20.19+ or 22.12+. `electron/` is the main process and
preload, `src/` the renderer, `src/shared/` what both sides use.

Start with `docs/PROGRESS.md` (state, design rules, known gaps). `docs/ARCHITECTURE.md` explains how the pieces fit,
and `README.md` covers running, packaging and the desktop features.

## Before you commit

1. `npm run check` reports 0 errors and 0 warnings (svelte-check, then `tsc` for main and preload).
2. `npm test` passes and `npm run build` succeeds.
3. Look at any UI change in the app (`npm run dev`) before committing it.
4. Add a line under `[Unreleased]` in `CHANGELOG.md` for anything a user would notice. Change `version` in
   `package.json` only when cutting a release, and move the `[Unreleased]` lines under the new version.
5. Update `docs/PROGRESS.md` when behaviour, rules or known gaps change.

CI (`.github/workflows/build-desktop.yml`) repeats the checks and builds installers for all three systems.

## Rules that are easy to break

- Design: true `#000`, hairline borders, no blur, no shadows except on floating surfaces, yellow only for live or
  selected things, Archivo only, sentence case. The full list is in `docs/PROGRESS.md`.
- The one exception is Home's title screen (`src/lib/components/home/`): Cinzel in capitals, glow, a warm amber light and
  the ember trail. It still never blurs anything. Nothing else borrows from it; the other pages keep the plain look. What
  it may and may not do is under "The one exception" in `docs/PROGRESS.md`.
- Bundled fonts keep their licence file beside them in `src/assets/fonts/`.
- Layers are painted by `zIndex` (`sortByZ` in `src/lib/engine/zorder.ts`) and the pointer is tested with `hitTest` from the highest
  down, skipping hidden and locked layers. Anything that reads a stored layer, session or preset must go through
  `migrate.ts` first, so old saves without `zIndex` still work. Layout builders must give every slot a `zIndex`.
- A source layer may hold a playlist (`SessionVideo.sources`). While it does, the layer's own title, kind, url, filePath, duration, offsetMs and `waiting`
  mirror the current episode (`mirrorCurrentItem`), so most code never sees the playlist. Media for an episode is registered under the episode's id
  (`session.mediaIdOf`). Change it only through the `session` store (`addSource`, `moveSource`, `activateSource`, `startSource` …).
- Subtitles are read by `electron/tracks.ts`, not by Chromium (it exposes none). Keep `AudioVideoTracks` on in `main.ts`; without it every file seems to have one audio track.
- There are no plans, tiers or limits other than four videos (`MAX_VIDEOS`). Do not bring gating back.
- Anything the page may ask of the system goes through `window.electronAPI` (`src/shared/api.ts`, `electron/preload.ts`) and must
  still have a browser fallback via `$lib/platform`. IPC handlers check the sender (`trusted` in `electron/main.ts`).
- `local-media://` serves only video and picture extensions (`src/shared/mediaUrl.ts`). Keep it that way.
- Remote or `local-media://` videos need `crossorigin="anonymous"` or the canvas is tainted and Copy frame fails.
- `SHORTCUTS` in `src/lib/constants.ts` must match the `switch` in `src/lib/pages/Session.svelte`.
- `src/app.css` starts with `@import 'tailwindcss' source(none);` and two `@source` lines. Keep them: with automatic
  detection, the docs and old builds leak class names into the stylesheet.
- Local videos are stored by absolute path (`SessionVideo.filePath`) on desktop. In a browser only their names are kept.

## Git

- Work on `main` in small commits whose messages say why. Never force-push `main`.
- Follow the attribution lines the session gives for commit messages and pull requests.
