// UDOT road cams that are offline (spec §6.4, §5.3, Appendix A.7). Runs inside the maintenance job at 09/10/11Z:
// one batch of the 49 Cctv cams per hour (17/16/16, registry order). Job 'udot-cam-check', row `udot:cams`.
// Each check is a GET whose body is cancelled (fetchx body 'none'); `content-type: image/png` is UDOT's offline
// placeholder (md5 585afd074ba4e4c721d5b417f994b8e3 / 0e8aaf5e8aef3f335a6f2f8d21e447e6, for reference), which is
// also what an unknown id returns. Live cams are image/jpeg or image/gif (RWIS). The 3 VMS GIFs are not checked.
import { UDOT_CAMS } from '../../../config/cams/index.ts';
import { MAINT } from '../../../config/schedule.ts';
import { HOUR, isoUtc } from '../../shared/time.ts';
import type { CamDef, UdotCamState, UdotCamsRow } from '../../shared/types.ts';
import { type FetchCtx, type Output, type ParseCtx, type Source, ValidationError } from './types.ts';

export const UDOT_CAMS_ROW = 'udot:cams';
export const CCTV_URL = 'https://www.udottraffic.utah.gov/map/Cctv/';
/** 09, 10 and 11Z: MAINT.utcHours without its first hour (08Z = hdrelay-config and the prune). */
const UDOT_HOURS: readonly number[] = MAINT.utcHours.slice(1);
const BATCHES = UDOT_HOURS.length;

export interface CctvProbe {
  status: number; // 0 = the request threw
  type?: string; // content-type
  err?: string;
}
export interface UdotCamCheckRaw {
  batch: number;
  checks: Record<string, CctvProbe>; // cam id -> probe
}

/** The 49 Cctv cams in check order. */
export const CCTV = (UDOT_CAMS as readonly CamDef[])
  .filter((c) => c.kind === 'udot')
  .map((c) => ({ id: c.id, url: `${CCTV_URL}${c.id.replace(/^udot-/, '')}` }));

/** Batch 0/1/2 at 09/10/11Z; any other hour maps by hour % 3 (manual runs still check one batch). */
export function batchIndex(now: number): number {
  const hour = Math.floor(now / HOUR) % 24;
  const i = UDOT_HOURS.indexOf(hour);
  return i >= 0 ? i : hour % BATCHES;
}

/** The cams of one batch: 17, 16, 16 for 49 cams. */
export function batchCams(i: number): typeof CCTV {
  return CCTV.slice(Math.ceil((i * CCTV.length) / BATCHES), Math.ceil(((i + 1) * CCTV.length) / BATCHES));
}

/** True in the maintenance ticks that run this job (09, 10 and 11Z). */
export const udotCamCheckDue = (now: number): boolean => UDOT_HOURS.includes(Math.floor(now / HOUR) % 24);

/** true = live image, false = placeholder/gone, null = the probe told us nothing (keep the previous state). */
export function verdict(p: CctvProbe | undefined): boolean | null {
  if (!p) return null;
  if (p.status === 404 || p.status === 410) return false;
  if (p.status !== 200) return null;
  if (/^image\/png\b/i.test(p.type ?? '')) return false;
  return /^image\/(?:jpe?g|gif)\b/i.test(p.type ?? '') ? true : null;
}

/** Pure. Gate: the batch must contain at least one 200 image answer (all-HTML means a block page or outage). */
export function parseUdotCams(raw: unknown, ctx: ParseCtx): UdotCamsRow {
  const checks = (raw as Partial<UdotCamCheckRaw> | null)?.checks;
  if (!checks || typeof checks !== 'object') throw new ValidationError('udot-cam-check: no checks');
  const prev = ctx.prev[UDOT_CAMS_ROW];
  const row: UdotCamsRow = {};
  for (const { id } of CCTV) {
    const e = prev && typeof prev === 'object' ? (prev as Record<string, UdotCamState | undefined>)[id] : undefined;
    if (e && typeof e.online === 'boolean') row[id] = e;
  }
  const checkedAt = isoUtc(ctx.now);
  let images = 0;
  for (const { id } of CCTV) {
    const p = checks[id];
    if (p?.status === 200 && /^image\//i.test(p.type ?? '')) images++;
    const online = verdict(p);
    if (online !== null) row[id] = { online, checkedAt };
  }
  if (images === 0) throw new ValidationError(`udot-cam-check: no image in ${Object.keys(checks).length} checks`);
  return row;
}

export const udotCamCheck: Source<UdotCamCheckRaw> = {
  id: 'udot-cam-check',
  staleAfterMin: 2880,
  rows: [UDOT_CAMS_ROW],
  maxSubrequests: () => Math.ceil(CCTV.length / BATCHES), // 17: the largest batch; redirects are not followed
  probes: [{ hostId: 'udot-cctv', url: `${CCTV_URL}164559` }],
  async fetch(ctx: FetchCtx): Promise<UdotCamCheckRaw> {
    const batch = batchIndex(ctx.now);
    const cams = batchCams(batch);
    const opts = { body: 'none', follow: false, allowStatus: true, headers: { Accept: 'image/*' } } as const;
    const got = await Promise.all(
      cams.map(async ({ url }): Promise<CctvProbe> => {
        try {
          const res = await ctx.fetch(url, opts);
          const type = res.headers.get('content-type');
          return type ? { status: res.status, type } : { status: res.status };
        } catch (err) {
          return { status: 0, err: err instanceof Error ? err.name : 'Error' };
        }
      }),
    );
    return { batch, checks: Object.fromEntries(cams.map((c, i) => [c.id, got[i] ?? { status: 0 }])) };
  },
  parse: (raw: UdotCamCheckRaw, ctx: ParseCtx): Output => ({ rows: { [UDOT_CAMS_ROW]: parseUdotCams(raw, ctx) } }),
};
