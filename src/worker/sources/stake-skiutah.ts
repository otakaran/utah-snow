// Ski Utah stake-still archive (spec §6.3): DV Ontario and Solitude 525820161. Job 'stake-skiutah' (slots 0/3/6/9),
// row 'stake:skiutah'. One conditional GET per cam (If-None-Match = the last ETag, which is the body's SHA-1,
// verified 2026-10-12 and on Wayback captures), so a 200 means new pixels and becomes one KV frame. A cam that fails
// keeps its last state with `err`; the job fails only when every cam fails. Pictures older than 24 h are not archived.
// The archive core is src/shared/stake-archive.ts (shared with stake-alta). Never use fetchx `bust` here: Ski Utah
// blob URLs answer 404 to any `_=` query, so the cache buster is `_ts`.
import type { CamId } from '../../../config/cams/index.ts';
import { readCam, type StakeFrame, type StakeShot, settle, toShot } from '../../shared/stake-archive.ts';
import type { StakeCam, StakeRow } from '../../shared/types.ts';
import {
  BudgetError,
  DeadlineError,
  type FetchCtx,
  type Output,
  type ParseCtx,
  type Source,
  ValidationError,
} from './types.ts';

export const SKIUTAH_BLOB_URL = 'https://www.skiutah.com/files/blob/webcam/';
export const SKIUTAH_STAKES = [
  { camId: 'deer-valley-ontario-snowstake-still', blob: 'ZFfEsBSprV7GfFinXUifK3' },
  { camId: 'solitude-snowstake-still', blob: '525820161' },
] as const satisfies readonly { camId: CamId; blob: string }[];
const ROW = 'stake:skiutah';
const KEY_RE = /\bkey=[^&\s"',;)]*/gi;

/** fetch() result per cam: the shot, or why its request failed. */
export interface SkiUtahShot {
  camId: string;
  shot: StakeShot | null;
  err: string | null;
}

const errText = (e: unknown): string =>
  (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(KEY_RE, 'key=***').slice(0, 200);
// Budget/deadline errors must reach the dispatcher (the job is deferred, not failed).
const isDeferral = (e: unknown): boolean => e instanceof BudgetError || e instanceof DeadlineError;

export const stakeSkiutah: Source<SkiUtahShot[]> = {
  id: 'stake-skiutah',
  staleAfterMin: 45,
  rows: [ROW],
  maxSubrequests: () => SKIUTAH_STAKES.length, // one conditional GET per cam; redirects are not followed
  probes: [{ hostId: 'skiutah', url: `${SKIUTAH_BLOB_URL}${SKIUTAH_STAKES[0].blob}` }],
  async fetch(ctx: FetchCtx): Promise<SkiUtahShot[]> {
    const ts = Math.floor(ctx.now / 1000);
    const settled = await Promise.allSettled(
      SKIUTAH_STAKES.map(async ({ camId, blob }) => {
        const etag = readCam(ctx.prev[ROW], camId)?.etag;
        // An explicit max-age=0 keeps the 304 working (workerd turns fetchx's no-store into `Cache-Control: no-cache`).
        const headers: Record<string, string> = etag ? { 'If-None-Match': etag, 'Cache-Control': 'max-age=0' } : {};
        const url = `${SKIUTAH_BLOB_URL}${blob}?_ts=${ts}`;
        return toShot(await ctx.fetch<ArrayBuffer>(url, { headers, body: 'bytes', follow: false }));
      }),
    );
    const failed = settled.flatMap((r) => (r.status === 'rejected' ? [r.reason as unknown] : []));
    const fatal = failed.length === settled.length ? failed[0] : failed.find(isDeferral);
    if (fatal !== undefined) throw fatal;
    return settled.map((r, i) => ({
      camId: SKIUTAH_STAKES[i]?.camId ?? '',
      shot: r.status === 'fulfilled' ? r.value : null,
      err: r.status === 'rejected' ? errText(r.reason) : null,
    }));
  },
  parse(raw: SkiUtahShot[], ctx: ParseCtx): Output {
    const cams: Record<string, StakeCam> = {};
    const frames: StakeFrame[] = [];
    const errs: string[] = [];
    let newest: StakeCam | null = null;
    for (const { camId } of SKIUTAH_STAKES) {
      const prev = readCam(ctx.prev[ROW], camId);
      const r = Array.isArray(raw) ? raw.find((x) => x?.camId === camId) : undefined;
      try {
        if (!r?.shot) throw new ValidationError(`${camId}: ${r?.err ?? 'no response'}`);
        const s = settle(camId, r.shot, prev, ctx.now);
        if (!s.ok) throw new ValidationError(s.error);
        cams[camId] = s.cam;
        if (s.frame) frames.push(s.frame);
      } catch (e) {
        if (!(e instanceof ValidationError)) throw e;
        errs.push(e.message);
        if (prev) cams[camId] = { ...prev, err: e.message };
      }
      const c = cams[camId];
      if (c && (!newest || c.t > newest.t)) newest = c;
    }
    if (errs.length === SKIUTAH_STAKES.length) throw new ValidationError(errs.join('; '));
    const row: StakeRow = { asOf: newest?.asOf ?? null, cams };
    return { rows: { [ROW]: row }, frames };
  },
};
