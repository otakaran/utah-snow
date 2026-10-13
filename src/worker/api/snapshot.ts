// GET /api/snapshot (spec §7): the Snapshot built from source_state (store/snapshot.ts).
// Edge copy in caches.default for 60 s under /api/snapshot?b={BUILD_ID}; clients get Cache-Control: no-cache
// and revalidate with If-None-Match -> 304. X-Build is added by the router after this (and the cache lookup).
import { BUILD_ID, etagMatches, JSON_TYPE } from '../http.ts';
import { staleAfterMin } from '../sources/index.ts';
import { loadSnapshot } from '../store/snapshot.ts';

const EDGE_TTL_S = 60;

export async function snapshot(req: Request, env: Env, ctx: ExecutionContext, url: URL): Promise<Response> {
  const cache = caches.default;
  const key = new Request(new URL(`/api/snapshot?b=${encodeURIComponent(BUILD_ID)}`, url).href);
  let body: ReadableStream | string | null;
  let etag: string;
  const hit = await cache.match(key);
  if (hit) {
    body = hit.body;
    etag = hit.headers.get('ETag') ?? '';
  } else {
    const built = await loadSnapshot(env.DB, staleAfterMin);
    body = built.body;
    etag = built.etag;
    const edge = new Response(built.body, {
      headers: { 'Content-Type': JSON_TYPE, ETag: etag, 'Cache-Control': `public, max-age=${EDGE_TTL_S}` },
    });
    ctx.waitUntil(cache.put(key, edge));
  }
  const headers = { ETag: etag, 'Cache-Control': 'no-cache' };
  if (etagMatches(req.headers.get('If-None-Match'), etag)) {
    if (hit) await hit.body?.cancel();
    return new Response(null, { status: 304, headers });
  }
  return new Response(body, { headers: { ...headers, 'Content-Type': JSON_TYPE } });
}
