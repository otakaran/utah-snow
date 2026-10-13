// Alta Collins snow-stake archive (spec §6.3). Job 'stake-alta' (every tick), row 'stake:alta'.
// One conditional GET (If-Modified-Since = the last Last-Modified): a 304 ends the job; a 200 whose content hash is
// new becomes one KV frame in Output.frames (the dispatcher does KV put, then the stake_frames index row).
// The hash is the upstream ETag (DO Spaces: MD5 of the body; verified 2026-10-12), so an upload of identical pixels
// moves the validators but neither `t` nor `asOf` (the 'unchanged' check). Pictures older than 24 h are not
// archived (off-season or frozen cam): no timelapse window could show them. The archive core is
// src/shared/stake-archive.ts (shared with stake-skiutah).
import type { CamId } from '../../../config/cams/index.ts';
import { readCam, type StakeFrame, type StakeShot, settle, toShot } from '../../shared/stake-archive.ts';
import { MIN } from '../../shared/time.ts';
import type { StakeRow } from '../../shared/types.ts';
import { type FetchCtx, type Output, type ParseCtx, type Source, ValidationError } from './types.ts';

export const STAKE_ALTA_URL = 'https://alta-webcams.sfo3.cdn.digitaloceanspaces.com/Collins_Snow_Stake.jpg';
export const STAKE_ALTA_CAM = 'alta-collins-stake' satisfies CamId;
const ROW = 'stake:alta';

export const stakeAlta: Source<StakeShot> = {
  id: 'stake-alta',
  staleAfterMin: 15,
  rows: [ROW],
  maxSubrequests: () => 1, // one conditional GET; redirects are not followed
  probes: [{ hostId: 'alta-do-stake', url: STAKE_ALTA_URL }], // cam-status probes the same host as 'alta-do'
  async fetch(ctx: FetchCtx): Promise<StakeShot> {
    const prev = readCam(ctx.prev[ROW], STAKE_ALTA_CAM);
    // fetchx's cache:'no-store' makes workerd send `Cache-Control: no-cache`, which defeats the 304; max-age=0 does not.
    const headers: Record<string, string> = prev ? { 'If-Modified-Since': prev.lm, 'Cache-Control': 'max-age=0' } : {};
    const url = `${STAKE_ALTA_URL}?t=${Math.floor(ctx.now / MIN)}`;
    return toShot(await ctx.fetch<ArrayBuffer>(url, { headers, body: 'bytes', follow: false }));
  },
  parse(raw: StakeShot, ctx: ParseCtx): Output {
    const r = settle(STAKE_ALTA_CAM, raw, readCam(ctx.prev[ROW], STAKE_ALTA_CAM), ctx.now);
    if (!r.ok) throw new ValidationError(r.error);
    const row: StakeRow = { asOf: r.cam.asOf, cams: { [STAKE_ALTA_CAM]: r.cam } };
    const frames: StakeFrame[] = r.frame ? [r.frame] : [];
    return { rows: { [ROW]: row }, frames };
  },
};
