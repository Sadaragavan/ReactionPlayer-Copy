/**
 * `use:tip` — one shared, edge-aware tooltip for the whole app.
 *
 * The interface carries no text labels, so every icon says what it does here.
 * A single floating element is reused: it appears after a short hover delay (or
 * at once on keyboard focus), flips to the opposite side when it would leave the
 * window, and never takes the pointer.
 */
export type TipSide = 'top' | 'bottom' | 'left' | 'right';

export interface TipOptions {
  text: string;
  /** Shortcut hint shown as a key cap, e.g. `T` or `Space`. */
  kbd?: string;
  side?: TipSide;
}

const OPPOSITE: Record<TipSide, TipSide> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const GAP = 8;
const EDGE = 6;

let el: HTMLDivElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let owner: HTMLElement | null = null;

function element(): HTMLDivElement {
  if (el && el.isConnected) return el;
  el = document.createElement('div');
  el.className = 'tip';
  el.setAttribute('role', 'tooltip');
  el.dataset.show = 'false';
  document.body.appendChild(el);
  return el;
}

function hide(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  owner = null;
  if (el) el.dataset.show = 'false';
}

function show(target: HTMLElement, o: TipOptions): void {
  const tip = element();
  tip.replaceChildren(document.createTextNode(o.text));
  if (o.kbd) {
    const k = document.createElement('kbd');
    k.textContent = o.kbd;
    tip.appendChild(k);
  }
  // Lay it out invisibly first so its size is known.
  tip.style.left = '0px';
  tip.style.top = '0px';
  const r = target.getBoundingClientRect();
  const t = tip.getBoundingClientRect();
  const fits: Record<TipSide, boolean> = {
    top: r.top - t.height - GAP >= EDGE,
    bottom: r.bottom + t.height + GAP <= innerHeight - EDGE,
    left: r.left - t.width - GAP >= EDGE,
    right: r.right + t.width + GAP <= innerWidth - EDGE
  };
  let side = o.side ?? 'top';
  if (!fits[side] && fits[OPPOSITE[side]]) side = OPPOSITE[side];

  let x = r.left + r.width / 2 - t.width / 2;
  let y = r.top + r.height / 2 - t.height / 2;
  if (side === 'top') y = r.top - t.height - GAP;
  if (side === 'bottom') y = r.bottom + GAP;
  if (side === 'left') x = r.left - t.width - GAP;
  if (side === 'right') x = r.right + GAP;
  x = Math.min(Math.max(EDGE, x), innerWidth - t.width - EDGE);
  y = Math.min(Math.max(EDGE, y), innerHeight - t.height - EDGE);

  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(y)}px`;
  tip.dataset.side = side;
  tip.dataset.show = 'true';
}

const normalize = (o: TipOptions | string): TipOptions => (typeof o === 'string' ? { text: o } : o);

export function tip(node: HTMLElement, options: TipOptions | string) {
  let o = normalize(options);

  const enter = (e: PointerEvent) => {
    if (e.pointerType === 'touch' || !o.text) return;
    hide();
    owner = node;
    timer = setTimeout(() => show(node, o), 380);
  };
  const focus = () => {
    if (!o.text || !node.matches(':focus-visible')) return;
    hide();
    owner = node;
    show(node, o);
  };
  const leave = () => {
    if (owner === node) hide();
  };

  node.addEventListener('pointerenter', enter);
  node.addEventListener('pointerleave', leave);
  node.addEventListener('pointerdown', leave);
  node.addEventListener('focus', focus);
  node.addEventListener('blur', leave);

  return {
    update(next: TipOptions | string) {
      o = normalize(next);
      if (owner === node && el?.dataset.show === 'true') show(node, o);
    },
    destroy() {
      leave();
      node.removeEventListener('pointerenter', enter);
      node.removeEventListener('pointerleave', leave);
      node.removeEventListener('pointerdown', leave);
      node.removeEventListener('focus', focus);
      node.removeEventListener('blur', leave);
    }
  };
}
