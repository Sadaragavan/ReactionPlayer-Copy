/**
 * Preset library: the built-in “standard” presets plus the user's own.
 * Custom presets are unlimited.
 */
import { builtInPresets } from '../engine/layouts';
import { migratePreset } from '../engine/migrate';
import type { ID, Preset } from '../types';
import { uid } from '../utils/format';
import { idbDelete, idbGetAll, idbPut } from './persistence';

class PresetStore {
  readonly builtIn: Preset[] = builtInPresets();
  custom = $state<Preset[]>([]);

  get all(): Preset[] {
    return [...this.builtIn, ...this.custom];
  }

  /** Presets that fit a session of `n` videos (a preset never needs more slots than videos). */
  forCount(n: number): Preset[] {
    return this.all.filter((p) => p.slots.length <= n);
  }

  byId(id: ID | undefined): Preset | undefined {
    return id ? this.all.find((p) => p.id === id) : undefined;
  }

  async init(): Promise<void> {
    const stored = await idbGetAll<Preset>('presets');
    this.custom = stored.map(migratePreset).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Adds a new preset, or replaces the one with the same id. */
  async save(input: Omit<Preset, 'id' | 'builtIn' | 'createdAt' | 'updatedAt'> & { id?: ID }): Promise<Preset> {
    const existing = input.id ? this.custom.find((p) => p.id === input.id) : undefined;
    const now = Date.now();
    const preset: Preset = {
      ...input,
      id: existing?.id ?? uid('pre'),
      builtIn: false,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now
    };
    this.custom = [preset, ...this.custom.filter((p) => p.id !== preset.id)];
    await idbPut('presets', $state.snapshot(preset));
    return preset;
  }

  async rename(id: ID, name: string): Promise<void> {
    const p = this.custom.find((x) => x.id === id);
    if (!p) return;
    p.name = name.trim() || p.name;
    p.updatedAt = Date.now();
    await idbPut('presets', $state.snapshot(p));
  }

  async remove(id: ID): Promise<void> {
    this.custom = this.custom.filter((p) => p.id !== id);
    await idbDelete('presets', id);
  }
}

export const presets = new PresetStore();
