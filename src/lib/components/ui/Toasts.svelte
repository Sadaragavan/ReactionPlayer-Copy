<script lang="ts">
  /** Bottom-centre notices. Errors say what happened and what to do next. */
  import { AlertTriangle, Check, Info, X } from '@lucide/svelte';
  import { ui } from '$lib/stores/ui.svelte';
</script>

<div class="pointer-events-none fixed inset-x-0 bottom-24 z-[400] flex flex-col items-center gap-2 px-4" aria-live="polite">
  {#each ui.toasts as t (t.id)}
    <div
      role={t.kind === 'error' ? 'alert' : 'status'}
      class="pop-in pointer-events-auto flex max-w-[min(32rem,100%)] items-center gap-3 border border-line-strong bg-black py-2.5 pr-2 pl-3.5 text-[13px] shadow-[0_12px_40px_rgb(0_0_0/0.8)]"
      style="border-left: 2px solid {t.kind === 'error' ? 'var(--color-danger)' : t.kind === 'success' ? 'var(--color-accent)' : 'var(--color-fg-3)'}"
    >
      {#if t.kind === 'error'}<AlertTriangle size={16} class="shrink-0 text-danger" />
      {:else if t.kind === 'success'}<Check size={16} class="shrink-0 text-accent" />
      {:else}<Info size={16} class="shrink-0 text-fg-2" />{/if}
      <span class="min-w-0">{t.message}</span>
      {#if t.action}
        <button
          class="shrink-0 rounded px-2 py-1 font-semibold text-accent hover:bg-hover"
          onclick={() => {
            t.action?.run();
            ui.dismiss(t.id);
          }}>{t.action.label}</button
        >
      {/if}
      <button class="grid size-6 shrink-0 place-items-center rounded text-fg-3 hover:bg-hover hover:text-fg" aria-label="Dismiss" onclick={() => ui.dismiss(t.id)}>
        <X size={14} />
      </button>
    </div>
  {/each}
</div>
