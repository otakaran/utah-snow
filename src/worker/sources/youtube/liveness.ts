// §6.1 B/D state transitions for Data API answers (pure). LIVE(id) = the item exists, liveBroadcastContent is
// 'live', there is no actualEndTime, embeddable is not false and the channel is the slot's channel. Live titles
// are re-matched against the ordered slot regexes, so a re-pointed stream moves to its proper slot.
import { CHANNELS } from '../../../../config/youtube.ts';
import { isoToMs } from '../../../shared/time.ts';
import type { YtChannel, YtSlotState, YtState } from '../../../shared/types.ts';
import { type CsHit, csCandidate } from './camstreamer.ts';
import type { ApiCall, DiscoveryRun, VideoItem } from './data-api.ts';
import { DEF_BY_CAM, matchSlot, SLOT_DEFS, type SlotDef, setVideo } from './state.ts';

const DEATH_RETRIES = 3; // the immediate run plus the next 2 youtube ticks

export function isLive(it: VideoItem | undefined, channelId: string): it is VideoItem {
  return (
    it !== undefined &&
    it.snippet?.liveBroadcastContent === 'live' &&
    !it.liveStreamingDetails?.actualEndTime &&
    it.status?.embeddable !== false &&
    it.snippet?.channelId === channelId
  );
}

const titleOf = (it: VideoItem | undefined) => it?.snippet?.title ?? '';

function setLive(s: YtSlotState, it: VideoItem, now: number): void {
  s.status = 'live';
  s.title = titleOf(it);
  s.actualStartTime = it.liveStreamingDetails?.actualStartTime ?? null;
  s.lastLiveAt = now;
  s.deadSince = null;
  s.apiAt = now;
  s.source = 'api';
}

function setDead(s: YtSlotState, now: number): void {
  s.status = 'offline';
  s.apiAt = now;
  s.source = 'api';
}

/** Puts a LIVE item into a slot: dead or unfilled slots take it; a live slot keeps the newer actualStartTime. */
export function offerLive(st: YtState, def: SlotDef, it: VideoItem, now: number): void {
  const s = st.slots[def.cam];
  if (!s) return;
  if (s.videoId !== it.id) {
    if (s.status === 'live' && s.videoId !== null) {
      const cur = isoToMs(s.actualStartTime) ?? 0;
      const cand = isoToMs(it.liveStreamingDetails?.actualStartTime) ?? 0;
      if (cand <= cur) return; // conflict: the newer stream wins
    }
    setVideo(s, it.id, 'api');
  }
  setLive(s, it, now);
}

const liveMap = (st: YtState) => new Map(Object.entries(st.slots).map(([cam, s]) => [cam, s.status === 'live']));

/** Slots that went from live to dead this tick: deadSince, and discovery retries for their channel. */
function markDeaths(st: YtState, wasLive: Map<string, boolean>, now: number): void {
  for (const def of SLOT_DEFS) {
    const s = st.slots[def.cam];
    if (s && wasLive.get(def.cam) && s.status !== 'live') {
      s.deadSince = now;
      st.retries[def.channel] = DEATH_RETRIES;
    }
  }
}

function remember(st: YtState, id: string, channel: YtChannel, it: VideoItem | undefined, now: number): void {
  st.seen[id] = { channel, title: titleOf(it), live: isLive(it, CHANNELS[channel].channelId), checkedAt: now };
}

/** Applies the per-tick videos.list answer (call.items must be non-null). */
export function applyLiveness(st: YtState, call: ApiCall, hits: readonly CsHit[], now: number): void {
  const byId = new Map((call.items ?? []).map((it) => [it.id, it]));
  const wasLive = liveMap(st);
  const chanOf = new Map<string, YtChannel>();
  for (const def of SLOT_DEFS) {
    const id = st.slots[def.cam]?.videoId;
    if (id) chanOf.set(id, def.channel);
  }
  const candidates: [SlotDef, string][] = [];
  for (const h of hits) {
    const def = DEF_BY_CAM.get(h.cam);
    const id = csCandidate(h);
    if (!def || !id) continue;
    if (!chanOf.has(id)) chanOf.set(id, def.channel);
    candidates.push([def, id]);
  }
  for (const id of call.ids) {
    const ch = chanOf.get(id);
    if (ch) remember(st, id, ch, byId.get(id), now);
  }

  const moves: [SlotDef, VideoItem][] = [];
  for (const def of SLOT_DEFS) {
    const s = st.slots[def.cam];
    if (!s?.videoId || !call.ids.includes(s.videoId)) continue;
    const it = byId.get(s.videoId);
    if (!isLive(it, def.channelId)) {
      setDead(s, now);
      continue;
    }
    const target = matchSlot(def.channel, titleOf(it));
    if (target && target.cam !== def.cam) {
      moves.push([target, it]); // this slot's ID is another camera's stream
      setVideo(s, null, 'api');
      setDead(s, now);
    } else setLive(s, it, now);
  }
  for (const [def, it] of moves) offerLive(st, def, it, now);
  for (const [def, id] of candidates) {
    const it = byId.get(id);
    if (st.slots[def.cam]?.videoId === id || !isLive(it, def.channelId)) continue;
    const target = matchSlot(def.channel, titleOf(it)); // accepted only when the title matches a slot
    if (target) offerLive(st, target, it, now);
  }
  markDeaths(st, wasLive, now);
}

/** Applies discovery runs: new LIVE uploads fill their first-matching slot, others land in `unmapped`. */
export function applyDiscovery(st: YtState, runs: readonly DiscoveryRun[], now: number): void {
  for (const run of runs) {
    if (run.playlist.ids === null) continue; // failed: retries stay for the next tick
    st.lastDiscovery[run.channel] = now;
    const left = st.retries[run.channel] ?? 0;
    if (left > 0) st.retries[run.channel] = left - 1;
    if (!run.videos?.items) continue;
    const byId = new Map(run.videos.items.map((it) => [it.id, it]));
    const channelId = CHANNELS[run.channel].channelId;
    for (const id of run.videos.ids) {
      const it = byId.get(id);
      remember(st, id, run.channel, it, now);
      if (!isLive(it, channelId)) continue;
      const def = matchSlot(run.channel, titleOf(it));
      if (def) offerLive(st, def, it, now);
      else if (!st.unmapped.some((u) => u.videoId === id)) {
        st.unmapped.push({ videoId: id, channel: run.channel, title: titleOf(it) });
      }
    }
  }
}
