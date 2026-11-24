/**
 * Converted audio, as the player sees it: asks the main process to convert a track Chromium cannot decode, remembers the
 * result, and reports progress for the layer that is waiting on it.
 */
import { desktop } from '../platform';
import { ui } from '../stores/ui.svelte';
import type { ID } from '../types';

export interface ProxyStatus {
  /** 0–1. */
  fraction: number;
  error?: string;
}

class AudioProxy {
  /** Layers whose audio is being converted (or failed to be), by layer id. */
  status = $state<Record<ID, ProxyStatus>>({});
  readonly #urls = new Map<string, string>();
  readonly #waiting = new Map<string, Set<ID>>();

  constructor() {
    desktop?.proxy.onProgress((e) => {
      for (const id of this.#waiting.get(`${e.path}|${e.index}`) ?? []) if (this.status[id] && !this.status[id].error) this.status[id] = { fraction: e.fraction };
    });
  }

  /** The URL of the converted audio of track `index`, converting it first if need be. Null when it could not be converted. */
  async ensure(layerId: ID, path: string, index: number, title: string): Promise<string | null> {
    if (!desktop) return null;
    const key = `${path}|${index}`;
    const known = this.#urls.get(key);
    if (known) return known;
    (this.#waiting.get(key) ?? this.#waiting.set(key, new Set()).get(key)!).add(layerId);
    this.status[layerId] = { fraction: 0 };
    try {
      const { url } = await desktop.proxy.prepareAudio(path, index);
      this.#urls.set(key, url);
      this.#clear(key, layerId);
      return url;
    } catch (err) {
      this.#waiting.get(key)?.delete(layerId);
      this.status[layerId] = { fraction: 0, error: err instanceof Error ? err.message : 'The audio conversion failed.' };
      ui.toast(`Couldn’t convert the audio of “${title}”, so it plays without sound.`, 'error');
      return null;
    }
  }

  #clear(key: string, layerId: ID): void {
    this.#waiting.get(key)?.delete(layerId);
    const { [layerId]: _done, ...rest } = this.status;
    this.status = rest;
  }

  /** Forgets a layer's status (its audio changed, or it went away). */
  forget(layerId: ID): void {
    if (!this.status[layerId]) return;
    const { [layerId]: _gone, ...rest } = this.status;
    this.status = rest;
  }
}

export const audioProxy = new AudioProxy();
