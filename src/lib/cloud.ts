/**
 * Cloud session sync (Pro).
 *
 * `cloud.adapter` is the seam for a real backend: implement `CloudSyncAdapter`
 * (REST, Supabase, Firebase …) and assign it before the app mounts. The default
 * adapter mirrors sessions into a second IndexedDB store, which exercises the
 * whole Pro flow — push on save, pull on “Sync now” — without a server.
 */
import { idbGetAll, idbPut } from './stores/persistence';
import type { CloudSyncAdapter, Session } from './types';

class LocalMirrorAdapter implements CloudSyncAdapter {
  readonly name = 'Local mirror (demo)';

  isAvailable(): boolean {
    return typeof indexedDB !== 'undefined';
  }

  async push(sessions: Session[]): Promise<{ syncedAt: number }> {
    const syncedAt = Date.now();
    for (const s of sessions) await idbPut('cloud', { ...s, syncedAt });
    return { syncedAt };
  }

  pull(): Promise<Session[]> {
    return idbGetAll<Session>('cloud');
  }
}

class CloudSync {
  adapter: CloudSyncAdapter = new LocalMirrorAdapter();

  get name(): string {
    return this.adapter.name;
  }

  /** Never throws: a failed push just leaves the session unsynced. */
  async push(sessions: Session[]): Promise<{ syncedAt: number } | null> {
    if (!sessions.length || !this.adapter.isAvailable()) return null;
    try {
      return await this.adapter.push(sessions);
    } catch {
      return null;
    }
  }

  async pull(): Promise<Session[]> {
    if (!this.adapter.isAvailable()) return [];
    try {
      return await this.adapter.pull();
    } catch {
      return [];
    }
  }
}

export const cloud = new CloudSync();
