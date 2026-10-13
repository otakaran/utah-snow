// Guards shared by the mutating routes, POST /api/tracker and POST /api/cams/report (spec §9.4), in order:
// 403 (Content-Type, X-Requested-With, Origin), 503 (IP_HASH_SALT unset), 429 (rate counters keyed by the salted
// ipKey hash, an IPv6 /64 as one client; both routes share them), then 422 bad-input for a body that is too large
// (Content-Length, then bytes as they stream in; never buffered past MAX_BODY) or not a JSON object.
// The per-IP counters come first and the global one counts only requests they let through, so one client cannot
// spend the global day; a counter already at its limit is not bumped.
import { SITE } from '../../../config/site.ts';
import { isObj, type Obj, tryJson } from '../../shared/json.ts';
import { DAY, HOUR, isoUtc } from '../../shared/time.ts';
import { apiError, json } from '../http.ts';
import { ipHash } from '../lib/hash.ts';
import { bumpUnder, type RateCounter } from '../store/counters.ts';

/** A request that passed the header, salt and rate checks, with its JSON object body. */
export interface Admitted {
  body: Obj;
  ipHash: string;
}

export const RATE_LIMITS = { ipHour: 120, ipDay: 600, globalDay: 2000 } as const;
const MAX_BODY = 4096;
const DEV_ORIGIN = /^http:\/\/(?:localhost|127\.0\.0\.1):\d{1,5}$/;

/** 422 `{error:'validation', code, message, ...extra}`. */
export const invalid = (code: string, message: string, extra: Record<string, unknown> = {}): Response =>
  json({ error: 'validation', code, message, ...extra }, { status: 422 });

/** `rl:{ipHash}:{YYYYMMDDHH}`, `rl:{ipHash}:{YYYYMMDD}`, `rl:global:{YYYYMMDD}` (UTC windows). */
export function rateCounters(hash: string, now: number): [hour: RateCounter, day: RateCounter, global: RateCounter] {
  const iso = isoUtc(now);
  const day = iso.slice(0, 10).replace(/-/g, '');
  const hourEnd = now - (now % HOUR) + HOUR;
  const dayEnd = now - (now % DAY) + DAY;
  return [
    { key: `rl:${hash}:${day}${iso.slice(11, 13)}`, limit: RATE_LIMITS.ipHour, expiresAt: hourEnd },
    { key: `rl:${hash}:${day}`, limit: RATE_LIMITS.ipDay, expiresAt: dayEnd },
    { key: `rl:global:${day}`, limit: RATE_LIMITS.globalDay, expiresAt: dayEnd },
  ];
}

function sameOrigin(req: Request, env: Env): boolean {
  const h = req.headers;
  if (!/^application\/json\s*(?:;|$)/i.test(h.get('Content-Type') ?? '')) return false;
  if (h.get('X-Requested-With') !== 'utahsnow') return false;
  const origin = h.get('Origin') ?? '';
  return origin === SITE.origin || (env.DEV === '1' && DEV_ORIGIN.test(origin));
}

/** 429 `{error:'rate-limited', retryAfterS}` with a Retry-After header. */
export function rateLimited(retryAfterS: number): Response {
  return json({ error: 'rate-limited', retryAfterS }, { status: 429, headers: { 'Retry-After': String(retryAfterS) } });
}

/** The counters this request is over: the per-IP ones, else the global one (bumped only when they pass). */
async function overLimits(db: D1Database, hash: string, now: number): Promise<RateCounter[]> {
  const [hour, day, global] = rateCounters(hash, now);
  const ip = [hour, day];
  const ipOk = await bumpUnder(db, ip);
  const over = ip.filter((_, i) => !ipOk[i]);
  if (over.length) return over;
  const [ok] = await bumpUnder(db, [global]);
  return ok ? [] : [global];
}

/** The body as UTF-8 text, or null when it is over `max` bytes (the stream is cancelled there, never buffered). */
async function readCapped(req: Request, max: number): Promise<string | null> {
  if (Number(req.headers.get('Content-Length') ?? 0) > max) return null;
  if (!req.body) return '';
  const reader = req.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  for (let r = await reader.read(); !r.done; r = await reader.read()) {
    size += r.value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    parts.push(r.value);
  }
  return new Blob(parts).text();
}

/** Every shared guard of §9.4; the body and IP hash, or the 403/503/429/422 response. */
export async function admit(req: Request, env: Env, now: number): Promise<Admitted | Response> {
  if (!sameOrigin(req, env)) return apiError(403, 'forbidden');
  if (!env.IP_HASH_SALT) return apiError(503, 'unavailable', { code: 'no-salt', message: 'writes are off' });
  const hash = await ipHash(req.headers.get('CF-Connecting-IP') ?? '', env.IP_HASH_SALT);
  const over = await overLimits(env.DB, hash, now);
  if (over.length) return rateLimited(Math.ceil((Math.max(...over.map((c) => c.expiresAt)) - now) / 1000));
  const text = await readCapped(req, MAX_BODY);
  if (text === null) return invalid('bad-input', 'body too large');
  const body = tryJson(text);
  if (!isObj(body)) return invalid('bad-input', 'body must be a JSON object');
  return { body, ipHash: hash };
}
