/**
 * Hover streak for the Home menu. While the pointer is over the element, or the element has keyboard focus, it is
 * marked `data-hot` and `--sx` holds the pointer's x from the element's left edge in px. The stylesheet draws a line
 * from the left edge to `--sx` with a bright head on the end, so the line chases the cursor along the word. A keyboard
 * focus sets `--sx` to the full width.
 */
import type { Action } from 'svelte/action';

export const streak: Action<HTMLElement> = (node) => {
  const track = (e: PointerEvent) => {
    const r = node.getBoundingClientRect();
    node.style.setProperty('--sx', `${Math.min(Math.max(e.clientX - r.left, 0), r.width).toFixed(1)}px`);
  };
  const onenter = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    track(e);
    node.dataset.hot = 'true';
  };
  const onleave = () => {
    delete node.dataset.hot;
  };
  const onfocus = () => {
    if (!node.matches(':focus-visible')) return;
    node.style.setProperty('--sx', `${node.offsetWidth}px`);
    node.dataset.hot = 'true';
  };
  const onblur = () => {
    if (!node.matches(':hover')) delete node.dataset.hot;
  };

  node.addEventListener('pointerenter', onenter);
  node.addEventListener('pointermove', track);
  node.addEventListener('pointerleave', onleave);
  node.addEventListener('focus', onfocus);
  node.addEventListener('blur', onblur);
  return {
    destroy() {
      node.removeEventListener('pointerenter', onenter);
      node.removeEventListener('pointermove', track);
      node.removeEventListener('pointerleave', onleave);
      node.removeEventListener('focus', onfocus);
      node.removeEventListener('blur', onblur);
    }
  };
};
