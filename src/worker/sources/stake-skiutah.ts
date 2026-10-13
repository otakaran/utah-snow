// Ski Utah stake-still archive (spec §6.3): DV Ontario and Solitude 525820161. Job 'stake-skiutah' (slots 0/3/6/9),
// row 'stake:skiutah'. One conditional GET per cam (If-None-Match = the last ETag, which is the body's SHA-1,
// verified 2026-10-12 and on Wayback captures), so a 200 means new pixels and becomes one KV frame. A cam that fails
// keeps its last state with `err`; the job fails only when every cam fails. Pictures older than 24 h are not archived.
// The archive core below mirrors stake-alta.ts (adapters may not import each other); stake-skiutah.test.ts checks
// that both behave the same.
import type { CamId } from '../../../config/cams/index.ts';
import { isoToMs } from '../../shared/time.ts';
import { type FetchCtx, type FetchResult, type Output, type ParseCtx, type Source, ValidationError } from './types.ts';

export const SKIUTAH_BLOB_URL = 'https://www.skiutah.com/files/blob/webcam/';
export const SKIUTAH_STAKES = [
  { camId: 'deer-valley-ontario-snowstake-still', blob: 'ZFfEsBSprV7GfFinXUifK3' },
  { camId: 'solitude-snowstake-still', blob: '525820161' },
] as const satisfies readonly { camId: CamId; blob: string }[];
const ROW = 'stake:skiutah';
const FRESH_MS = 24 * 3_600_000;
const SKEW_MS = 10 * 60_000;
const MIN_BYTES = 1024;
const MAX_BYTES = 8 * 1024 * 1024;
const MONTHS = 'JanFebMarAprMayJunJulAugSepOctNovDec';
const IMF_RE = /^[A-Z][a-z]{2}, (\d{2}) ([A-Z][a-z]{2}) (\d{4}) (\d{2}:\d{2}:\d{2}) GMT$/;
const DIGEST_RE = /^(?:[0-9a-f]{32}(?:-\d+)?|[0-9a-f]{40})$/;
const KEY_RE = /\bkey=[^&\s"',;)]*/gi;

// ---- archive core (same as stake-alta.ts) ----
export interface StakeShot {
  status: number;
  lm: string | null;
  etag: string | null;
  type: string | null;
  body: ArrayBuffer | null;
  hash: string | null;
}
export interface StakeCam {
  t: number;
  asOf: string;
  hash: string;
  bytes: number;
  archived: boolean;
  lm: string;
  etag: string | null;
  err?: string;
}
export interface StakeRow {
  asOf: string | null;
  cams: Record<string, StakeCam>;
}
export interface StakeFrame {
  key: string;
  t: number;
  bytes: ArrayBuffer;
  camId: string;
  meta: { lm: string; etag: string | null; bytes: number };
}

function httpDateIso(v: string | null): string | null {
  const m = v ? IMF_RE.exec(v.trim()) : null;
  const mon = m ? MONTHS.indexOf(m[2] ?? '') : -1;
  if (!m || mon < 0 || mon % 3) return null;
  return `${m[3]}-${String(mon / 3 + 1).padStart(2, '0')}-${m[1]}T${m[4]}Z`;
}

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
    return { cam: { ...prev, hash: s.hash, ...validators }, frame: null };
  }
  const archived = now - t <= FRESH_MS;
  const bytes = body.byteLength;
  const cam: StakeCam = { t, asOf, hash: s.hash, bytes, archived, ...validators };
  const frame = archived ? { key: `cam:${camId}:${t}`, t, bytes: body, camId, meta: { ...validators, bytes } } : null;
  return { cam, frame };
}
// ---- end of the archive core ----

/** fetch() result per cam: the shot, or why its request failed. */
export interface SkiUtahShot {
  camId: string;
  shot: StakeShot | null;
  err: string | null;
}

const errText = (e: unknown): string =>
  (e instanceof Error ? `${e.name}: ${e.message}` : String(e)).replace(KEY_RE, 'key=***').slice(0, 200);
// Budget/deadline errors must reach the dispatcher (the job is deferred, not failed).
const isDeferral = (e: unknown): boolean => e instanceof Error && /^(?:Budget|Deadline)Error$/.test(e.name);

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
        const headers: Record<string, string> = etag ? { 'If-None-Match': etag } : {};
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
        const { cam, frame } = settle(camId, r.shot, prev, ctx.now);
        cams[camId] = cam;
        if (frame) frames.push(frame);
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
