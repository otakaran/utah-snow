// Snowbird snow report -> SnowNumbers (spec §5.5 snow mapping, open item O12). Pure; throws ValidationError.
import { type Obj, obj, str } from '../../../shared/json.ts';
import { num, range, text } from '../../../shared/num.ts';
import { reportIsToday } from '../../../shared/season.ts';
import { isoUtc, zonedToUtc } from '../../../shared/time.ts';
import type { SnowNumbers } from '../../../shared/types.ts';
import { ValidationError } from '../types.ts';

// Plausibility gates in inches; a value outside its range becomes null.
const MAX = { overnight: 60, d1: 80, d2: 120, d3: 150, d7: 250, season: 1200, base: 400 } as const;

/** `snow-reports?sort=date&direction=desc&limit=1` -> its first report, or ValidationError. */
export function readReport(raw: unknown): Obj {
  const r0 = Array.isArray(raw) ? obj(raw[0]) : null;
  if (!r0) throw new ValidationError('snowbird: snow-reports is not a non-empty array of reports');
  if (!obj(r0.computed)) throw new ValidationError('snowbird: snow report has no computed totals');
  if (reportAtMs(r0) === null) throw new ValidationError('snowbird: snow report has no usable updated/date');
  return r0;
}

/** `updated` (epoch s) is the report time; the local `date` ('YYYY-MM-DD HH:mm:ss', Denver) is the fallback. */
function reportAtMs(r0: Obj): number | null {
  if (typeof r0.updated === 'number' && Number.isFinite(r0.updated) && r0.updated > 1e9) return r0.updated * 1000;
  const date = str(r0.date);
  return date ? zonedToUtc(date) : null;
}

/** O12: `computed['24_hour']` can read 0 while `overnight_amount` holds the night's snow, so take the larger. */
function new24(overnight: number | null, computed24: number | null): number | null {
  if (overnight === null) return computed24;
  if (computed24 === null) return overnight;
  return Math.max(overnight, computed24);
}

/** §5.5 snowbird row. While preseason every numeric field is null (off-season feeds carry last season's totals). */
export function snowNumbers(r0: Obj, now: number, preseason: boolean): SnowNumbers {
  const c = obj(r0.computed) ?? {};
  const atMs = reportAtMs(r0);
  const overnight = range(num(r0.overnight_amount), 0, MAX.overnight);
  const keep = (v: number | null) => (preseason ? null : v);
  return {
    overnightIn: keep(overnight),
    new12hIn: null, // Snowbird publishes no 12 h figure; overnight_amount (4 pm - 9 am) is the proxy
    new24hIn: keep(new24(overnight, range(num(c['24_hour']), 0, MAX.d1))),
    new48hIn: keep(range(num(c['48_hour']), 0, MAX.d2)),
    new72hIn: keep(range(num(c['72_hour']), 0, MAX.d3)),
    new7dIn: keep(range(num(c['7_day']), 0, MAX.d7)),
    stormTotalIn: null, // not published
    seasonTotalIn: keep(range(num(c.total), 0, MAX.season)),
    baseDepthIn: keep(range(num(r0.base_depth), 0, MAX.base)),
    reportAt: atMs === null ? null : isoUtc(atMs),
    reportIsToday: reportIsToday(atMs, now, str(r0.date)), // the local `date` must be today too
    area: 'primary',
    surface: null,
    text: text(r0.report, 600),
  };
}
