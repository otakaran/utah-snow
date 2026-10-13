// §6.1 C keyless liveness hints and F thumbnails, all via HEADs on i.ytimg.com (at most 8 per youtube tick).
// Slot IDs come from the last API-confirmed ID, else the CamStreamer candidate, else the config seed (state.ts,
// camstreamer.ts). Channel /live, /streams, embed and watch pages are never fetched: Developer Policies III.E.6
// forbid scraping YouTube applications. A live stream's auto-generated hqdefault_live ETag is a small counter
// that grows about every 5 min; a 10-digit ETag is a custom thumbnail (inconclusive); a 404 is a removed video.
import type { FetchX } from '../types.ts';
import { API_ONLY, apiOutranks, SLOT_DEFS, type YtState, type YtStatus } from './state.ts';

export interface ThumbHit {
  cam: string;
  id: string;
  kind: 'etag' | 'maxres';
  status: number | null; // null = no usable answer
  etag: string | null;
}
export interface ThumbTarget {
  cam: string;
  id: string;
}

export const THUMB_MAX = 8; // i.ytimg HEADs per youtube tick (§5.3)
const YTIMG = 'https://i.ytimg.com/vi/';
const CUSTOM_RE = /^"\d{10}"$/; // Unix-timestamp ETag: channel-uploaded thumbnail
const COUNTER_RE = /^"\d{1,9}"$/; // auto-generated live thumbnail counter

export const thumbUrl = (id: string, kind: ThumbHit['kind']) =>
  `${YTIMG}${id}/${kind === 'maxres' ? 'maxresdefault_live' : 'hqdefault_live'}.jpg`;

/** Keyless ETag targets: cams with a yt:pending report first, then round-robin from etagCursor. */
export function etagTargets(
  st: YtState,
  pending: readonly string[],
  n: number,
): { targets: ThumbTarget[]; cursor: number } {
  const ring = SLOT_DEFS.filter((d) => st.slots[d.cam]?.videoId).map((d) => d.cam);
  const picked: string[] = pending.filter((cam, i) => ring.includes(cam) && pending.indexOf(cam) === i).slice(0, n);
  let cursor = ring.length > 0 ? st.etagCursor % ring.length : 0;
  for (let i = 0; i < ring.length && picked.length < n; i++) {
    const cam = ring[cursor] as string;
    cursor = (cursor + 1) % ring.length;
    if (!picked.includes(cam)) picked.push(cam);
  }
  return { targets: picked.map((cam) => ({ cam, id: st.slots[cam]?.videoId as string })), cursor };
}

/** Keyed first-sight check: live slots whose maxresdefault_live was never HEADed. */
export function maxresTargets(st: YtState, n: number): ThumbTarget[] {
  const out: ThumbTarget[] = [];
  for (const d of SLOT_DEFS) {
    const s = st.slots[d.cam];
    if (out.length < n && s?.videoId && s.status === 'live' && s.maxres === null)
      out.push({ cam: d.cam, id: s.videoId });
  }
  return out;
}

export async function fetchThumbs(
  fx: FetchX,
  targets: readonly ThumbTarget[],
  kind: ThumbHit['kind'],
): Promise<ThumbHit[]> {
  return Promise.all(
    targets.map(async ({ cam, id }): Promise<ThumbHit> => {
      try {
        const r = await fx(thumbUrl(id, kind), {
          method: 'HEAD',
          body: 'none',
          follow: false,
          allowStatus: true,
          allowBlocked: true,
        });
        if (r.blocked) return { cam, id, kind, status: null, etag: null };
        return { cam, id, kind, status: r.status, etag: r.headers.get('etag') };
      } catch {
        return { cam, id, kind, status: null, etag: null };
      }
    }),
  );
}

function hint(s: YtState['slots'][string], status: YtStatus, cam: string, now: number): void {
  const next = status === 'live' && API_ONLY.has(cam) ? 'unknown' : status;
  if (next === 'live') {
    s.lastLiveAt = now;
    s.deadSince = null;
  } else if (next === 'offline' && s.status === 'live') s.deadSince = now;
  s.status = next;
  s.source = 'etag';
}

/** Applies HEAD answers. ETag hints never override an API classification younger than 60 min. */
export function applyThumbs(st: YtState, hits: readonly ThumbHit[], now: number): void {
  for (const h of hits) {
    const s = st.slots[h.cam];
    if (!s || s.videoId !== h.id || h.status === null) continue;
    const custom = h.status === 200 && h.etag !== null && CUSTOM_RE.test(h.etag);
    if (h.kind === 'maxres') {
      if (h.status === 200 || h.status === 404) s.maxres = h.status === 200;
      if (custom) s.thumbKind = 'custom';
      continue;
    }
    const fresh = apiOutranks(s, now);
    if (h.status === 404) {
      Object.assign(s, { etag: null, etagAt: now });
      if (!fresh) hint(s, 'offline', h.cam, now);
      continue;
    }
    if (h.status !== 200 || !h.etag) continue;
    const before = s.etag;
    Object.assign(s, { etag: h.etag, etagAt: now, thumbKind: custom ? 'custom' : 'live' });
    if (before === null || fresh) continue; // first sight of this ID: nothing to compare yet
    if (h.etag !== before) hint(s, custom ? 'unknown' : 'live', h.cam, now);
    else if (custom) hint(s, 'unknown', h.cam, now);
    else if (COUNTER_RE.test(h.etag)) hint(s, 'offline', h.cam, now);
  }
}
