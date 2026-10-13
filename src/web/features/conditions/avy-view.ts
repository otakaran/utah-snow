// Pure view logic for AvalanchePanel (spec §8.2, C.4): NAC level words, zone order and the resorts per zone.
// Colors come only from the --nac-* tokens (keyed by level), never from the payload's hex fields.
import { RESORT_IDS, RESORTS } from '../../../../config/resorts.ts';
import type { AvalancheZone } from '../../../shared/types.ts';

export type NacLevel = 1 | 2 | 3 | 4 | 5;

/** The five NAC levels with their full word and the short form used when the scale is narrow. */
export const NAC_SCALE: readonly { level: NacLevel; word: string; short: string; key: string }[] = [
  { level: 1, word: 'Low', short: 'Low', key: 'low' },
  { level: 2, word: 'Moderate', short: 'Mod', key: 'moderate' },
  { level: 3, word: 'Considerable', short: 'Consid', key: 'considerable' },
  { level: 4, word: 'High', short: 'High', key: 'high' },
  { level: 5, word: 'Extreme', short: 'Ext', key: 'extreme' },
];

/** Salt Lake (the Cottonwoods and Park City) first, then Ogden (Snowbasin). */
export const ZONE_ORDER = [1738, 1737] as const;

export interface ZoneView {
  level: NacLevel | null; // null = no rating
  title: string; // '3 · Considerable' or 'No rating (off-season)'
  key: string; // 'considerable' -> --nac-considerable; 'none' for no rating
}

export function zoneView(z: Pick<AvalancheZone, 'level' | 'offSeason'>): ZoneView {
  const n = NAC_SCALE.find((l) => l.level === z.level);
  if (!n) return { level: null, title: z.offSeason ? 'No rating (off-season)' : 'No rating', key: 'none' };
  return { level: n.level, title: `${n.level} · ${n.word}`, key: n.key };
}

/** Full names of the resorts in a UAC zone ('Alta, Snowbird, Brighton, Solitude, Deer Valley'). */
export const zoneResorts = (zoneId: number): string =>
  RESORT_IDS.filter((r) => RESORTS[r].uacZone === zoneId)
    .map((r) => RESORTS[r].name)
    .join(', ');

/** Zones in ZONE_ORDER (unknown ids last), optionally limited to `only`. */
export function orderZones(zones: readonly AvalancheZone[], only?: readonly number[]): AvalancheZone[] {
  const rank = (id: number) => {
    const i = (ZONE_ORDER as readonly number[]).indexOf(id);
    return i === -1 ? ZONE_ORDER.length : i;
  };
  return zones.filter((z) => !only || only.includes(z.zoneId)).sort((a, b) => rank(a.zoneId) - rank(b.zoneId));
}
