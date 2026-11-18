/** Small DOM actions: portal, focus trap, click-outside, adopt. */

/**
 * Places an element that was built in code (the studio's sampling `<video>`)
 * inside `node` for as long as `node` exists, and takes it out again after.
 * Passing a different element swaps them, so one preview can follow the selection.
 */
export function adopt(node: HTMLElement, el: HTMLElement | null) {
  let current: HTMLElement | null = null;
  const put = (next: HTMLElement | null) => {
    if (current && current.parentNode === node) node.removeChild(current);
    current = next;
    if (next) node.appendChild(next);
  };
  put(el);
  return { update: put, destroy: () => put(null) };
}

/** Moves the node to `<body>` so `position: fixed` is never affected by a transformed ancestor. */
export function portal(node: HTMLElement) {
  document.body.appendChild(node);
  return { destroy: () => node.remove() };
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Keeps Tab inside `node` while it is mounted and hands focus back afterwards.
 * Put `data-autofocus` on the element that should receive focus first.
 */
export function focusTrap(node: HTMLElement) {
  const previous = document.activeElement as HTMLElement | null;
  queueMicrotask(() => {
    const first = node.querySelector<HTMLElement>('[data-autofocus]') ?? node.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node).focus({ preventScroll: true });
  });

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((x) => x.offsetParent !== null);
    if (!items.length) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };
  node.addEventListener('keydown', onKey);
  return {
    destroy() {
      node.removeEventListener('keydown', onKey);
      previous?.focus?.({ preventScroll: true });
    }
  };
}

/** Calls `handler` when a pointer goes down anywhere outside `node`. */
export function clickOutside(node: HTMLElement, handler: (e: PointerEvent) => void) {
  let fn = handler;
  const onDown = (e: PointerEvent) => {
    if (!node.contains(e.target as Node)) fn(e);
  };
  document.addEventListener('pointerdown', onDown, true);
  return {
    update(next: (e: PointerEvent) => void) {
      fn = next;
    },
    destroy: () => document.removeEventListener('pointerdown', onDown, true)
  };
}
