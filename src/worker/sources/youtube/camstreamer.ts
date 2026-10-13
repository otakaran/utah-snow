// §6.1 A: Deer Valley CamStreamer handles (keyless). HEAD https://camstreamer.com/embed/{handle} without
// following redirects: a 3xx Location names the current YouTube ID (not proof of liveness), a 200 is
// "Stream isn't live now.", anything else keeps the previous value.

import type { YtState } from '../../../shared/types.ts';
import type { FetchX } from '../types.ts';
import { API_ONLY, apiOutranks, CS_DEFS, DEF_BY_CAM, ID_RE, setVideo } from './state.ts';

export interface CsHit {
  cam: string;
  status: number | null; // null = no usable answer (network error, timeout, challenge page)
  location: string | null;
}

export const CS_BASE = 'https://camstreamer.com/embed/';
const EMBED_RE = /youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})/;
const MISSES_OFFLINE = 2;

export const isRedirect = (s: number | null) => s === 301 || s === 302 || s === 303 || s === 307 || s === 308;

/** The YouTube ID a CamStreamer answer points at, or null. */
export function csCandidate(hit: CsHit): string | null {
  if (!isRedirect(hit.status) || !hit.location) return null;
  const id = EMBED_RE.exec(hit.location)?.[1] ?? null;
  return id && ID_RE.test(id) ? id : null;
}

/** One HEAD per Deer Valley handle, in parallel (fetchx caps concurrency). Never throws. */
export async function fetchCamstreamer(fx: FetchX): Promise<CsHit[]> {
  return Promise.all(
    CS_DEFS.map(async (def): Promise<CsHit> => {
      try {
        const r = await fx(CS_BASE + def.camstreamer, {
          method: 'HEAD',
          body: 'none',
          follow: false,
          allowStatus: true,
          allowBlocked: true,
        });
        if (r.blocked) return { cam: def.cam, status: null, location: null };
        return { cam: def.cam, status: r.status, location: r.headers.get('location') };
      } catch {
        return { cam: def.cam, status: null, location: null };
      }
    }),
  );
}

/**
 * Applies CamStreamer answers. With a working API this tick only the miss counter moves (the API validates
 * candidates); keyless, a new candidate is accepted provisionally as 'unknown' and 2 misses mean offline.
 */
export function applyCamstreamer(st: YtState, hits: readonly CsHit[], now: number, apiOk: boolean): void {
  for (const hit of hits) {
    const s = st.slots[hit.cam];
    if (!s || !DEF_BY_CAM.has(hit.cam) || hit.status === null) continue;
    if (isRedirect(hit.status)) {
      s.csMisses = 0;
      const id = csCandidate(hit);
      if (apiOk || !id || id === s.videoId || API_ONLY.has(hit.cam)) continue;
      if (s.status === 'live' && apiOutranks(s, now)) continue;
      setVideo(s, id, 'camstreamer');
    } else if (hit.status === 200) {
      s.csMisses += 1;
      if (apiOk || s.csMisses < MISSES_OFFLINE || s.videoId === null || apiOutranks(s, now)) continue;
      if (s.status === 'live') s.deadSince = now;
      s.status = 'offline';
      s.source = 'camstreamer';
    }
  }
}
