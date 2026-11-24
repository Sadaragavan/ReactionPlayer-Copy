/**
 * Transient UI state that is not part of a session: toasts, the right-click
 * menu and global dialogs.
 */
import type { PickedFile } from '../engine/media';
import type { MenuEntry, MenuRequest, Preset, Toast, ToastKind } from '../types';

class UIStore {
  toasts = $state<Toast[]>([]);
  menu = $state<MenuRequest | null>(null);
  newSessionOpen = $state(false);
  /** Files dropped on the Home page, waiting to fill the New Session slots. */
  newSessionFiles = $state<PickedFile[]>([]);
  /** A preset chosen on the Presets page; New Session opens with it already selected. */
  newSessionPreset = $state<Preset | null>(null);
  shortcutsOpen = $state(false);
  /** The “Add a source” dialog (another episode for the source layer). */
  addSourceOpen = $state(false);
  /** Set when a wallpaper with colors in it has just been picked: asks whether to use them. */
  themeOffer = $state<{ swatches: { accent: { l: number; c: number; h: number }; accent2: { l: number; c: number; h: number } } } | null>(null);
  /** Sessions whose “play another source?” question was dismissed, keyed by session and number of sources. */
  sourcePromptDismissed = $state<Record<string, true>>({});

  #nextId = 1;

  toast(message: string, kind: ToastKind = 'info', action?: Toast['action']): number {
    const id = this.#nextId++;
    this.toasts = [...this.toasts.slice(-2), { id, kind, message, action }];
    const ttl = action ? 7000 : kind === 'error' ? 5200 : 3000;
    setTimeout(() => this.dismiss(id), ttl);
    return id;
  }

  dismiss(id: number): void {
    this.toasts = this.toasts.filter((t) => t.id !== id);
  }

  openMenu(x: number, y: number, entries: MenuEntry[], opts: { above?: boolean } = {}): void {
    this.menu = { x, y, entries, above: opts.above };
  }

  /** Opens a menu hanging off a control: below it, or above it for controls on the bottom edge. */
  openMenuAt(el: Element, entries: MenuEntry[], above = false): void {
    const r = el.getBoundingClientRect();
    this.openMenu(r.left, above ? r.top : r.bottom + 4, entries, { above });
  }

  closeMenu(): void {
    this.menu = null;
  }
}

export const ui = new UIStore();
