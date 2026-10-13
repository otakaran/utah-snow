// UAC avalanche danger from the NAC map layer (spec §5.4 'avy', C.4). Job id 'avy', row 'avy:uac'.
// The UAC's own API needs a token and is out of scope (O22); NAC has no bottom-line text for UAC.
import { NAC_LEVELS, UAC_ZONES } from '../../../config/resorts.ts';
import { num, text } from '../../shared/num.ts';
import { isoToMs } from '../../shared/time.ts';
import type { AvalancheZone } from '../../shared/types.ts';
import { type FetchCtx, type Output, type Source, ValidationError } from './types.ts';

// Path form only: `map-layer?center_id=UAC` ignores the filter and returns all ~84 US zones.
export const AVY_URL = 'https://api.avalanche.org/v2/public/products/map-layer/UAC';
const ROW = 'avy:uac';
const ZONE_IDS = Object.keys(UAC_ZONES).map(Number) as (keyof typeof UAC_ZONES)[];
const HEX_RE = /^#[0-9a-f]{6}$/i;
const ZONED_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

type Props = Record<string, unknown>;

function json(raw: unknown): unknown {
  if (typeof raw !== 'string') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new ValidationError('avy: body is not JSON');
  }
}

/** NAC sends UTC stamps without a zone ('2026-01-15T13:42:00'): append Z. Null when missing or unparseable. */
function utcIso(v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = ZONED_RE.test(v.trim()) ? v.trim() : `${v.trim()}Z`;
  return isoToMs(s) === null ? null : s;
}

/** -1 (no rating) or 1..5; anything else (0, fractions, junk) counts as no rating. */
function levelOf(v: unknown): number {
  const n = num(v);
  return n !== null && Number.isInteger(n) && n >= 1 && n <= 5 ? n : -1;
}

function zone(id: keyof typeof UAC_ZONES, p: Props): AvalancheZone {
  const level = levelOf(p.danger_level);
  const nac = NAC_LEVELS.find((l) => l.level === level) ?? NAC_LEVELS[0];
  const danger = typeof p.danger === 'string' && p.danger.trim() ? p.danger.trim().toLowerCase() : nac.danger;
  const link = typeof p.link === 'string' && p.link.startsWith('https://') ? p.link : UAC_ZONES[id].url;
  const validFrom = utcIso(p.start_date);
  return {
    zoneId: id,
    name: text(p.name, 80) ?? UAC_ZONES[id].name,
    danger,
    level,
    color: typeof p.color === 'string' && HEX_RE.test(p.color) ? p.color : nac.color,
    fontColor: typeof p.font_color === 'string' && HEX_RE.test(p.font_color) ? p.font_color : nac.fontColor,
    travelAdvice: text(p.travel_advice, 600) ?? '',
    link,
    validFrom,
    validTo: utcIso(p.end_date),
    // NAC's flag is unreliable pre-season (2026-10-12: off_season false, no rating, no product dates),
    // so an unrated zone with no current product also counts as off-season.
    offSeason: p.off_season === true || (level === -1 && validFrom === null),
  };
}

/** Pure: map-layer FeatureCollection -> the UAC zones in config (1737 Ogden, 1738 Salt Lake). */
export function parseAvalanche(raw: unknown): AvalancheZone[] {
  const doc = json(raw) as { features?: unknown } | null;
  const features = doc && typeof doc === 'object' && Array.isArray(doc.features) ? doc.features : null;
  if (!features) throw new ValidationError('avy: no features[]');
  const byId = new Map<number, Props>();
  for (const f of features as { id?: unknown; properties?: unknown }[]) {
    const id = num(f?.id);
    if (id !== null && f.properties && typeof f.properties === 'object') byId.set(id, f.properties as Props);
  }
  return ZONE_IDS.map((id) => {
    const p = byId.get(id);
    if (!p) throw new ValidationError(`avy: zone ${id} missing`); // gate: features include 1737 and 1738
    return zone(id, p);
  });
}

export const avalanche: Source<string> = {
  id: 'avy',
  staleAfterMin: 180,
  rows: [ROW],
  maxSubrequests: () => 1, // one GET; redirects are not followed
  probes: [{ hostId: 'avy', url: AVY_URL }],
  async fetch(ctx: FetchCtx): Promise<string> {
    const res = await ctx.fetch<string>(AVY_URL, { headers: { Accept: 'application/json' }, follow: false });
    if (res.status !== 200) throw new Error(`avy: HTTP ${res.status} (redirects are not followed)`);
    return res.data;
  },
  parse(raw: string): Output {
    return { rows: { [ROW]: parseAvalanche(raw) } };
  },
};
