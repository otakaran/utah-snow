// Meta derived from a row payload at write time (spec §5.1 Meta.asOf, §5.8 status). Pure.
import { isoToMs } from '../../shared/time.ts';

type Obj = Record<string, unknown>;
const objOf = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const strOf = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);

/**
 * source_as_of: the payload's own time. `asOf` (stakes), `issuedAt` (nws:afd), `updateTime` (NWS grids),
 * `snow.reportAt` (resorts), else the newest `at` across a station map (obs, snotel). Null when none.
 */
export function asOfOf(v: unknown): string | null {
  const o = objOf(v);
  if (!o) return null;
  const own = strOf(o.asOf) ?? strOf(o.issuedAt) ?? strOf(o.updateTime) ?? strOf(objOf(o.snow)?.reportAt);
  if (own) return own;
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const e of Object.values(o)) {
    const at = strOf(objOf(e)?.at);
    const ms = isoToMs(at);
    if (at && ms !== null && ms > bestMs) [best, bestMs] = [at, ms];
  }
  return best;
}

/** 'offseason' (grey badge) for a preseason resort and for an avalanche list whose zones are all off-season. */
export function okStatusOf(id: string, v: unknown): 'ok' | 'offseason' {
  if (id.startsWith('resort:')) return objOf(v)?.season === 'preseason' ? 'offseason' : 'ok';
  if (id === 'avy:uac' && Array.isArray(v) && v.length > 0) {
    return v.every((z) => objOf(z)?.offSeason === true) ? 'offseason' : 'ok';
  }
  return 'ok';
}
