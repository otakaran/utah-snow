// Edge-cached JSON for /api/cams and /api/stake/:id/frames (spec §7): one copy in caches.default per key (the key
// carries BUILD_ID), a weak ETag from the body hash, and 304 for a matching If-None-Match. /api/snapshot has its own
// column-based ETag. The router adds X-Build and the security headers after this.
import { etagMatches, JSON_TYPE } from '../http.ts';
import { sha256Hex } from '../lib/hash.ts';

export interface EdgeOpts {
  key: string; // absolute URL of the cache entry
  ttlS: number; // edge copy lifetime and the client's max-age
}

/** Serves `build()` through caches.default; the body is only built on a miss. */
export async function edgeJson(
  req: Request,
  ctx: ExecutionContext,
  opts: EdgeOpts,
  build: () => Promise<string>,
): Promise<Response> {
  const cache = caches.default;
  const key = new Request(opts.key);
  const cacheControl = `public, max-age=${opts.ttlS}`;
  let body: ReadableStream | string | null;
  let etag: string;
  const hit = await cache.match(key);
  if (hit) {
    body = hit.body;
    etag = hit.headers.get('ETag') ?? '';
  } else {
    const text = await build();
    body = text;
    etag = `W/"${(await sha256Hex(text)).slice(0, 20)}"`;
    const edge = new Response(text, {
      headers: { 'Content-Type': JSON_TYPE, ETag: etag, 'Cache-Control': cacheControl },
    });
    ctx.waitUntil(cache.put(key, edge));
  }
  const headers = { ETag: etag, 'Cache-Control': cacheControl };
  if (etagMatches(req.headers.get('If-None-Match'), etag)) {
    if (hit) await hit.body?.cancel();
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { headers: { ...headers, 'Content-Type': JSON_TYPE } });
}
