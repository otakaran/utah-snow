// yt:state shape and pure helpers shared by the youtube job's steps (spec §6.1).
// Times are epoch ms (lastDiscovery included) so no Date logic lives outside src/shared/time.ts.
import { CHANNELS, SLOTS, type YtSlot } from '../../../../config/youtube.ts';
import { isObj } from '../../../shared/json.ts';
import { HOUR } from '../../../shared/time.ts';

export type YtChannel = keyof typeof CHANNELS;
export type YtStatus = 'live' | 'offline' | 'unknown';
export type YtSource = 'api' | 'camstreamer' | 'seed' | 'etag';

export interface YtSlotState {
  videoId: string | null;
  status: YtStatus;
  title: string | null;
  actualStartTime: string | null; // ISO, from the Data API
  thumbKind: 'live' | 'custom';
  maxres: boolean | null; // first-sight maxresdefault_live HEAD (keyed only); null = never checked
  lastLiveAt: number | null;
  deadSince: number | null;
  apiAt: number | null; // last Data API classification
  source: YtSource; // the signal behind `status`
  etag: string | null; // hqdefault_live ETag of `videoId`; resets when the ID changes
  etagAt: number | null;
  csMisses: number; // consecutive CamStreamer "not live" answers
}
export interface YtSeen {
  channel: YtChannel;
  title: string;
  live: boolean;
  checkedAt: number;
}
export interface YtUnmapped {
  videoId: string;
  channel: YtChannel;
  title: string;
}
export interface YtState {
  v: 1;
  mode: 'api' | 'keyless';
  at: number; // job time
  slots: Record<string, YtSlotState>; // by cam id
  seen: Record<string, YtSeen>; // by video id; pruned to 30 days (Developer Policies III.E.4)
  unmapped: YtUnmapped[];
  lastDiscovery: Partial<Record<YtChannel, number>>;
  retries: Partial<Record<YtChannel, number>>;
  etagCursor: number;
  unitsTick: number; // Data API units this run spent; the dispatcher adds them to counter yt:units:{PT date}
}

export interface SlotDef extends YtSlot {
  channel: YtChannel;
  channelId: string;
}

export const API_FRESH_MS = HOUR; // an API status older than this decays to unknown
export const ETAG_FRESH_MS = 4 * HOUR; // an ETag hint younger than this still applies
const SEEN_TTL_MS = 30 * 24 * HOUR;
const UNMAPPED_MAX = 20;
export const ID_RE = /^[A-Za-z0-9_-]{11}$/;
/** Never promoted to live without an API LIVE result (§6.1 C: its handle points at an unavailable video). */
export const API_ONLY: ReadonlySet<string> = new Set(['deer-valley-ontario-snowstake-live']);

export const CHANNEL_IDS = Object.keys(CHANNELS) as YtChannel[];
export const SLOT_DEFS: readonly SlotDef[] = CHANNEL_IDS.flatMap((channel) =>
  (SLOTS[channel] as readonly YtSlot[]).map((s) => ({ ...s, channel, channelId: CHANNELS[channel].channelId })),
);
export const DEF_BY_CAM: ReadonlyMap<string, SlotDef> = new Map(SLOT_DEFS.map((d) => [d.cam, d]));
export const CS_DEFS = SLOT_DEFS.filter((d) => d.camstreamer);

/** First slot of the channel whose regex matches the title (the config order is the priority). */
export function matchSlot(channel: YtChannel, title: string): SlotDef | undefined {
  return SLOT_DEFS.find((d) => d.channel === channel && d.re.test(title));
}

export function initSlot(def: SlotDef): YtSlotState {
  return {
    videoId: def.seed ?? null,
    status: def.seed ? 'unknown' : 'offline',
    title: null,
    actualStartTime: null,
    thumbKind: 'live',
    maxres: null,
    lastLiveAt: null,
    deadSince: null,
    apiAt: null,
    source: 'seed',
    etag: null,
    etagAt: null,
    csMisses: 0,
  };
}

/** Points a slot at a new video (or none): everything tied to the old ID resets. */
export function setVideo(s: YtSlotState, id: string | null, source: YtSource): void {
  Object.assign(s, {
    videoId: id,
    status: 'unknown',
    title: null,
    actualStartTime: null,
    thumbKind: 'live',
    maxres: null,
    source,
    etag: null,
    etagAt: null,
    csMisses: 0,
  });
}

const STATUSES = new Set(['live', 'offline', 'unknown']);

function isSlotState(v: unknown): v is YtSlotState {
  return (
    isObj(v) &&
    (v.videoId === null || (typeof v.videoId === 'string' && ID_RE.test(v.videoId))) &&
    STATUSES.has(v.status as string)
  );
}

/** Working copy of the last-good row (or a fresh one from the config seeds), aligned with today's slot list. */
export function readState(row: unknown, now: number): YtState {
  const prev = isObj(row) && row.v === 1 && isObj(row.slots) ? (structuredClone(row) as unknown as YtState) : null;
  const slots: Record<string, YtSlotState> = {};
  for (const def of SLOT_DEFS) {
    const p = prev?.slots[def.cam];
    const reseeded = isSlotState(p) && p.source === 'seed' && def.seed !== undefined && p.videoId !== def.seed;
    slots[def.cam] = isSlotState(p) && !reseeded ? { ...initSlot(def), ...p } : initSlot(def);
  }
  return {
    v: 1,
    mode: 'keyless',
    at: now,
    slots,
    seen: isObj(prev?.seen) ? prev.seen : {},
    unmapped: Array.isArray(prev?.unmapped) ? prev.unmapped : [],
    lastDiscovery: isObj(prev?.lastDiscovery) ? prev.lastDiscovery : {},
    retries: isObj(prev?.retries) ? prev.retries : {},
    etagCursor: typeof prev?.etagCursor === 'number' && prev.etagCursor >= 0 ? prev.etagCursor : 0,
    unitsTick: 0,
  };
}

const apiFresh = (s: YtSlotState, now: number) =>
  s.source === 'api' && s.apiAt !== null && now - s.apiAt <= API_FRESH_MS;
const etagFresh = (s: YtSlotState, now: number) =>
  s.source === 'etag' && s.etagAt !== null && now - s.etagAt < ETAG_FRESH_MS;

/** True when a fresh API classification outranks keyless hints for this slot. */
export const apiOutranks = apiFresh;

/** §6.1 C: stale API/ETag statuses decay to unknown; seen and unmapped are pruned. */
export function settle(st: YtState, now: number): void {
  for (const s of Object.values(st.slots)) {
    if (s.videoId === null || s.status === 'unknown') continue;
    if (s.source === 'api' && !apiFresh(s, now)) s.status = 'unknown';
    if (s.source === 'etag' && !etagFresh(s, now)) s.status = 'unknown';
  }
  for (const [id, e] of Object.entries(st.seen)) {
    if (!isObj(e) || typeof e.checkedAt !== 'number' || now - e.checkedAt > SEEN_TTL_MS) delete st.seen[id];
  }
  const assigned = new Set(Object.values(st.slots).map((s) => s.videoId));
  const kept = new Map<string, YtUnmapped>();
  for (const u of st.unmapped) {
    if (isObj(u) && st.seen[u.videoId]?.live && !assigned.has(u.videoId)) kept.set(u.videoId, u);
  }
  st.unmapped = [...kept.values()].slice(-UNMAPPED_MAX);
}
