// Instant <-> wire-string helpers of src/shared/time.ts: ISO out (UTC or Denver with offset), HTTP dates in.
import { MIN, offsetText, pad, ymd } from './base.ts';
import { MON_SHORT } from './format.ts';
import { denverOffsetMin } from './zone.ts';

const MAX_MS = 8.64e15; // the Date range
const IMF_RE = /^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) ([A-Z][a-z]{2}) (\d{4}) (\d{2}):(\d{2}):(\d{2}) GMT$/;

const valid = (ms: number): boolean => Number.isFinite(ms) && Math.abs(ms) <= MAX_MS;

/** '2026-12-27T13:05:00.000Z'; '' when `ms` is not a valid instant. */
export const isoUtc = (ms: number): string => (valid(ms) ? new Date(ms).toISOString() : '');

/**
 * Wall time with its offset, seconds precision: '2026-12-27T06:05:07-07:00'. The offset is Denver's at `ms` unless
 * `offsetMin` pins one (Alta's DST flag). '' when `ms` is not a valid instant.
 */
export function isoLocal(ms: number, offsetMin?: number): string {
  if (!valid(ms)) return '';
  const off = offsetMin ?? denverOffsetMin(ms);
  const d = new Date(ms + off * MIN);
  return `${ymd(d)}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}${offsetText(off)}`;
}

/**
 * RFC 9110 IMF-fixdate ('Tue, 13 Oct 2026 01:48:10 GMT', the only Last-Modified/Date form servers may send) -> epoch
 * ms; null for anything else, including the obsolete RFC 850/asctime forms and impossible dates ('31 Feb').
 */
export function httpDateToMs(imf: string | null | undefined): number | null {
  const m = imf ? IMF_RE.exec(imf.trim()) : null;
  if (!m) return null;
  const mon = MON_SHORT.indexOf(m[2] ?? '');
  const [day, year, h, mi, s] = [m[1], m[3], m[4], m[5], m[6]].map(Number) as [number, number, number, number, number];
  if (mon < 0 || h > 23 || mi > 59 || s > 59) return null;
  const ms = Date.UTC(year, mon, day, h, mi, s);
  return new Date(ms).getUTCDate() === day ? ms : null;
}
