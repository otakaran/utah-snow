// Node shim of the adapters' FetchCtx (spec §14 "Fixtures"): the real fetchx (headers, redirects, block detection,
// HttpError) over Node's fetch, so scripts run each adapter's own fetch(). Every response is recorded in `hits`.
// Wayback mode sends every request to https://web.archive.org/web/{ts}id_/{url}, one at a time, 3-5 s apart,
// follows Wayback's snap-to-capture redirects itself, gunzips raw gzip bodies and renames x-archive-orig-* headers.
// It is always keyless: API keys never go to web.archive.org, and recorded URLs are redacted.
import { setTimeout as sleep } from 'node:timers/promises';
import { gunzipSync } from 'node:zlib';
import { SLOTS } from '../../config/schedule.ts';
import { isoToMs } from '../../src/shared/time.ts';
import { isMorning, slotOf } from '../../src/worker/cron/slots.ts';
import { createFetchx } from '../../src/worker/lib/fetchx.ts';
import { redact } from '../../src/worker/lib/log.ts';
import type { FetchCtx, PrevRows, Source } from '../../src/worker/sources/types.ts';

export interface Hit {
  url: string; // what the adapter asked for, `key=` redacted
  status: number; // 0 = the request threw
  bytes: number; // decoded body
  type: string;
  ms: number;
}
export interface ShimOptions {
  now: number;
  slot?: number; // default: the cron slot of `now` (UTC minute / 5)
  wayback?: string; // 14-digit Wayback timestamp
  prev?: PrevRows;
}

const WAYBACK_GAP_MS = 3_000; // plus up to 2 s of jitter
const WAYBACK_TIMEOUT_MS = 60_000; // Wayback is slower than fetchx's 8-10 s upstream timeouts
const NO_BODY = new Set([101, 204, 205, 304]);

/**
 * Wayback `id_` URL (raw capture, no toolbar). The fetchx cache-buster `_=` never matches a capture, and an API
 * `key` never leaves this machine.
 */
export function waybackUrl(ts: string, url: string): string {
  const u = new URL(url);
  u.searchParams.delete('_');
  u.searchParams.delete('key');
  return `https://web.archive.org/web/${ts}id_/${u.href}`;
}

/** Wayback ts 'YYYYMMDDhhmmss' -> epoch ms (UTC), or null. */
export function waybackMs(ts: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(ts);
  return m ? isoToMs(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`) : null;
}

/** Headers as the origin sent them: Wayback's x-archive-orig-* win; encoding/length no longer match the body. */
function originHeaders(h: Headers, wayback: boolean): Headers {
  const out = new Headers();
  for (const [k, v] of h) if (!wayback || !k.startsWith('x-archive-')) out.set(k, v);
  if (wayback) for (const [k, v] of h) if (k.startsWith('x-archive-orig-')) out.set(k.slice(15), v);
  for (const k of ['content-encoding', 'content-length', 'transfer-encoding']) out.delete(k);
  return out;
}

// Wayback requests run one at a time across the whole process, at least WAYBACK_GAP_MS apart.
let waybackQueue: Promise<unknown> = Promise.resolve();
let waybackLast = 0;

function shimFetch(wayback: string | undefined, hits: Hit[]): typeof fetch {
  const run = async (url: string, init: RequestInit | undefined): Promise<Response> => {
    const t0 = performance.now();
    const hit: Hit = { url: redact(url), status: 0, bytes: 0, type: '', ms: 0 };
    hits.push(hit);
    try {
      const res = wayback
        ? await fetch(waybackUrl(wayback, url), {
            ...init,
            redirect: 'follow', // Wayback snaps the timestamp to the nearest capture with a redirect
            signal: AbortSignal.timeout(WAYBACK_TIMEOUT_MS),
          })
        : await fetch(url, init);
      let body = new Uint8Array(await res.arrayBuffer());
      if (body[0] === 0x1f && body[1] === 0x8b) body = new Uint8Array(gunzipSync(body)); // id_ keeps raw gzip
      const headers = originHeaders(res.headers, !!wayback);
      Object.assign(hit, { status: res.status, bytes: body.byteLength, type: headers.get('content-type') ?? '' });
      return new Response(NO_BODY.has(res.status) ? null : body, { status: res.status, headers });
    } finally {
      hit.ms = Math.round(performance.now() - t0);
    }
  };
  return ((input: string | URL | Request, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!wayback) return run(url, init);
    const next = waybackQueue.then(async () => {
      const wait = waybackLast + WAYBACK_GAP_MS + Math.random() * 2_000 - Date.now();
      if (wait > 0) await sleep(wait);
      try {
        return await run(url, init);
      } finally {
        waybackLast = Date.now();
      }
    });
    waybackQueue = next.catch(() => undefined);
    return next;
  }) as typeof fetch;
}

/** The cron slot whose run asks for the most subrequests: snowbird's trails slot, roads' traffic slots. */
export function fullestSlot(src: Source, ctx: FetchCtx): number {
  let best = 0;
  for (let slot = 1; slot < SLOTS.length; slot++) {
    if (src.maxSubrequests({ ...ctx, slot }) > src.maxSubrequests({ ...ctx, slot: best })) best = slot;
  }
  return best;
}

/** A FetchCtx for one adapter run, keyless unless YT_API_KEY / UDOT_API_KEY are set (never in Wayback mode). */
export function shimCtx(o: ShimOptions): { ctx: FetchCtx; hits: Hit[] } {
  const hits: Hit[] = [];
  const fx = createFetchx({ budget: Number.POSITIVE_INFINITY, fetchImpl: shimFetch(o.wayback, hits) });
  const env = (name: string) => (o.wayback ? undefined : process.env[name] || undefined);
  const yt = env('YT_API_KEY');
  const udot = env('UDOT_API_KEY');
  const ctx: FetchCtx = {
    fetch: fx,
    now: o.now,
    slot: o.slot ?? slotOf(o.now),
    morning: isMorning(o.now),
    keyed: { yt: !!yt, udot: !!udot },
    secrets: { yt, udot },
    prev: o.prev ?? {},
  };
  return { ctx, hits };
}
