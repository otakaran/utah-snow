// Fresh snow per resort (spec §10.2 step 2): today's resort report, else SNOTEL depth gain since 16:00, else the
// discounted NWS overnight forecast. Tomorrow mode uses tonight's forecast only. Raw inches; weights in effOf.
import { RESORTS, SNOTEL } from '../../../config/resorts.ts';
import { STRATEGY } from '../../../config/strategy.ts';
import { usable } from '../freshness.ts';
import { formatClock, formatClockRel } from '../time.ts';
import type { PickFresh, PointForecast, ResortId, Snapshot } from '../types.ts';

export type RunMode = 'today' | 'tomorrow' | 'preview';

const NONE: PickFresh = { overnightIn: 0, extraIn: 0, dayIn: 0, source: 'none', label: 'no data' };

/** The resort's summit point forecast, if the snapshot has a complete one ('{}' placeholder rows count as none). */
export function summitForecast(snap: Snapshot, r: ResortId): PointForecast | null {
  const fc = snap.forecast[`${r}:summit`]?.data;
  return fc && typeof fc.overnight === 'object' && fc.overnight !== null ? fc : null;
}

function forecastLabel(fc: PointForecast, nowMs: number): string {
  const at = formatClockRel(fc.overnight.issuedAt || fc.updateTime, nowMs);
  return at ? `NWS forecast issued ${at}` : 'NWS forecast';
}

/** Report numbers when the resort row is usable and today's report has an overnight figure. */
function fromReport(snap: Snapshot, r: ResortId, nowMs: number, dayIn: number): PickFresh | null {
  const block = snap.resorts[r];
  const s = block?.data?.snow;
  if (!block || !s || !usable(block.meta, nowMs) || !s.reportIsToday || s.overnightIn == null) return null;
  let o = s.overnightIn;
  if (r === 'deer-valley' && s.summit?.overnightIn != null) o = (o + s.summit.overnightIn) / 2;
  if (r === 'snowbird') o = Math.max(o, s.new24hIn ?? 0);
  const extraIn = Math.max(0, (s.new24hIn ?? o) - o);
  const at = s.reportAt ? formatClock(s.reportAt) : '';
  return { overnightIn: o, extraIn, dayIn, source: 'report', label: at ? `resort report ${at}` : 'resort report' };
}

/** SNOTEL depth gain since 16:00 at the resort's primary station (no Snowbasin: its stations are distant proxies). */
function fromSnotel(snap: Snapshot, r: ResortId, nowMs: number, dayIn: number): PickFresh | null {
  if (r === 'snowbasin' || !snap.snotel || !usable(snap.snotel.meta, nowMs)) return null;
  const triplet = RESORTS[r].snotel.primary;
  const gain = snap.snotel.data?.[triplet]?.snwdSince16In;
  if (gain == null) return null;
  return {
    overnightIn: Math.max(0, gain),
    extraIn: 0,
    dayIn,
    source: 'snotel',
    label: `SNOTEL ${SNOTEL[triplet].name}`,
  };
}

export function fresh(snap: Snapshot, r: ResortId, mode: RunMode, nowMs: number): PickFresh {
  const fc = summitForecast(snap, r);
  if (mode === 'tomorrow') {
    if (!fc) return NONE;
    const o = STRATEGY.forecastDiscount * fc.tonightSnowIn;
    const label = forecastLabel(fc, nowMs);
    return { overnightIn: o, extraIn: 0, dayIn: fc.tomorrowDaytimeSnowIn, source: 'forecast', label };
  }
  const dayIn = fc?.todayDaytimeSnowIn ?? 0;
  const known = fromReport(snap, r, nowMs, dayIn) ?? fromSnotel(snap, r, nowMs, dayIn);
  if (known) return known;
  if (!fc) return NONE;
  const o = STRATEGY.forecastDiscount * fc.overnight.snowIn;
  return { overnightIn: o, extraIn: 0, dayIn, source: 'forecast', label: forecastLabel(fc, nowMs) };
}

/** eff = overnight + 0.5 x rest of the 24 h + 0.5 x daytime forecast (raw inches, compared with thresholds). */
export const effOf = (f: PickFresh): number =>
  f.overnightIn + STRATEGY.extra24Weight * f.extraIn + STRATEGY.daytimeWeight * f.dayIn;
