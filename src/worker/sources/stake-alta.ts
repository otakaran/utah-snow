// Alta Collins snow-stake archive (spec §6.3). Job 'stake-alta' (every tick), row 'stake:alta'.
// One conditional GET (If-Modified-Since = the last Last-Modified): a 304 ends the job; a 200 whose content hash is
// new becomes one KV frame in Output.frames (the dispatcher does KV put, then the stake_frames index row).
// The hash is the upstream ETag (DO Spaces: MD5 of the body; verified 2026-10-12), so an upload of identical pixels
// moves the validators but neither `t` nor `asOf` (the 'unchanged' check). Pictures older than 24 h are not
// archived (off-season or frozen cam): no timelapse window could show them.
import type { CamId } from '../../../config/cams/index.ts';
import { isoToMs } from '../../shared/time.ts';
import { type FetchCtx, type FetchResult, type Output, type ParseCtx, type Source, ValidationError } from './types.ts';

export const STAKE_ALTA_URL = 'https://alta-webcams.sfo3.cdn.digitaloceanspaces.com/Collins_Snow_Stake.jpg';
export const STAKE_ALTA_CAM = 'alta-collins-stake' satisfies CamId;
const ROW = 'stake:alta';
const FRESH_MS = 24 * 3_600_000;
const SKEW_MS = 10 * 60_000; // a Last-Modified further ahead of the tick than this is rejected
const MIN_BYTES = 1024;
const MAX_BYTES = 8 * 1024 * 1024; // KV allows 25 MiB; the Collins frame is ~0.45 MB
const MONTHS = 'JanFebMarAprMayJunJulAugSepOctNovDec';
const IMF_RE = /^[A-Z][a-z]{2}, (\d{2}) ([A-Z][a-z]{2}) (\d{4}) (\d{2}:\d{2}:\d{2}) GMT$/;
const DIGEST_RE = /^(?:[0-9a-f]{32}(?:-\d+)?|[0-9a-f]{40})$/; // MD5 (S3, '-N' multipart) or SHA-1

/** One conditional GET, reduced to what parse() reads. */
export interface StakeShot {
  status: number; // 200 or 304 (fetch throws on anything else)
  lm: string | null;
  etag: string | null;
  type: string | null;
  body: ArrayBuffer | null; // 200 only
  hash: string | null; // the ETag digest, or SHA-1 of the body when the ETag is missing or weak
}

/** Archive state of one stake cam: `cams[camId]` of the row (same shape in stake:skiutah). */
export interface StakeCam {
  t: number; // Last-Modified (ms) of the newest distinct picture; its KV key is cam:{camId}:{t}
  asOf: string; // the same instant, ISO
  hash: string;
  bytes: number;
  archived: boolean; // a frame for `t` went to Output.frames (false when the picture was older than 24 h)
  lm: string; // validators of the last 200; they move on unchanged uploads too
  etag: string | null;
  err?: string; // stake:skiutah only: this cam failed in the last run
}
export interface StakeRow {
  asOf: string | null; // newest `t` over the cams
  cams: Record<string, StakeCam>;
}
/** Output.frames entry plus what the KV writer needs for the stake_frames row and the KV metadata. */
export interface StakeFrame {
  key: string;
  t: number;
  bytes: ArrayBuffer;
  camId: string;
  meta: { lm: string; etag: string | null; bytes: number };
}

/** RFC 9110 IMF-fixdate ('Tue, 13 Oct 2026 01:48:10 GMT') -> ISO string, or null. */
function httpDateIso(v: string | null): string | null {
  const m = v ? IMF_RE.exec(v.trim()) : null;
  const mon = m ? MONTHS.indexOf(m[2] ?? '') : -1;
  if (!m || mon < 0 || mon % 3) return null;
  return `${m[3]}-${String(mon / 3 + 1).padStart(2, '0')}-${m[1]}T${m[4]}Z`;
}

/** A strong ETag that is a content digest, normalized; null otherwise. */
function etagDigest(etag: string | null): string | null {
  if (!etag || etag.startsWith('W/')) return null;
  const v = etag.replace(/"/g, '').trim().toLowerCase();
  return DIGEST_RE.test(v) ? v : null;
}

async function sha1Hex(buf: ArrayBuffer): Promise<string> {
  let s = '';
  for (const b of new Uint8Array(await crypto.subtle.digest('SHA-1', buf))) s += b.toString(16).padStart(2, '0');
  return s;
}

async function toShot(res: FetchResult<ArrayBuffer>): Promise<StakeShot> {
  if (res.status !== 200 && res.status !== 304) throw new Error(`HTTP ${res.status} (redirects are not followed)`);
  const h = res.headers;
  const etag = h.get('etag');
  const body = res.status === 200 ? res.data : null;
  const hash = body ? (etagDigest(etag) ?? (await sha1Hex(body))) : null;
  return { status: res.status, lm: h.get('last-modified'), etag, type: h.get('content-type'), body, hash };
}

/** The previous run's state of one cam from a last-good row, or null when absent or malformed. */
export function readCam(row: unknown, camId: string): StakeCam | null {
  const cams = row && typeof row === 'object' ? (row as { cams?: unknown }).cams : null;
  const c = cams && typeof cams === 'object' ? (cams as Record<string, Partial<StakeCam>>)[camId] : null;
  if (!c || typeof c.t !== 'number' || !Number.isFinite(c.t) || typeof c.lm !== 'string') return null;
  if (typeof c.asOf !== 'string' || typeof c.hash !== 'string' || typeof c.bytes !== 'number') return null;
  const etag = typeof c.etag === 'string' ? c.etag : null;
  return { t: c.t, asOf: c.asOf, hash: c.hash, bytes: c.bytes, archived: c.archived === true, lm: c.lm, etag };
}

function isJpeg(body: ArrayBuffer, type: string | null): boolean {
  if (body.byteLength < MIN_BYTES || body.byteLength > MAX_BYTES) return false;
  if (type !== null && !/^image\/jpe?g\b/i.test(type)) return false;
  const u = new Uint8Array(body, 0, 3);
  return u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff;
}

/** Pure: one shot against the previous state -> the new state and, for a new fresh picture, its frame. */
export function settle(
  camId: string,
  s: StakeShot,
  prev: StakeCam | null,
  now: number,
): { cam: StakeCam; frame: StakeFrame | null } {
  if (s.status === 304) {
    if (!prev) throw new ValidationError(`${camId}: 304 without a previous state`);
    return { cam: prev, frame: null };
  }
  const body = s.body;
  if (s.status !== 200 || !body || !isJpeg(body, s.type)) throw new ValidationError(`${camId}: body is not a JPEG`);
  const asOf = httpDateIso(s.lm);
  const t = isoToMs(asOf);
  if (!s.lm || !asOf || t === null || t > now + SKEW_MS) throw new ValidationError(`${camId}: bad Last-Modified`);
  if (!s.hash) throw new ValidationError(`${camId}: no content hash`);
  const validators = { lm: s.lm, etag: s.etag };
  if (prev && (prev.hash === s.hash || prev.t === t)) {
    // Same pixels (or the same key): no frame; only the validators move.
    return { cam: { ...prev, hash: s.hash, ...validators }, frame: null };
  }
  const archived = now - t <= FRESH_MS;
  const bytes = body.byteLength;
  const cam: StakeCam = { t, asOf, hash: s.hash, bytes, archived, ...validators };
  const frame = archived ? { key: `cam:${camId}:${t}`, t, bytes: body, camId, meta: { ...validators, bytes } } : null;
  return { cam, frame };
}

export const stakeAlta: Source<StakeShot> = {
  id: 'stake-alta',
  staleAfterMin: 15,
  rows: [ROW],
  maxSubrequests: () => 1, // one conditional GET; redirects are not followed
  probes: [{ hostId: 'alta-do', url: STAKE_ALTA_URL }],
  async fetch(ctx: FetchCtx): Promise<StakeShot> {
    const prev = readCam(ctx.prev[ROW], STAKE_ALTA_CAM);
    const headers: Record<string, string> = prev ? { 'If-Modified-Since': prev.lm } : {};
    const url = `${STAKE_ALTA_URL}?t=${Math.floor(ctx.now / 60_000)}`;
    return toShot(await ctx.fetch<ArrayBuffer>(url, { headers, body: 'bytes', follow: false }));
  },
  parse(raw: StakeShot, ctx: ParseCtx): Output {
    const { cam, frame } = settle(STAKE_ALTA_CAM, raw, readCam(ctx.prev[ROW], STAKE_ALTA_CAM), ctx.now);
    const row: StakeRow = { asOf: cam.asOf, cams: { [STAKE_ALTA_CAM]: cam } };
    const frames: StakeFrame[] = frame ? [frame] : [];
    return { rows: { [ROW]: row }, frames };
  },
};
