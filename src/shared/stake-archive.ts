// Snow-stake archive core (spec §6.3), shared by the stake-alta and stake-skiutah adapters. One conditional GET per
// cam becomes a StakeShot; settle() compares it with the cam's last state and returns the new state plus, for a new
// fresh picture, one KV frame. Pure apart from hashing (WebCrypto). The adapters own the requests and turn a failed
// settle() into ValidationError.
import { HOUR, httpDateToMs, isoUtc, MIN } from './time.ts';
import type { StakeCam } from './types.ts';

export const FRESH_MS = 24 * HOUR; // older pictures are not archived: no timelapse window could show them
const SKEW_MS = 10 * MIN; // a Last-Modified further ahead of the tick than this is rejected
const MIN_BYTES = 1024;
const MAX_BYTES = 8 * 1024 * 1024; // KV allows 25 MiB; the Collins frame is ~0.45 MB
const DIGEST_RE = /^(?:[0-9a-f]{32}(?:-\d+)?|[0-9a-f]{40})$/; // MD5 (S3, '-N' multipart) or SHA-1

/** One conditional GET, reduced to what settle() reads. */
export interface StakeShot {
  status: number; // 200 or 304
  lm: string | null;
  etag: string | null;
  type: string | null;
  body: ArrayBuffer | null; // 200 only
  hash: string | null; // the ETag digest, or SHA-1 of the body when the ETag is missing, weak or not a digest
}
/** Output.frames entry plus what the KV writer needs for the stake_frames row and the KV metadata. */
export interface StakeFrame {
  key: string; // cam:{camId}:{t}
  t: number;
  bytes: ArrayBuffer;
  camId: string;
  meta: { lm: string; etag: string | null; bytes: number };
}
/** The part of a fetchx result toShot() reads (structural: src/shared never imports worker types). */
export interface ShotResponse {
  status: number;
  headers: { get(name: string): string | null };
  data: ArrayBuffer | null;
}
export type Settled = { ok: true; cam: StakeCam; frame: StakeFrame | null } | { ok: false; error: string };

/** A strong ETag that is a content digest, normalized; null otherwise. */
export function etagDigest(etag: string | null): string | null {
  if (!etag || etag.startsWith('W/')) return null;
  const v = etag.replace(/"/g, '').trim().toLowerCase();
  return DIGEST_RE.test(v) ? v : null;
}

export async function sha1Hex(buf: ArrayBuffer): Promise<string> {
  let s = '';
  for (const b of new Uint8Array(await crypto.subtle.digest('SHA-1', buf))) s += b.toString(16).padStart(2, '0');
  return s;
}

/** A 200/304 response -> StakeShot (hashing the body only when the ETag is no digest); throws on other statuses. */
export async function toShot(res: ShotResponse): Promise<StakeShot> {
  if (res.status !== 200 && res.status !== 304) throw new Error(`HTTP ${res.status} (redirects are not followed)`);
  const h = res.headers;
  const etag = h.get('etag');
  const body = res.status === 200 ? res.data : null;
  const hash = body ? (etagDigest(etag) ?? (await sha1Hex(body))) : null;
  return { status: res.status, lm: h.get('last-modified'), etag, type: h.get('content-type'), body, hash };
}

/** The previous run's state of one cam from a last-good row, or null when absent or malformed (`err` dropped). */
export function readCam(row: unknown, camId: string): StakeCam | null {
  const cams = row && typeof row === 'object' ? (row as { cams?: unknown }).cams : null;
  const c = cams && typeof cams === 'object' ? (cams as Record<string, Partial<StakeCam>>)[camId] : null;
  if (!c || typeof c.t !== 'number' || !Number.isFinite(c.t) || typeof c.lm !== 'string') return null;
  if (typeof c.asOf !== 'string' || typeof c.hash !== 'string' || typeof c.bytes !== 'number') return null;
  const etag = typeof c.etag === 'string' ? c.etag : null;
  return { t: c.t, asOf: c.asOf, hash: c.hash, bytes: c.bytes, archived: c.archived === true, lm: c.lm, etag };
}

/** Size within [1 KiB, 8 MiB], a JPEG (or missing) content type and the JPEG SOI marker. */
export function isJpeg(body: ArrayBuffer, type: string | null): boolean {
  if (body.byteLength < MIN_BYTES || body.byteLength > MAX_BYTES) return false;
  if (type !== null && !/^image\/jpe?g\b/i.test(type)) return false;
  const u = new Uint8Array(body, 0, 3);
  return u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff;
}

/** One shot against the previous state -> the new state and, for a new fresh picture, its frame. */
export function settle(camId: string, s: StakeShot, prev: StakeCam | null, now: number): Settled {
  const fail = (why: string): Settled => ({ ok: false, error: `${camId}: ${why}` });
  if (s.status === 304) return prev ? { ok: true, cam: prev, frame: null } : fail('304 without a previous state');
  const body = s.body;
  if (s.status !== 200 || !body || !isJpeg(body, s.type)) return fail('body is not a JPEG');
  const t = httpDateToMs(s.lm);
  if (!s.lm || t === null || t > now + SKEW_MS) return fail('bad Last-Modified');
  if (!s.hash) return fail('no content hash');
  const validators = { lm: s.lm, etag: s.etag };
  if (prev && (prev.hash === s.hash || prev.t === t)) {
    // Same pixels (or the same key): no frame; only the validators move.
    return { ok: true, cam: { ...prev, hash: s.hash, ...validators }, frame: null };
  }
  const archived = now - t <= FRESH_MS;
  const bytes = body.byteLength;
  const cam: StakeCam = { t, asOf: isoUtc(t), hash: s.hash, bytes, archived, ...validators };
  const frame = archived ? { key: `cam:${camId}:${t}`, t, bytes: body, camId, meta: { ...validators, bytes } } : null;
  return { ok: true, cam, frame };
}
