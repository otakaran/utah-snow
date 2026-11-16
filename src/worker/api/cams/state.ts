// /api/cams body (spec §7, §6.4): one CamState per registry cam, in registry order. Status rules:
//   youtube / camstreamer_youtube = the yt:state slot status; a seasonal slot without a video ID -> seasonal-off.
//   hdrelay: online from hdrelay:config (a 404'd GUID is offline). UDOT: the PNG placeholder -> offline, else ok.
//   archive stakes: asOf = the newest stake_frames t (or the stake row's newest picture).
//   others: the cams:status entry. Then: online false -> offline; hiddenUntilFresh -> stale; no asOf -> live while
//   online with a live player, else unknown; else shared/cam-fresh.ts: a probed cam is ok while its picture was
//   <= 45 min old at its last check (Roundshot at night too) and that check is recent; an archived stake while its
//   newest frame is <= 45 min old now. `checkedAt` goes out with the probed cams so the caption can tell the two.
// timelapse.available: archive cams while their index has a servable frame from the last 24 h; HDRelay, Prism and
// Roundshot by frames/available.ts (the same rule /api/stake/:id/frames applies).
// The server fills only the placeholders it knows: {id} (the slot's video ID) and {hls} (the HDRelay host). Time
// placeholders ({m}, {m5}, {h}, {s}) stay for the client's cam-url expansion.
import { CAMS } from '../../../../config/cams/index.ts';
import { camFresh } from '../../../shared/cam-fresh.ts';
import { HOUR, isoUtc } from '../../../shared/time.ts';
import type { CamDef, CamState, YtSlotState, YtUnmapped } from '../../../shared/types.ts';
import { archiveSource, DEFAULT_HOURS, frameUrl } from '../../frames/archive.ts';
import { providerAvailable } from '../../frames/available.ts';
import { DEFAULT_HOST } from '../../sources/hdrelay-config.ts';
import type { CamInputs } from './inputs.ts';

const HOST_RE = /^\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.hdrelay\.com$/;
const CAMERA_RE = /^[0-9a-f-]{20,40}$/i;

/** CamState plus the archive's newest servable frame (`/api/stake/{source}/frame/{t}`). */
export interface CamOut extends CamState {
  latestFrame?: string;
}
export interface CamsBody {
  generatedAt: string;
  cams: CamOut[];
  unmapped: YtUnmapped[];
}
type Status = CamState['status'];
type Still = CamState['still'];

const mapStill = (s: Still, f: (url: string) => string): Still => ({
  card: f(s.card),
  detail: f(s.detail),
  wall: f(s.wall),
});

interface Seen {
  online: boolean | null;
  asOf: string | null;
  /** When cam-status last probed the cam; null for a picture time that is not a probe's (archived stakes). */
  checkedAt: string | null;
  hidden?: boolean;
}

/** Shared freshness rule for everything that is not YouTube or UDOT. */
function freshness(def: CamDef, seen: Seen, now: number): Status {
  if (seen.online === false) return 'offline';
  if (seen.hidden) return 'stale';
  if (!seen.asOf) return seen.online === true && def.live ? 'live' : 'unknown';
  return camFresh(def.kind, seen.asOf, seen.checkedAt, now) ? 'ok' : 'stale';
}

/** `checkedAt` only where there is one: the body stays as small as it was for the other cams. */
const checked = (checkedAt: string | null | undefined): { checkedAt?: string } => (checkedAt ? { checkedAt } : {});

/** YouTube stills: '' when there is no usable thumbnail (no ID, or a frozen custom one): a "LIVE · tap" card. */
function ytStill(still: Still, slot: YtSlotState | undefined): Still {
  const id = slot?.videoId ?? null;
  return mapStill(still, (tpl) => {
    if (!tpl.includes('{id}')) return tpl; // a non-YouTube override (Solitude Apex: Ski Utah)
    if (!id || slot?.thumbKind === 'custom') return '';
    const url = tpl.replaceAll('{id}', id);
    return slot?.maxres === true ? url : url.replace('/maxresdefault_live.jpg', '/hqdefault_live.jpg');
  });
}

function youtube(def: CamDef, inp: CamInputs): Omit<CamState, 'id' | 'timelapse'> {
  const slot = inp.yt.slots[def.id];
  const videoId = slot?.videoId ?? null;
  const status: Status = videoId ? (slot?.status ?? 'unknown') : def.seasonal ? 'seasonal-off' : 'offline';
  return {
    status,
    online: status === 'live' ? true : status === 'offline' ? false : null,
    asOf: inp.status[def.id]?.asOf ?? null,
    ...checked(inp.status[def.id]?.checkedAt),
    still: ytStill(def.still, slot),
    live: videoId ? { type: 'youtube', videoId } : null,
  };
}

function hdrelay(def: CamDef, inp: CamInputs, now: number): Omit<CamState, 'id' | 'timelapse'> {
  const cfg = inp.hdrelay[def.id];
  const e = inp.status[def.id];
  const host = cfg && HOST_RE.test(cfg.host) ? cfg.host : DEFAULT_HOST;
  const from = def.live?.cameraId;
  const to = cfg && CAMERA_RE.test(cfg.cameraId) ? cfg.cameraId : from;
  const resolve = (tpl: string) => {
    const url = tpl.replaceAll('{hls}', `https:${host}`);
    return from && to && from !== to ? url.replaceAll(from, to) : url;
  };
  const online = cfg?.gone ? false : typeof cfg?.online === 'boolean' ? cfg.online : (e?.online ?? null);
  const asOf = e?.asOf ?? null;
  const checkedAt = e?.checkedAt ?? null;
  return {
    status: freshness(def, { online, asOf, checkedAt }, now),
    online,
    asOf,
    ...checked(checkedAt),
    still: mapStill(def.still, resolve),
    live: def.live?.url ? { type: 'hls', url: resolve(def.live.url) } : null,
  };
}

function udot(def: CamDef, inp: CamInputs): Omit<CamState, 'id' | 'timelapse'> {
  const online = inp.udot[def.id]?.online ?? null; // VMS GIFs are never checked
  return { status: online === false ? 'offline' : 'ok', online, asOf: null, still: { ...def.still }, live: null };
}

function generic(def: CamDef, inp: CamInputs, now: number): Omit<CamState, 'id' | 'timelapse'> {
  const e = inp.status[def.id];
  let asOf = e?.asOf ?? null;
  let checkedAt = e?.checkedAt ?? null;
  if (def.archive) {
    const t = Math.max(inp.frames.get(def.id)?.newest ?? 0, inp.stakeT[def.id] ?? 0);
    if (t > 0) [asOf, checkedAt] = [isoUtc(t), null]; // the archive's own clock: judged against now
  }
  const online = e?.online ?? null;
  const live = def.live?.type === 'iframe' && def.live.url ? { type: 'iframe' as const, url: def.live.url } : null;
  const status = freshness(def, { online, asOf, checkedAt, hidden: e?.hidden === true }, now);
  return { status, online, asOf, ...checked(checkedAt), still: { ...def.still }, live };
}

function camState(def: CamDef, inp: CamInputs, now: number): CamOut {
  const body =
    def.kind === 'youtube' || def.kind === 'camstreamer_youtube'
      ? youtube(def, inp)
      : def.kind === 'hdrelay'
        ? hdrelay(def, inp, now)
        : def.kind === 'udot' || def.kind === 'udot_vms'
          ? udot(def, inp)
          : generic(def, inp, now);
  const src = archiveSource(def);
  const ready = src ? (inp.frames.get(src)?.ready ?? null) : null;
  const available =
    def.timelapse.provider === 'archive'
      ? ready !== null && now - ready <= DEFAULT_HOURS * HOUR
      : providerAvailable(def, inp.status[def.id]);
  const out: CamOut = { id: def.id, ...body, timelapse: { provider: def.timelapse.provider, available } };
  if (src && ready !== null) out.latestFrame = frameUrl(src, ready);
  return out;
}

/** Pure: inputs -> the /api/cams body. */
export function buildCams(inp: CamInputs, now: number): CamsBody {
  return {
    generatedAt: isoUtc(inp.maxAt),
    cams: (CAMS as readonly CamDef[]).map((def) => camState(def, inp, now)),
    unmapped: inp.yt.unmapped.map((u) => ({ videoId: u.videoId, channel: u.channel, title: u.title })),
  };
}
