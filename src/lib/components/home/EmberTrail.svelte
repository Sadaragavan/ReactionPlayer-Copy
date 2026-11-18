<script lang="ts">
  /**
   * The glow that follows the pointer across Home (see utils/embers.ts). It sits over everything with pointer events
   * off and blends with `screen`, so it lights the wallpaper and the menu text instead of covering them. Off when the
   * viewer prefers reduced motion; touch gets a small spray of sparks where it lands, not a trail.
   */
  import { onMount } from 'svelte';
  import { EmberField } from '$lib/utils/embers';

  let canvas: HTMLCanvasElement;

  onMount(() => {
    let field: EmberField;
    try {
      field = new EmberField(canvas, { ambient: true });
    } catch {
      return; // no 2D canvas: the menu works the same without the glow
    }

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const fit = () => {
      const r = canvas.getBoundingClientRect();
      field.resize(r.width, r.height, Math.min(window.devicePixelRatio || 1, 2));
    };
    const local = (e: PointerEvent): [number, number] => {
      const r = canvas.getBoundingClientRect();
      return [e.clientX - r.left, e.clientY - r.top];
    };

    const onmove = (e: PointerEvent) => {
      if (e.pointerType !== 'touch') field.move(...local(e));
    };
    const ondown = (e: PointerEvent) => field.burst(...local(e), e.pointerType === 'touch' ? 14 : 8);
    const onleave = () => field.leave();
    const onvisible = () => (document.hidden ? field.pause() : field.resume());
    const applyMotion = () => {
      if (reduced.matches) field.stop();
      else {
        fit();
        field.start();
      }
    };

    const ro = new ResizeObserver(fit);
    ro.observe(canvas);
    fit();
    applyMotion();
    reduced.addEventListener('change', applyMotion);
    window.addEventListener('pointermove', onmove, { passive: true });
    window.addEventListener('pointerdown', ondown, { passive: true });
    document.documentElement.addEventListener('pointerleave', onleave);
    document.addEventListener('visibilitychange', onvisible);

    return () => {
      ro.disconnect();
      reduced.removeEventListener('change', applyMotion);
      window.removeEventListener('pointermove', onmove);
      window.removeEventListener('pointerdown', ondown);
      document.documentElement.removeEventListener('pointerleave', onleave);
      document.removeEventListener('visibilitychange', onvisible);
      field.destroy();
    };
  });
</script>

<canvas bind:this={canvas} class="pointer-events-none absolute inset-0 z-20 size-full mix-blend-screen" aria-hidden="true"></canvas>
