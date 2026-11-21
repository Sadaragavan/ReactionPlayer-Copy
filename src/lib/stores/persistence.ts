/**
 * Persistence layer.
 *
 * Desktop (Electron): everything lives in files under the app's data folder, written atomically by the main process
 *   settings.json, presets.json, sessions/<id>.json, thumbnails/, wallpapers/
 * Browser (`npm run dev:web`): the same calls fall back to
 *   LocalStorage  → small, synchronous things (settings, last session id)
 *   IndexedDB     → sessions, presets, the wallpaper, file handles
 *
 * Every call is wrapped so a blocked or full store degrades to “not saved”
 * instead of breaking the app.
 */
import { DB_NAME, DB_VERSION } from '../constants';
import { desktop } from '../platform';
import type { Wallpaper } from '../types';

export type StoreName = 'sessions' | 'presets' | 'handles' | 'kv';

const STORES: Record<StoreName, IDBObjectStoreParameters> = {
  sessions: { keyPath: 'id' },
  presets: { keyPath: 'id' },
  handles: {},
  kv: {}
};

const KEY_PREFIX = 'reaction-player:';

/* ── Small synchronous values ─────────────────────────────── */

/** Desktop: the content of settings.json, loaded once at boot and written back (debounced) on every change. */
const settingsFile = new Map<string, unknown>();
let settingsTimer: ReturnType<typeof setTimeout> | null = null;
/** Settings are written back only after they have been read: closing during start-up must not replace the file with an empty one. */
let settingsRead = false;

const fileKey = (key: string) => (key.startsWith(KEY_PREFIX) ? key.slice(KEY_PREFIX.length) : key);

function scheduleSettingsWrite(): void {
  if (!desktop) return;
  if (settingsTimer) clearTimeout(settingsTimer);
  settingsTimer = setTimeout(() => void flushSettings(), 150);
}

/** Writes settings.json now. Called by the debounce and when the window is closing. */
export async function flushSettings(): Promise<void> {
  if (!desktop || !settingsRead) return;
  if (settingsTimer) clearTimeout(settingsTimer);
  settingsTimer = null;
  try {
    await desktop.storage.writeSettings(Object.fromEntries(settingsFile));
  } catch {
    /* the next change tries again */
  }
}

/** Loads the desktop settings file. Await it before reading any value. A no-op in the browser. */
export async function initPersistence(): Promise<void> {
  if (!desktop) return;
  let stored: Record<string, unknown> | null | undefined;
  try {
    stored = await desktop.storage.readSettings();
    for (const [k, v] of Object.entries(stored ?? {})) settingsFile.set(k, v);
    settingsRead = true;
  } catch {
    /* unreadable: start with defaults, and keep the file as it is until the user changes something */
    settingsRead = stored === undefined;
  }
}

export function lsGet<T>(key: string, fallback: T): T {
  if (desktop) return settingsFile.has(fileKey(key)) ? (settingsFile.get(fileKey(key)) as T) : fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function lsSet(key: string, value: unknown): void {
  if (desktop) {
    settingsFile.set(fileKey(key), value);
    scheduleSettingsWrite();
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or blocked: ignore */
  }
}

export function lsRemove(key: string): void {
  if (desktop) {
    settingsFile.delete(fileKey(key));
    scheduleSettingsWrite();
    return;
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/* ── IndexedDB (browser) ──────────────────────────────────── */

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [name, params] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, params);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T | undefined> {
  return openDb().then(
    (db) =>
      new Promise<T | undefined>((resolve) => {
        if (!db) return resolve(undefined);
        try {
          const tx = db.transaction(store, mode);
          const req = fn(tx.objectStore(store));
          req.onsuccess = () => resolve(req.result as T);
          req.onerror = () => resolve(undefined);
          tx.onabort = () => resolve(undefined);
        } catch {
          resolve(undefined);
        }
      })
  );
}

/* ── Desktop: sessions and presets as files ───────────────── */

/** The presets file is one document, so the list is kept here and rewritten whole on every change. */
let presetList: Record<string, unknown>[] | null = null;

async function loadPresets(): Promise<Record<string, unknown>[]> {
  if (presetList) return presetList;
  try {
    presetList = ((await desktop!.storage.readPresets()) as Record<string, unknown>[]) ?? [];
  } catch {
    presetList = [];
  }
  return presetList;
}

async function desktopGetAll<T>(store: StoreName): Promise<T[]> {
  try {
    if (store === 'sessions') return (await desktop!.storage.listSessions()) as T[];
    if (store === 'presets') return [...(await loadPresets())] as T[];
  } catch {
    /* unreadable: treat as empty */
  }
  return [];
}

async function desktopGet<T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> {
  try {
    if (store === 'sessions') return ((await desktop!.storage.readSession(String(key))) ?? undefined) as T | undefined;
    if (store === 'presets') return (await loadPresets()).find((p) => p.id === key) as T | undefined;
  } catch {
    /* fall through */
  }
  return undefined;
}

async function desktopPut(store: StoreName, value: unknown): Promise<IDBValidKey | undefined> {
  const id = (value as { id?: unknown } | null)?.id;
  if (typeof id !== 'string') return undefined;
  try {
    if (store === 'sessions') {
      await desktop!.storage.writeSession(id, value);
      return id;
    }
    if (store === 'presets') {
      const list = await loadPresets();
      const at = list.findIndex((p) => p.id === id);
      if (at >= 0) list[at] = value as Record<string, unknown>;
      else list.push(value as Record<string, unknown>);
      await desktop!.storage.writePresets(list);
      return id;
    }
  } catch {
    /* not saved */
  }
  return undefined;
}

async function desktopDelete(store: StoreName, key: IDBValidKey): Promise<void> {
  try {
    if (store === 'sessions') await desktop!.storage.deleteSession(String(key));
    else if (store === 'presets') {
      presetList = (await loadPresets()).filter((p) => p.id !== key);
      await desktop!.storage.writePresets(presetList);
    }
  } catch {
    /* not deleted */
  }
}

/* ── Stores: the same calls on both platforms ─────────────── */

export const idbGetAll = async <T>(store: StoreName): Promise<T[]> =>
  desktop ? desktopGetAll<T>(store) : ((await run<T[]>(store, 'readonly', (s) => s.getAll())) ?? []);

export const idbGet = <T>(store: StoreName, key: IDBValidKey): Promise<T | undefined> =>
  desktop ? desktopGet<T>(store, key) : run<T>(store, 'readonly', (s) => s.get(key));

/** Resolves to the stored key, or `undefined` when the value could not be saved. File handles are a browser-only idea: on desktop the path is the handle. */
export const idbPut = (store: StoreName, value: unknown, key?: IDBValidKey): Promise<IDBValidKey | undefined> => {
  if (desktop) return store === 'handles' || store === 'kv' ? Promise.resolve(undefined) : desktopPut(store, value);
  return run<IDBValidKey>(store, 'readwrite', (s) => (STORES[store].keyPath ? s.put(value) : s.put(value, key)));
};

export const idbDelete = async (store: StoreName, key: IDBValidKey): Promise<void> => {
  if (desktop) return desktopDelete(store, key);
  await run(store, 'readwrite', (s) => s.delete(key));
};

/* ── Wallpaper ────────────────────────────────────────────── */

const WALLPAPER_KEY = 'wallpaper';

export async function loadWallpaper(): Promise<Wallpaper | null> {
  if (desktop) {
    try {
      return (await desktop.storage.readWallpaper()) ?? null;
    } catch {
      return null;
    }
  }
  return (await run<Wallpaper>('kv', 'readonly', (s) => s.get(WALLPAPER_KEY))) ?? null;
}

/** Keeps the wallpaper. Resolves to what to show (on desktop an uploaded picture comes back as a `local-media://` file), or null when it could not be kept. */
export async function saveWallpaper(wallpaper: Wallpaper): Promise<Wallpaper | null> {
  if (desktop) {
    try {
      return await desktop.storage.writeWallpaper(wallpaper);
    } catch {
      return null;
    }
  }
  const stored = await run<IDBValidKey>('kv', 'readwrite', (s) => s.put(wallpaper, WALLPAPER_KEY));
  return stored === undefined ? null : wallpaper;
}

export async function removeWallpaper(): Promise<void> {
  if (desktop) {
    try {
      await desktop.storage.deleteWallpaper();
    } catch {
      /* nothing to remove */
    }
    return;
  }
  await run('kv', 'readwrite', (s) => s.delete(WALLPAPER_KEY));
}

/** Wipes everything this app has stored locally. */
export async function clearAllLocalData(): Promise<void> {
  if (desktop) {
    settingsFile.clear();
    presetList = [];
    if (settingsTimer) clearTimeout(settingsTimer);
    settingsTimer = null;
    await desktop.storage.clearAll();
    return;
  }
  await Promise.all((Object.keys(STORES) as StoreName[]).map((s) => run(s, 'readwrite', (st) => st.clear())));
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith(KEY_PREFIX)) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
