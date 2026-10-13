// §6.1 B/D/E: the keyed path (YouTube Data API v3, used only when ctx.keyed.yt and ctx.secrets.yt are set).
// I/O and response validation live here; the state transitions live in liveness.ts. Every call costs 1 unit
// (videos.list, playlistItems.list); search.list is never used. The key only ever appears in request URLs,
// and fetchx redacts `key=` in its errors; nothing here stores or rethrows a URL.
import { CHANNELS } from '../../../../config/youtube.ts';
import type { FetchX } from '../types.ts';
import { type CsHit, csCandidate } from './camstreamer.ts';
import { CHANNEL_IDS, DEF_BY_CAM, HOUR, ID_RE, SLOT_DEFS, type YtChannel, type YtState } from './state.ts';

export interface VideoItem {
  id: string;
  snippet?: { channelId?: string; title?: string; liveBroadcastContent?: string };
  liveStreamingDetails?: { actualStartTime?: string; actualEndTime?: string };
  status?: { privacyStatus?: string; embeddable?: boolean };
}
export interface ApiCall {
  status: number | null;
  ids: string[]; // asked for
  items: VideoItem[] | null; // null = failed (non-200, bad JSON, network)
}
export type DiscoveryReason = 'hourly' | 'death' | 'pending';
export interface DiscoveryRun {
  channel: YtChannel;
  reason: DiscoveryReason;
  playlist: { status: number | null; ids: string[] | null };
  videos: ApiCall | null; // null = nothing new to classify (or the playlist call failed)
}

const API = 'https://www.googleapis.com/youtube/v3/';
const VIDEO_FIELDS =
  'items(id,snippet(channelId,title,liveBroadcastContent),liveStreamingDetails(actualStartTime,actualEndTime),status(privacyStatus,embeddable))';
const MAX_IDS = 50;
export const HOURLY_SLOT = 3; // hourly discovery for all channels (§6.1 D)
export const DISCOVERY_UNITS = 2; // playlistItems + videos per channel
export const UNITS_ANOMALY = 1000; // above this only death-triggered discovery runs (§6.1 E)
const EXTRA_MIN_REMAINING = 8; // off-schedule discovery needs this much tick budget left
const RECHECK_MS = HOUR;

export const videosUrl = (ids: readonly string[], key: string) =>
  `${API}videos?part=snippet,liveStreamingDetails,status&id=${ids.join(',')}&fields=${VIDEO_FIELDS}&key=${encodeURIComponent(key)}`;
export const playlistUrl = (playlistId: string, key: string) =>
  `${API}playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=50` +
  `&fields=items(contentDetails(videoId,videoPublishedAt))&key=${encodeURIComponent(key)}`;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

async function getJson(fx: FetchX, url: string): Promise<{ status: number | null; json: unknown }> {
  try {
    const r = await fx<string>(url, {
      headers: { Accept: 'application/json' },
      follow: false,
      allowStatus: true,
      allowBlocked: true,
    });
    if (r.status !== 200 || r.blocked) return { status: r.status, json: null };
    return { status: r.status, json: JSON.parse(r.data) };
  } catch {
    return { status: null, json: null };
  }
}

/** videos.list items, or null when the payload is not a videos.list response. */
export function videoItems(json: unknown): VideoItem[] | null {
  if (!isObj(json)) return null;
  const items = json.items ?? []; // a `fields` filter drops an empty items array
  if (!Array.isArray(items)) return null;
  return items.filter((i): i is VideoItem => isObj(i) && typeof i.id === 'string' && ID_RE.test(i.id));
}

/** playlistItems.list video ids, or null when the payload is not a playlistItems response. */
export function playlistIds(json: unknown): string[] | null {
  if (!isObj(json)) return null;
  const items = json.items ?? [];
  if (!Array.isArray(items)) return null;
  const ids = items.map((i) => (isObj(i) && isObj(i.contentDetails) ? i.contentDetails.videoId : null));
  return ids.filter((id): id is string => typeof id === 'string' && ID_RE.test(id));
}

export async function fetchVideos(fx: FetchX, key: string, ids: readonly string[]): Promise<ApiCall> {
  const asked = ids.slice(0, MAX_IDS);
  const r = await getJson(fx, videosUrl(asked, key));
  return { status: r.status, ids: asked, items: r.json === null ? null : videoItems(r.json) };
}

/** IDs for the per-tick liveness call: every slot ID plus the CamStreamer candidates (<= 50). */
export function livenessIds(st: YtState, hits: readonly CsHit[]): string[] {
  const ids = new Set<string>();
  for (const def of SLOT_DEFS) {
    const id = st.slots[def.cam]?.videoId;
    if (id) ids.add(id);
  }
  for (const h of hits) {
    const id = csCandidate(h);
    if (id && DEF_BY_CAM.has(h.cam)) ids.add(id);
  }
  return [...ids].slice(0, MAX_IDS);
}

export interface PlanOpts {
  slot: number;
  unitsToday: number;
  pending: readonly string[]; // cam ids with a yt:pending report
  remaining: number; // tick budget left (ctx.fetch.remaining())
}

/** Channels to discover this tick (at most one run each, <= 2 units each). */
export function planDiscovery(st: YtState, o: PlanOpts): { channel: YtChannel; reason: DiscoveryReason }[] {
  const anomaly = o.unitsToday > UNITS_ANOMALY;
  const plan = new Map<YtChannel, DiscoveryReason>();
  if (o.slot === HOURLY_SLOT && !anomaly) for (const ch of CHANNEL_IDS) plan.set(ch, 'hourly');
  for (const ch of CHANNEL_IDS) if ((st.retries[ch] ?? 0) > 0 && !plan.has(ch)) plan.set(ch, 'death');
  if (!anomaly) {
    for (const cam of o.pending) {
      const ch = DEF_BY_CAM.get(cam)?.channel;
      if (ch && !plan.has(ch)) plan.set(ch, 'pending');
    }
  }
  const tooTight = o.remaining < EXTRA_MIN_REMAINING;
  return [...plan]
    .filter(([, reason]) => reason === 'hourly' || !tooTight)
    .map(([channel, reason]) => ({ channel, reason }));
}

/** One discovery run: uploads playlist (1 unit), then videos.list for IDs not classified in the last hour. */
export async function fetchDiscovery(
  fx: FetchX,
  key: string,
  st: YtState,
  run: { channel: YtChannel; reason: DiscoveryReason },
  now: number,
): Promise<DiscoveryRun> {
  const pl = await getJson(fx, playlistUrl(CHANNELS[run.channel].uploads, key));
  const ids = pl.json === null ? null : playlistIds(pl.json);
  const fresh = (ids ?? []).filter((id) => {
    const seen = st.seen[id];
    return !seen || now - seen.checkedAt > RECHECK_MS;
  });
  const videos = fresh.length > 0 ? await fetchVideos(fx, key, fresh) : null;
  return { ...run, playlist: { status: pl.status, ids }, videos };
}

/** Data API units a tick spent: every attempted call counts (invalid requests are charged too). */
export function unitsSpent(liveness: ApiCall | null, runs: readonly DiscoveryRun[]): number {
  return (liveness ? 1 : 0) + runs.reduce((n, r) => n + 1 + (r.videos ? 1 : 0), 0);
}
