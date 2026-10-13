// Request runner and small helpers shared by the cam-status kind checks.
import { isoToMs } from '../../../shared/time.ts';
import type { FetchX } from '../types.ts';
import type { CheckReq, Probe } from './types.ts';

const HEAD_TIMEOUT_MS = 6_000;

export const iso = (ms: number): string => new Date(ms).toISOString();

/** HTTP date (Last-Modified) -> ISO, or null when missing/unparseable. */
export function httpDateIso(v: string | undefined): string | null {
  const ms = isoToMs(v);
  return ms === null ? null : iso(ms);
}

/** A still template without its query (`…/Superior.jpg?t={m}` -> `…/Superior.jpg`); the check adds its own buster. */
export const stillBase = (template: string): string => template.split('?')[0] ?? template;

function safeJson(text: unknown): unknown {
  if (typeof text !== 'string') return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * One request, never thrown: redirects are not followed (one subrequest each, Location is read instead),
 * statuses >= 400 come back as data, errors become `{status: 0, err: name}` (names only, no URLs).
 */
export async function runProbe(fx: FetchX, req: CheckReq): Promise<Probe> {
  try {
    const res = await fx<string>(req.url, {
      method: req.method,
      body: req.json ? 'text' : 'none',
      follow: false,
      allowStatus: true,
      timeoutMs: HEAD_TIMEOUT_MS,
      headers: req.json ? { Accept: 'application/json' } : undefined,
    });
    const h = res.headers;
    const p: Probe = { status: res.status };
    const lm = h.get('last-modified');
    const etag = h.get('etag');
    const loc = h.get('location');
    const ct = h.get('content-type');
    if (lm) p.lastModified = lm;
    if (etag) p.etag = etag;
    if (loc) p.location = loc;
    if (ct) p.contentType = ct;
    if (req.json && res.status === 200) p.body = safeJson(res.data);
    return p;
  } catch (err) {
    return { status: 0, err: err instanceof Error ? err.name : 'Error' };
  }
}
