// Pure view logic for AvalanchePanel (spec §8.2, C.4): NAC level words, zone order, the resorts per zone and the
// stand-in zones shown while UAC has no ratings. Colors come only from the --nac-* tokens (keyed by level), never
// from the payload's hex fields.
import { RESORT_IDS, RESORTS, UAC_ZONES } from '../../../../config/resorts.ts';
import type { Badge } from '../../../shared/freshness.ts';
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

/** Unrated stand-ins for the UAC zones (names, the unlit scale and the forecast link) while the feed has no zones. */
export function placeholderZones(only?: readonly number[]): AvalancheZone[] {
  const zones = ZONE_ORDER.map((zoneId) => ({
    zoneId,
    name: UAC_ZONES[zoneId].name,
    link: UAC_ZONES[zoneId].url,
    level: -1,
    danger: 'no rating',
    color: '',
    fontColor: '',
    travelAdvice: '',
    validFrom: null,
    validTo: null,
    offSeason: false,
  }));
  return orderZones(zones, only);
}

/** Why the stand-ins have no rating, from the panel's freshness badge: off-season, the feed down, or neither. */
export function noRatingTitle(b: Badge | null | undefined): string {
  if (b === 'grey') return 'No rating (off-season)';
  return b === 'red' ? 'No rating – UAC feed down' : 'No rating';
}
