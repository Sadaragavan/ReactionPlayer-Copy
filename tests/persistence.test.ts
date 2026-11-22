import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Electron's IPC copies arguments with the structured clone algorithm, which rejects a Proxy (what Svelte's `$state` hands out). */
describe('desktop settings persistence', () => {
  let written: Record<string, unknown> | null;

  beforeEach(() => {
    written = null;
    vi.resetModules();
    vi.stubGlobal('window', {
      electronAPI: {
        storage: {
          readSettings: async () => null,
          writeSettings: async (data: Record<string, unknown>) => {
            written = structuredClone(data); // throws like IPC would if given a proxy
          }
        }
      }
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('writes settings that come from reactive state', async () => {
    const { initPersistence, lsSet, flushSettings } = await import('../src/lib/stores/persistence');
    await initPersistence();
    const reactive = new Proxy({ playback: new Proxy({ loop: true }, {}), themeVars: new Proxy({ '--color-accent': 'x' }, {}) }, {});
    lsSet('reaction-player:settings', reactive);
    await flushSettings();
    expect(written).toEqual({ settings: { playback: { loop: true }, themeVars: { '--color-accent': 'x' } } });
  });

  it('does not write before the file has been read, so an early close cannot empty it', async () => {
    const { lsSet, flushSettings } = await import('../src/lib/stores/persistence');
    lsSet('reaction-player:last-session', 'ses_1');
    await flushSettings();
    expect(written).toBeNull();
  });
});
