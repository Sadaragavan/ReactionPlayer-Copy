/**
 * Persistence layer.
 *
 *  - LocalStorage  → small, synchronous things (settings, profile, last session id)
 *  - IndexedDB     → sessions, presets, the wallpaper, file handles, the demo cloud mirror
 *
 * Every call is wrapped so a blocked or full store (private windows, embedded
 * previews, quota errors) degrades to “not saved” instead of breaking the app.
 */
import { DB_NAME, DB_VERSION } from '../constants';

export type StoreName = 'sessions' | 'presets' | 'handles' | 'kv' | 'cloud';

const STORES: Record<StoreName, IDBObjectStoreParameters> = {
  sessions: { keyPath: 'id' },
  presets: { keyPath: 'id' },
  handles: {},
  kv: {},
  cloud: { keyPath: 'id' }
};

/* ── LocalStorage ─────────────────────────────────────────── */

export function lsGet<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function lsSet(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or blocked: ignore */
  }
}

export function lsRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/* ── IndexedDB ────────────────────────────────────────────── */

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

export const idbGetAll = async <T>(store: StoreName): Promise<T[]> => (await run<T[]>(store, 'readonly', (s) => s.getAll())) ?? [];
export const idbGet = <T>(store: StoreName, key: IDBValidKey) => run<T>(store, 'readonly', (s) => s.get(key));
export const idbPut = (store: StoreName, value: unknown, key?: IDBValidKey) =>
  run(store, 'readwrite', (s) => (STORES[store].keyPath ? s.put(value) : s.put(value, key)));
export const idbDelete = (store: StoreName, key: IDBValidKey) => run(store, 'readwrite', (s) => s.delete(key));
export const idbClear = (store: StoreName) => run(store, 'readwrite', (s) => s.clear());

/** Wipes everything this app has stored locally. */
export async function clearAllLocalData(): Promise<void> {
  await Promise.all((Object.keys(STORES) as StoreName[]).map((s) => idbClear(s)));
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('reaction-player:')) localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}
