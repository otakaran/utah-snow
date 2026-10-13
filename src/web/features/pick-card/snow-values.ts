// Overnight inches per resort as the card and the ridge chart show them (imperial; convert at render).
// The resort report wins; without one, the pick's own fresh-snow input (SNOTEL or NWS) fills in.
import { RESORT_IDS } from '../../../../config/resorts.ts';
import type { PickResult, ResortId, Snapshot } from '../../../shared/types.ts';

/** Today's resort report overnight inches; null while pre-season, before today's report, or missing. */
export function overnightOf(snap: Snapshot | null, id: ResortId): number | null {
  const data = snap?.resorts?.[id]?.data;
  if (!data || data.season === 'preseason' || data.snow?.reportIsToday === false) return null;
  const v = data.snow?.overnightIn;
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

const NOTE = { report: '', snotel: 'SNOTEL', forecast: 'forecast', none: '' } as const;

/** The overnight number for one resort, with a short source note when it is not the resort report. */
export function overnightFor(
  snap: Snapshot | null,
  r: PickResult | null,
  id: ResortId | null,
): { inches: number | null; note: string } {
  if (!id) return { inches: null, note: '' };
  const report = overnightOf(snap, id);
  if (report !== null) return { inches: report, note: '' };
  const f = r?.ranked.find((x) => x.resort === id)?.fresh;
  return f && f.source !== 'none' ? { inches: f.overnightIn, note: NOTE[f.source] } : { inches: null, note: '' };
}

/** The pick's overnight number. */
export const pickOvernight = (snap: Snapshot | null, r: PickResult): { inches: number | null; note: string } =>
  overnightFor(snap, r, r.pick);

/** All six resorts in canonical order (the ridge chart). */
export function overnightAll(snap: Snapshot | null, r: PickResult | null): { id: ResortId; inches: number | null }[] {
  return RESORT_IDS.map((id) => ({ id, inches: overnightFor(snap, r, id).inches }));
}
