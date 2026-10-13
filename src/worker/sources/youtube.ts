// youtube -> yt:state: live video IDs for the Brighton, Solitude and Deer Valley YouTube cams (spec §6.1).
// Keyless first: CamStreamer redirects (DV), config seeds and hqdefault_live ETag hints. With YT_API_KEY the
// Data API adds liveness (1 unit per tick) and discovery (<= 2 units per channel). Runs in slots 3, 7 and 11;
// slot 11 is lite (no CamStreamer, no hourly discovery). Worst-case subrequests (maxSubrequests):
//   keyless: slots 3/7 = 9 CamStreamer + 8 ETag HEADs = 17; slot 11 = 8.
//   keyed:   slots 3/7 = 9 + 1 liveness + 6 discovery + 8 maxres HEADs = 24; slot 11 = 1 + 6 = 7
//            (in slots 7/11 the 6 cover death/pending discovery; after an API failure they cover ETag HEADs).
// Inputs the dispatcher may provide in ctx.prev besides the row: 'yt:pending' (cam ids reported broken) and
// 'yt:units' (units spent today, America/Los_Angeles). The row's `unitsTick` is what this run spent.
import { type FetchCtx, type Output, type PrevRows, type Source, ValidationError } from './types.ts';
import { applyCamstreamer, fetchCamstreamer } from './youtube/camstreamer.ts';
import {
  DISCOVERY_UNITS,
  fetchDiscovery,
  fetchVideos,
  livenessIds,
  planDiscovery,
  unitsSpent,
} from './youtube/data-api.ts';
import { applyThumbs, etagTargets, fetchThumbs, maxresTargets, THUMB_MAX } from './youtube/keyless.ts';
import { applyDiscovery, applyLiveness } from './youtube/liveness.ts';
import { answerCount, apiOk, isYtRaw, type YtRaw } from './youtube/raw.ts';
import { CHANNEL_IDS, CS_DEFS, DEF_BY_CAM, readState, settle, type YtState } from './youtube/state.ts';

export type { YtRaw } from './youtube/raw.ts';
export type { YtSlotState, YtState } from './youtube/state.ts';

const ROW = 'yt:state';
const FULL_SLOTS: readonly number[] = [3, 7]; // CamStreamer runs here; other slots are lite
const DISCOVERY_MAX = DISCOVERY_UNITS * CHANNEL_IDS.length; // 6 subrequests

function planOf(ctx: FetchCtx): { keyed: boolean; lite: boolean } {
  return { keyed: ctx.keyed.yt && Boolean(ctx.secrets.yt), lite: !FULL_SLOTS.includes(ctx.slot) };
}

const pendingOf = (prev: PrevRows): string[] => {
  const p = prev['yt:pending'];
  return Array.isArray(p) ? p.filter((cam): cam is string => typeof cam === 'string' && DEF_BY_CAM.has(cam)) : [];
};
const unitsOf = (prev: PrevRows): number => (typeof prev['yt:units'] === 'number' ? prev['yt:units'] : 0);

/** CamStreamer, then the liveness answer (keyed) or the keyless CamStreamer rules. Shared by fetch and parse. */
function stepLiveness(st: YtState, raw: YtRaw, now: number): void {
  const ok = apiOk(raw);
  applyCamstreamer(st, raw.cs, now, ok);
  if (ok && raw.liveness) applyLiveness(st, raw.liveness, raw.cs, now);
}

export const youtube: Source<YtRaw> = {
  id: 'youtube',
  staleAfterMin: 45,
  rows: [ROW],
  maxSubrequests(ctx) {
    const { keyed, lite } = planOf(ctx);
    const cs = lite ? 0 : CS_DEFS.length;
    if (!keyed) return cs + THUMB_MAX;
    return lite ? 1 + DISCOVERY_MAX : cs + 1 + DISCOVERY_MAX + THUMB_MAX;
  },
  probes: [
    { hostId: 'camstreamer', url: 'https://camstreamer.com/embed/M5ToybhwNTDP6Y5Yt6lIr9hylOONXTv892poZIyH' },
    { hostId: 'ytimg', url: 'https://i.ytimg.com/vi/QozKoFs-hL0/mqdefault_live.jpg' },
    { hostId: 'youtube-api', url: 'https://www.googleapis.com/youtube/v3/videos?part=id&id=lkEM6EC8NVA' },
  ],

  async fetch(ctx) {
    const { keyed, lite } = planOf(ctx);
    const key = ctx.secrets.yt ?? '';
    const pending = pendingOf(ctx.prev);
    const st = readState(ctx.prev[ROW], ctx.now);
    const raw: YtRaw = {
      v: 1,
      keyed,
      lite,
      pending,
      cs: [],
      liveness: null,
      discovery: [],
      thumbs: [],
      etagCursor: st.etagCursor,
    };
    if (!lite) raw.cs = await fetchCamstreamer(ctx.fetch);
    if (keyed) raw.liveness = await fetchVideos(ctx.fetch, key, livenessIds(st, raw.cs));
    stepLiveness(st, raw, ctx.now);
    if (apiOk(raw)) {
      const plan = planDiscovery(st, {
        slot: ctx.slot,
        unitsToday: unitsOf(ctx.prev),
        pending,
        remaining: ctx.fetch.remaining(),
      });
      raw.discovery = await Promise.all(plan.map((run) => fetchDiscovery(ctx.fetch, key, st, run, ctx.now)));
      applyDiscovery(st, raw.discovery, ctx.now);
      if (!lite) raw.thumbs = await fetchThumbs(ctx.fetch, maxresTargets(st, THUMB_MAX), 'maxres');
    } else {
      // Keyless, or the API failed (403/5xx/quota): this tick runs keyless and skips discovery.
      const { targets, cursor } = etagTargets(st, pending, keyed && lite ? DISCOVERY_MAX : THUMB_MAX);
      raw.thumbs = await fetchThumbs(ctx.fetch, targets, 'etag');
      raw.etagCursor = cursor;
    }
    return raw;
  },

  parse(raw, ctx): Output {
    if (!isYtRaw(raw)) throw new ValidationError('youtube: malformed fetch result');
    const [asked, answered] = answerCount(raw);
    if (asked > 0 && answered === 0) throw new ValidationError(`youtube: none of ${asked} requests answered`);
    const st = readState(ctx.prev[ROW], ctx.now);
    stepLiveness(st, raw, ctx.now);
    if (apiOk(raw)) applyDiscovery(st, raw.discovery, ctx.now);
    applyThumbs(st, raw.thumbs, ctx.now);
    st.mode = apiOk(raw) ? 'api' : 'keyless';
    st.etagCursor = raw.etagCursor;
    st.unitsTick = unitsSpent(raw.liveness, raw.discovery);
    settle(st, ctx.now);
    return { rows: { [ROW]: st } };
  },
};
