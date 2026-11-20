<script lang="ts">
  /**
   * Home's title screen: the app's main menu, set over the wallpaper (or the black). A large "Continue" with the session
   * it reopens, the other destinations in a row beneath, small links under that, and the version in the
   * bottom-right corner. Hovering or focusing an item draws a line from its left edge to the pointer with a bright
   * head on the end (actions/streak.ts). The menu is the only place Cinzel and glow are used; see PROGRESS.md.
   */
  import { streak } from '$lib/actions/streak';
  import Logo from '$lib/components/shell/Logo.svelte';
  import { continueLast, quitApp } from '$lib/engine/appActions';
  import { demoSessionInput, warmDemoClips } from '$lib/engine/demo';
  import { router } from '$lib/stores/router.svelte';
  import { session } from '$lib/stores/session.svelte';
  import { settings } from '$lib/stores/settings.svelte';
  import { ui } from '$lib/stores/ui.svelte';
  import { timeAgo } from '$lib/utils/format';

  const last = $derived(session.lastSession);
  let root: HTMLElement;
  let demoBusy = $state(false);

  async function demo() {
    if (demoBusy) return;
    demoBusy = true;
    try {
      await warmDemoClips();
      session.create(demoSessionInput(settings.settings.defaultLayout, settings.playback.masterAudio, settings.playback.autoLink));
      router.go('session');
    } catch {
      ui.toast('The demo clips could not be loaded.', 'error');
    } finally {
      demoBusy = false;
    }
  }

  /** Arrow keys walk the menu in reading order. Only while focus is already inside it, so dialogs keep their own keys. */
  function arrows(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey || !root.contains(document.activeElement)) return;
    const forward = e.key === 'ArrowRight' || e.key === 'ArrowDown';
    if (!forward && e.key !== 'ArrowLeft' && e.key !== 'ArrowUp') return;
    const all = [...root.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
    const at = all.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    e.preventDefault();
    all[(at + (forward ? 1 : -1) + all.length) % all.length].focus();
  }
</script>

<svelte:window onkeydown={arrows} />

<div class="title" bind:this={root}>
  <header class="top">
    <div class="brand">
      <Logo size={34} />
      <h1 class="title-wide wordmark">Reaction<br />Player</h1>
      <p class="hint">Drop a source and a reaction video anywhere to begin.</p>
    </div>

  </header>

  <nav class="menu" aria-label="Main">
    <div class="lead">
      {#if last}
        <button class="streaky lead-btn" use:streak onclick={continueLast} aria-label="Continue {last.name}, {timeAgo(last.lastModified)}">
          <span class="bloom" aria-hidden="true"></span>Continue
        </button>
        <p class="meta">
          <span>Last session</span><i class="dot" aria-hidden="true"></i><span class="meta-name">{last.name}</span><i class="dot" aria-hidden="true"></i><span>{timeAgo(last.lastModified)}</span>
        </p>
      {:else}
        <button class="streaky lead-btn" use:streak onclick={() => (ui.newSessionOpen = true)}>
          <span class="bloom" aria-hidden="true"></span>New session
        </button>
      {/if}
    </div>

    <ul class="items">
      {#if last}
        <li><button class="streaky item" use:streak onclick={() => (ui.newSessionOpen = true)}>New session</button></li>
      {/if}
      <!-- Short words so the row stays compact; the full names are in the accessible labels. -->
      <li><button class="streaky item" use:streak onclick={() => router.go('sessions')} aria-label="Load session">Load</button></li>
      <li><button class="streaky item" use:streak onclick={() => router.go('presets')}>Presets</button></li>
      <li><button class="streaky item" use:streak onclick={demo} aria-busy={demoBusy} aria-label="Try the demo">{demoBusy ? 'Loading' : 'Demo'}</button></li>
      <li><button class="streaky item" use:streak onclick={() => router.go({ name: 'settings', tab: 'appearance' })}>Settings</button></li>
    </ul>

    <ul class="links">
      <li><button class="streaky link" use:streak onclick={() => (ui.shortcutsOpen = true)}>Shortcuts</button></li>
    </ul>
  </nav>

  <div class="side">
    <aside class="plan" aria-label="Version">
      <p class="version">v{__APP_VERSION__}</p>
    </aside>
    <button class="streaky link quit" use:streak onclick={quitApp}>Quit</button>
  </div>
</div>

<style>
  .title {
    position: absolute;
    inset: 0;
    z-index: 10;
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-rows: auto 1fr auto;
    padding-block: max(clamp(18px, 2.4vw, 52px), env(safe-area-inset-top)) max(clamp(2px, 0.3vw, 8px), env(safe-area-inset-bottom));
    padding-inline: max(clamp(22px, 4.25vw, 110px), env(safe-area-inset-left)) max(clamp(22px, 4.25vw, 110px), env(safe-area-inset-right));
    color: var(--paper-2);
  }

  /* ── top ── */
  .top {
    grid-column: 1 / -1;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
  }
  .brand {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: clamp(8px, 1vw, 18px);
  }
  .wordmark {
    margin: 0;
    font-size: clamp(30px, 4.2vw, 84px);
    line-height: 0.94;
    color: var(--paper);
    text-shadow: 0 2px 28px rgb(0 0 0 / 0.7);
  }
  .hint {
    margin: 0;
    max-width: 30ch;
    font-size: clamp(11px, 0.85vw, 16px);
    line-height: 1.7;
    letter-spacing: 0.16em;
    color: var(--paper-3);
  }
  /* ── menu ── */
  .menu {
    grid-column: 1;
    grid-row: 3;
    align-self: end;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-width: 0;
  }
  .lead {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 clamp(16px, 2.2vw, 48px);
  }
  .items,
  .links {
    display: flex;
    flex-wrap: wrap;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .items {
    gap: 0 clamp(16px, 2vw, 42px);
    margin-top: clamp(2px, 0.3vw, 8px);
  }
  .links {
    margin-top: clamp(14px, 2.2vw, 48px);
  }
  .links li {
    display: flex;
    align-items: center;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 0.9em;
    min-width: 0;
    margin: 0;
    font-size: clamp(11px, 0.85vw, 16px);
    letter-spacing: 0.2em;
    color: var(--paper-3);
  }
  .meta-name {
    max-width: 26ch;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .dot {
    flex: none;
    display: inline-block;
    width: 3px;
    height: 3px;
    margin-inline: 0.35em;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.7;
  }

  /*
   * One underline for everything clickable. It is not tied to the pointer: when the item is hot (hovered, or focused from the
   * keyboard, see actions/streak.ts) it draws in from the left edge across the whole word, and when the pointer leaves it fades out.
   * The word itself glows while it is hot.
   */
  .streaky {
    position: relative;
    --rest: var(--paper-2);
    --lit: #fff3d6;
    color: var(--rest);
    text-align: left;
    white-space: nowrap;
    transition:
      color 200ms ease-out,
      text-shadow 260ms ease-out;
  }
  .streaky::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 2px;
    background: linear-gradient(90deg, rgb(255 168 56 / 0.55), var(--ember-core));
    box-shadow: 0 0 8px rgb(255 160 50 / 0.55);
    transform: scaleX(0);
    transform-origin: left center;
    opacity: 0;
    transition:
      transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1),
      opacity 220ms ease-out;
  }
  .streaky:global([data-hot='true'])::after {
    transform: scaleX(1);
    opacity: 1;
  }
  .streaky:global([data-hot='true']) {
    color: var(--lit);
    text-shadow:
      0 0 0.75em rgb(255 190 90 / 0.8),
      0 0 0.22em rgb(255 235 190 / 0.75);
  }
  .streaky:active {
    filter: brightness(0.9);
  }
  .streaky:focus-visible {
    outline-offset: 6px;
  }

  .lead-btn {
    --rest: var(--paper);
    --lit: #fffbe6;
    isolation: isolate;
    padding: 0.12em 0.04em 0.3em 0;
    font-family: var(--font-display);
    font-size: clamp(30px, 3.15vw, 64px);
    font-weight: 500;
    line-height: 1;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    text-shadow:
      0 0 0.55em rgb(255 176 70 / 0.5),
      0 0 0.14em rgb(255 214 140 / 0.5),
      0 2px 18px rgb(0 0 0 / 0.6);
  }
  .lead-btn:global([data-hot='true']) {
    text-shadow:
      0 0 0.7em rgb(255 186 80 / 0.75),
      0 0 0.16em rgb(255 230 170 / 0.7),
      0 2px 18px rgb(0 0 0 / 0.6);
  }
  /* The warm smear of light behind the word. */
  .bloom {
    position: absolute;
    inset: -0.6em -0.7em -0.5em -0.5em;
    z-index: -1;
    pointer-events: none;
    background: radial-gradient(ellipse 55% 62% at 50% 58%, rgb(255 168 66 / 0.42), rgb(255 140 40 / 0.14) 55%, transparent 75%);
    opacity: 0.85;
    transition: opacity 220ms ease-out;
  }
  .lead-btn:global([data-hot='true']) .bloom {
    opacity: 1;
  }

  .item {
    padding: 0.55em 0 0.62em;
    font-family: var(--font-display);
    font-size: clamp(13px, 1.46vw, 30px);
    font-weight: 500;
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }
  .item:global([data-hot='true']) {
    -webkit-text-stroke: 0.35px currentColor;
  }
  .item[aria-busy='true'] {
    opacity: 0.6;
  }

  .link {
    padding: 0.7em 0 0.5em;
    font-size: clamp(11px, 0.85vw, 16px);
    letter-spacing: 0.2em;
    --rest: var(--paper-3);
    --lit: #ffeed0;
  }
  /* ── bottom-right ── */
  .side {
    grid-column: 2;
    grid-row: 3;
    align-self: end;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: clamp(10px, 1.4vw, 28px);
    text-align: right;
  }
  .plan {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.35em;
    font-size: clamp(11px, 0.85vw, 16px);
    line-height: 1.7;
    letter-spacing: 0.14em;
    color: var(--paper-2);
  }
  .plan p {
    margin: 0;
  }
  .version {
    color: var(--paper-3);
    opacity: 0.8;
  }
  .quit {
    padding-inline: 0.1em;
  }

  /* ── small screens ── */
  /* Portrait screens (phones, tablets) are one column, with the version under the menu. */
  @media (orientation: portrait) and (max-width: 900px) {
    .title {
      grid-template-columns: minmax(0, 1fr);
      grid-template-rows: auto 1fr auto auto;
    }
    .meta {
      flex-basis: 100%;
      margin-top: 4px;
    }
    .side {
      grid-column: 1;
      grid-row: 4;
      flex-direction: row;
      align-items: flex-end;
      justify-content: space-between;
      margin-top: 8px;
      text-align: left;
    }
    .plan {
      align-items: flex-start;
    }
  }
  /* Tablets held upright have room to set everything larger than the vw-based desktop sizes give. */
  @media (orientation: portrait) and (min-width: 721px) and (max-width: 900px) {
    .lead-btn {
      font-size: clamp(40px, 7vw, 56px);
    }
    .item {
      font-size: clamp(15px, 2.1vw, 20px);
    }
    .link,
    .plan,
    .meta,
    .hint {
      font-size: 12px;
    }
  }
  /* Narrow windows keep only the version in the corner, so the menu has the room. */
  @media (max-width: 720px) {
    .hint {
      display: none;
    }
    .lead-btn {
      font-size: clamp(28px, min(9.5vw, 11vh), 46px);
    }
    .item {
      font-size: 14px;
      letter-spacing: 0.16em;
    }
    .items {
      gap: 0 18px;
    }
  }
  /* Fingers need bigger targets than a pointer does. */
  @media (pointer: coarse) {
    .lead-btn,
    .item,
    .link {
      display: inline-flex;
      align-items: center;
      min-height: 44px;
    }
    .quit {
      justify-content: flex-end;
      min-width: 44px;
    }
  }
  /* A phone on its side is short: trade a little of that height for room. */
  @media (pointer: coarse) and (max-height: 420px) {
    .item,
    .link {
      min-height: 38px;
    }
  }
  /* On a short screen that is still not enough, the title scrolls rather than clips. The extra bottom padding keeps the
     hover glow (which hangs 4px under the last row) from adding a scrollbar of its own. */
  @media (max-height: 420px) {
    .title {
      overflow-y: auto;
      overscroll-behavior: contain;
      padding-block-end: max(6px, env(safe-area-inset-bottom));
    }
  }
</style>
