/**
 * Hover state for the Home menu. While the pointer is over the element, or the element has keyboard focus, it is marked
 * `data-hot`; the stylesheet glows the word and draws its underline across the whole width, then fades both out when
 * `data-hot` goes away. The state is on or off: nothing follows the pointer.
 */
import type { Action } from 'svelte/action';

export const streak: Action<HTMLElement> = (node) => {
  const onenter = (e: PointerEvent) => {
    if (e.pointerType === 'touch') return;
    node.dataset.hot = 'true';
  };
  const onleave = () => {
    if (!node.matches(':focus-visible')) delete node.dataset.hot;
  };
  const onfocus = () => {
    if (node.matches(':focus-visible')) node.dataset.hot = 'true';
  };
  const onblur = () => {
    if (!node.matches(':hover')) delete node.dataset.hot;
  };

  node.addEventListener('pointerenter', onenter);
  node.addEventListener('pointerleave', onleave);
  node.addEventListener('focus', onfocus);
  node.addEventListener('blur', onblur);
  return {
    destroy() {
      node.removeEventListener('pointerenter', onenter);
      node.removeEventListener('pointerleave', onleave);
      node.removeEventListener('focus', onfocus);
      node.removeEventListener('blur', onblur);
    }
  };
};
