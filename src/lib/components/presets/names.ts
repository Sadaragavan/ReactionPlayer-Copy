/** Names and icons for the slots of a preset, shared by the studio's panels. */
import { Film, Layers, UserRound } from '@lucide/svelte';
import type { IconComponent, VideoRole } from '$lib/types';

export const SLOT_ICON: Record<VideoRole, IconComponent> = { source: Film, reaction: UserRound, extra: Layers };

/** “Source”, “Reaction”, then “Extra 1”, “Extra 2” for the Pro slots. */
export function slotName(role: VideoRole, index: number): string {
  if (role === 'source') return 'Source';
  if (role === 'reaction') return 'Reaction';
  return `Extra ${index - 1}`;
}
