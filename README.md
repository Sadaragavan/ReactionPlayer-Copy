# Reaction Player

A frame-accurate reaction player that runs entirely in the browser. The source video and your reaction sit as
layers on a pure-black canvas. Every layer can be moved, resized and cropped, the source is always painted on
top, and one shared clock keeps them together. The interface stays out of the way: black, a single yellow accent,
no blur.

Svelte 5 · Vite · Tailwind 4 · Lucide · no backend.

## Run it

```bash
npm install
npm run dev            # http://localhost:5173
npm run check          # svelte-check; expect 0 errors and 0 warnings
npm run build          # static site in dist/ (host it anywhere)
npm run preview        # serve dist/ locally
npm run build:single   # one self-contained dist/index.html (JS, CSS, font and sample clips inlined)
```

Needs Node 20.19+ or 22.12+ (Vite 8).

Routing uses the URL hash (`#/session`, `#/settings/subscription`, …), so the build needs no server rewrites.
It works from any static host, from a `file://` path and inside an embedded viewer.

`build:single` also writes into `dist/`. Copy `dist/index.html` out before you run `npm run build` again.

## What is in it

| Screen | Route | What it does |
| --- | --- | --- |
| Home | `#/` | A title screen. **Continue** (or **New session** before the first one) in large type, then Load, Presets, Demo and Settings, small links beneath, and your plan with what it includes in the corner. Drop videos anywhere to start a session. Your wallpaper (image or GIF, never blurred) is its artwork; without one it is black. A glow follows the pointer, and is off when your system asks for reduced motion. |
| New session | dialog | Pick a layout (split, grid, picture-in-picture), add the source and the reaction from files or links, name it. |
| Session | `#/session` | The player. Layers on the black canvas, controls docked to the window edges, theater mode, fullscreen, right-click menu, layers panel. |
| Load session | `#/sessions` | Saved sessions with a thumbnail, rename, duplicate, delete, export and import of a layout file. |
| Presets | `#/presets` | Standard and custom layouts, plus the alignment studio: grab a frame from each video, compare with onion skin or a wipe line, align, save. |
| Settings | `#/settings/<tab>` | Appearance (wallpaper), Preferences (sync engine, playback, controls, data), Profile, Subscription. |

### The player

- **Layers.** Drag to move, eight handles to resize, snap to the canvas edges and centre. Crop, opacity, fit and
  aspect lock per layer. Lock the layout so nothing moves by accident. The source layer is always on top.
- **Canvas.** 16:9, 9:16, 4:3, 1:1, 21:9, or fill the window. A fixed shape keeps an alignment exact at any
  window size.
- **Sync.** Linked mode runs every video from one master clock, each with its own offset (steppers for ±1, ±10 and
  ±100 ms). Small drift is absorbed by a barely audible speed nudge, large drift by a seek.
  Unlinked mode plays and scrubs each video on its own so you can find the offset by eye, then link.
- **Frame stepping.** `,` and `.` step one frame using the frame rate measured from the video itself.
- **Videos of different lengths.** The timeline is the union of all footage. A video that has not started yet, or
  has ended, waits on its first or last frame while the others play, and playback stops when every video has ended.
  If the master has no footage at a moment, its sound is lent to the first video that does (Preferences → Keep the sound going).
- **Copy frame** (right-click a layer) puts that video's current picture, with its crop, on the clipboard.

### Keyboard shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play or pause everything |
| `L` | Link or unlink the timelines |
| `T` | Theater mode |
| `F` | Fullscreen |
| `←` `→` | Seek by the Preferences step (5 s by default); one frame while paused |
| `Shift` + `←` `→` | Always the full step, even while paused |
| `,` `.` | One frame back or forward |
| `M` | Mute the master audio |
| `P` | Layers panel |
| `Esc` | Leave theater mode, then deselect, then close the panel |
| `?` | Show the shortcuts (works on every screen) |

In the alignment studio `,` `.` step the sampled video, `C` captures the frame, and the wipe line moves with the arrow keys (1 %, Shift for 10 %).

## Free and Pro

The plan is one value, `userTier`; every check in the app goes through `settings.limits` (see `TIER_LIMITS` in
`src/lib/constants.ts`), and the comparison table in Settings → Subscription is generated from the same object.

| | Free | Pro |
| --- | --- | --- |
| Videos at once | 2 | 4 |
| Playback resolution | up to 1080p | up to 4K |
| Sessions | on this device | cloud sync |
| Standard presets | yes | yes |
| Custom presets | up to 3 | unlimited |
| Frame sampler | capture, onion skin and wipe | plus the last 8 captures per video |

Price: $6 a month or $48 a year (`PRICING` in `constants.ts`).

### Taking payment

`src/lib/billing.ts` is the only place that knows about the payment provider. Create the Stripe Payment Links, then
put them in `.env.local` (git-ignored):

```bash
VITE_STRIPE_LINK_MONTHLY=https://buy.stripe.com/...
VITE_STRIPE_LINK_YEARLY=https://buy.stripe.com/...
VITE_STRIPE_PORTAL_URL=https://billing.stripe.com/p/login/...   # customer portal, optional
```

With a link set, Upgrade redirects to Stripe-hosted checkout with the profile email prefilled. With none set,
a demo adapter switches the plan on this device so the whole Pro experience can be tried.

A client-only app cannot prove that a payment happened. For production, set the Payment Link's success URL to
`<your app>/#/settings/subscription`, let a Stripe webhook on your server record the entitlement, and replace the
`settings.setTier('pro')` call in `SubscriptionTab.svelte` with a request to that server.

### Cloud sync

`src/lib/cloud.ts` holds `cloud.adapter`, a `CloudSyncAdapter` (`push`, `pull`, `isAvailable`). The default adapter
mirrors sessions into a second IndexedDB store, which exercises the whole flow without a server. Assign your own
adapter (REST, Supabase, Firebase) before the app mounts to sync for real. Conflicts compare `Session.updatedAt`.

## Your videos, and what the browser allows

- **Local files** are played through blob URLs, which die with the page. A session stores the file name, not the
  video. In Chromium the file handle is kept and the video reopens by itself; in other browsers the player shows a
  **Choose file** prompt on exactly the layers that need it.
- **Links** need CORS headers for anything that reads pixels (Copy frame, thumbnails, the alignment studio's
  capture); without them the app says so in words and playback still works. Seeking on a plain static host needs
  HTTP Range support. Streaming formats (HLS, DASH) are not handled.
- **Frame accuracy** relies on `requestVideoFrameCallback`, which measures each video's real frame rate for
  stepping. Where a browser lacks it, the sync loop still runs on animation frames and stepping assumes 30 fps.
- **Storage.** Everything lives in this browser: settings and profile in LocalStorage, sessions, presets, the
  wallpaper and file handles in IndexedDB (`reaction-player`). A blocked or full store degrades to "not saved"
  instead of breaking the app. Preferences → Clear all data removes it all; your video files are never touched.
- **Downloads** (exported session files) are ordinary browser downloads. Inside a sandboxed viewer that blocks
  them, the app asks the viewer's save prompt instead.
- **Quit** cannot close a browser tab, so it parks the app on a dark "Session closed" screen with a Reopen button.

## Project layout

```text
src/
  App.svelte, main.ts, app.css      shell, global layers, design tokens (@theme) and base styles
  assets/demo/                      the two sample clips; fonts/ holds Archivo (variable width) and Cinzel, with their licences
  lib/
    pages/                          Home, Session, Presets, Sessions, Settings
    components/                     home, player, presets, session, sessions, settings, shell, ui
    engine/                         playback (clock + sync), timeline, track, layouts, capture, media, probe, demo, sessionFactory, appActions
    stores/                         session, settings, presets, router, ui, persistence (Svelte 5 runes)
    actions/                        tooltip, dropzone, dom (portal, focus trap, click outside), layerGesture, streak
    utils/                          geometry, format, file, fullscreen, embers
    types.ts, constants.ts          shared contracts, tier limits, defaults, shortcuts
    billing.ts, cloud.ts            the two server seams
docs/ARCHITECTURE.md                how the pieces fit
docs/PROGRESS.md                    status, decisions and what was verified
scripts/make-demo-clips.sh          regenerates the sample clips (needs ffmpeg with libvpx-vp9, libopus, drawtext)
.github/workflows/ci.yml            type check and both builds on every push and pull request
CHANGELOG.md                        what changed in each version
CLAUDE.md                           the checklist and the easy-to-break rules for anyone changing the code
```

## More

- `docs/ARCHITECTURE.md` explains the data model, the sync engine, the layer maths and the persistence layer.
- `docs/PROGRESS.md` records what was built, the design rules, and what was tested and how.
- `CHANGELOG.md` lists what changed in each version. Before a commit, run the checklist in `CLAUDE.md`; CI repeats the type
  check and the builds on every push.
- The sample clips flash and beep at the same moment but at different times, so the reaction needs `+1500 ms`
  to line up. That is what the demo session ships with, and it is a quick way to try the offset stepper.
