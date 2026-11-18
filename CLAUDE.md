# Reaction Player

A Svelte 5, Vite 8 and Tailwind 4 app: a black canvas where a reaction video and a source video play in sync as
movable layers, with the source always on top. It needs Node 20.19+ or 22.12+.

Start with `docs/PROGRESS.md` (state, design rules, known gaps). `docs/ARCHITECTURE.md` explains how the pieces fit,
and `README.md` covers running, plans and payment.

## Before you commit

1. `npm run check` reports 0 errors and 0 warnings.
2. `npm run build` and `npm run build:single` both succeed. The second writes into `dist/`, so run it last or rebuild
   afterwards.
3. Look at any UI change in a browser (`npm run dev`) before committing it.
4. Add a line under `[Unreleased]` in `CHANGELOG.md` for anything a user would notice. Change `version` in
   `package.json` only when cutting a release, and move the `[Unreleased]` lines under the new version.
5. Update `docs/PROGRESS.md` when behaviour, rules or known gaps change.

CI (`.github/workflows/ci.yml`) repeats steps 1 and 2 on every push and pull request.

## Rules that are easy to break

- Design: true `#000`, hairline borders, no blur, no shadows except on floating surfaces, yellow only for live or
  selected things, Archivo only, sentence case. The full list is in `docs/PROGRESS.md`.
- The one exception is Home's title screen (`src/lib/components/home/`): Cinzel in capitals, glow, a warm amber light and
  the ember trail. It still never blurs anything. Nothing else borrows from it; the other pages keep the plain look. What
  it may and may not do is under "The one exception" in `docs/PROGRESS.md`.
- Bundled fonts keep their licence file beside them in `src/assets/fonts/`.
- The source layer is always painted on top (`paintOrder` in `src/lib/engine/layouts.ts`).
- The plan table in Settings → Subscription must say what the code enforces (`TIER_LIMITS` in `src/lib/constants.ts`).
- `SHORTCUTS` in `src/lib/constants.ts` must match the `switch` in `src/lib/pages/Session.svelte`.
- `src/app.css` starts with `@import 'tailwindcss' source(none);` and two `@source` lines. Keep them: with automatic
  detection, the docs and old builds leak class names into the stylesheet.
- Local video files are never persisted, only their names.
- Payment keys never go in the repository. Payment Links and the portal URL go in `.env.local`, which is ignored.

## Git

- Work on `main` in small commits whose messages say why. Never force-push `main`.
- Follow the attribution lines the session gives for commit messages and pull requests.
