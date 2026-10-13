// Response helpers for /api/* (spec §7): JSON, errors, ETag matching and the headers every API response carries.
// No CORS headers: the API is same-origin only.
import { redact } from './lib/log.ts';

/** Short git SHA injected by Vite `define`; 'dev' under vite dev and in Vitest (no define there). */
export const BUILD_ID: string = typeof __BUILD_ID__ === 'string' ? __BUILD_ID__ : 'dev';

export const NO_STORE = 'no-store';
export const JSON_TYPE = 'application/json; charset=utf-8';

const API_HEADERS: Record<string, string> = {
  'X-Robots-Tag': 'noindex, nofollow',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

export interface JsonInit {
  status?: number;
  cache?: string; // Cache-Control, default no-store
  headers?: Record<string, string>;
}

export function json(body: unknown, init: JsonInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { 'Content-Type': JSON_TYPE, 'Cache-Control': init.cache ?? NO_STORE, ...init.headers },
  });
}

/** `{error, code?, message?}` with no-store; messages are key-redacted. */
export function apiError(status: number, error: string, extra: { code?: string; message?: string } = {}): Response {
  const body: Record<string, string> = { error };
  if (extra.code) body.code = extra.code;
  if (extra.message) body.message = redact(extra.message);
  return json(body, { status });
}

/** Unknown /api route. The probe gate returns exactly this too, so a wrong key is indistinguishable. */
export const notFound = (): Response => apiError(404, 'not-found');

export const methodNotAllowed = (allow: readonly string[]): Response => {
  const res = apiError(405, 'method-not-allowed');
  res.headers.set('Allow', allow.join(', '));
  return res;
};

/** Non-/api requests that reach the Worker (asset misses): plain 404, never JSON or index.html. */
export const plainNotFound = (): Response =>
  new Response('Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': NO_STORE },
  });

/** True when an If-None-Match header lists this ETag (weak comparison). */
export function etagMatches(ifNoneMatch: string | null, etag: string): boolean {
  if (!ifNoneMatch || !etag) return false;
  const strip = (t: string) => t.trim().replace(/^W\//, '');
  const want = strip(etag);
  return ifNoneMatch.split(',').some((t) => t.trim() === '*' || strip(t) === want);
}

/** Every /api response: security headers + X-Build, set last (after any cache lookup). */
export function withApiHeaders(res: Response): Response {
  const out = new Response(res.body, res); // cached/fetched responses have immutable headers
  for (const [k, v] of Object.entries(API_HEADERS)) out.headers.set(k, v);
  out.headers.set('X-Build', BUILD_ID);
  return out;
}
