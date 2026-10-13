// What youtube.fetch() hands to parse(): every upstream answer of the tick, in the order it was used.
// parse() replays the same pure steps on the last-good state, so fetch-time decisions are reproducible.
import type { CsHit } from './camstreamer.ts';
import type { ApiCall, DiscoveryRun } from './data-api.ts';
import type { ThumbHit } from './keyless.ts';
import { CHANNEL_IDS } from './state.ts';

export interface YtRaw {
  v: 1;
  keyed: boolean; // a key was configured for this tick
  lite: boolean; // slot 11: liveness only, no CamStreamer, no hourly discovery
  pending: string[]; // cam ids with a yt:pending report
  cs: CsHit[];
  liveness: ApiCall | null; // null = no Data API call this tick
  discovery: DiscoveryRun[];
  thumbs: ThumbHit[];
  etagCursor: number; // round-robin position after this tick's ETag HEADs
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStatus = (v: unknown) => v === null || (typeof v === 'number' && Number.isInteger(v));
const isStrArr = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === 'string');
const isItems = (v: unknown) =>
  v === null || (Array.isArray(v) && v.every((i) => isObj(i) && typeof i.id === 'string'));

function isCall(v: unknown): v is ApiCall {
  return isObj(v) && isStatus(v.status) && isStrArr(v.ids) && isItems(v.items);
}

function isRun(v: unknown): v is DiscoveryRun {
  if (!isObj(v) || !CHANNEL_IDS.includes(v.channel as never) || !isObj(v.playlist)) return false;
  const ids = v.playlist.ids;
  return isStatus(v.playlist.status) && (ids === null || isStrArr(ids)) && (v.videos === null || isCall(v.videos));
}

/** Shape gate for parse(): anything else is a ValidationError. */
export function isYtRaw(v: unknown): v is YtRaw {
  if (!isObj(v) || v.v !== 1 || !isStrArr(v.pending) || typeof v.etagCursor !== 'number') return false;
  if (!Array.isArray(v.cs) || !Array.isArray(v.thumbs) || !Array.isArray(v.discovery)) return false;
  return (
    v.cs.every((h) => isObj(h) && typeof h.cam === 'string' && isStatus(h.status)) &&
    v.thumbs.every((h) => isObj(h) && typeof h.cam === 'string' && typeof h.id === 'string' && isStatus(h.status)) &&
    v.discovery.every(isRun) &&
    (v.liveness === null || isCall(v.liveness))
  );
}

/** [requests made, requests answered with any HTTP status]. */
export function answerCount(raw: YtRaw): [number, number] {
  const statuses = [
    ...raw.cs.map((h) => h.status),
    ...raw.thumbs.map((h) => h.status),
    ...(raw.liveness ? [raw.liveness.status] : []),
    ...raw.discovery.flatMap((r) => [r.playlist.status, ...(r.videos ? [r.videos.status] : [])]),
  ];
  return [statuses.length, statuses.filter((s) => s !== null).length];
}

/** The Data API answered the liveness call this tick (else the tick runs keyless, §6.1 B). */
export const apiOk = (raw: YtRaw) => raw.liveness !== null && raw.liveness.items !== null;
