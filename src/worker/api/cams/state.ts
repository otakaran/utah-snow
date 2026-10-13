// /api/cams body (spec §7, §6.4): one CamState per registry cam, in registry order. Status rules:
//   youtube / camstreamer_youtube = the yt:state slot status; a seasonal slot without a video ID -> seasonal-off.
//   hdrelay: online from hdrelay:config (a 404'd GUID is offline). UDOT: the PNG placeholder -> offline, else ok.
//   archive stakes: asOf = the newest stake_frames t (or the stake row's newest picture).
//   others: the cams:status entry. Then: online false -> offline; hiddenUntilFresh -> stale; no asOf -> live while
//   online with a live player, else unknown; asOf <= 45 min -> ok (Roundshot at night too), else stale.
// The server fills only the placeholders it knows: {id} (the slot's video ID) and {hls} (the HDRelay host). Time
// placeholders ({m}, {m5}, {h}, {s}) stay for the client's cam-url expansion.
import { CAMS } from '../../../../config/cams/index.ts';
import { HOUR, isBetweenLocal, isoToMs, isoUtc, MIN } from '../../../shared/time.ts';
import type { CamDef, CamState, YtSlotState, YtUnmapped } from '../../../shared/types.ts';
import { archiveSource, DEFAULT_HOURS, frameUrl } from '../../frames/archive.ts';
import { DEFAULT_HOST } from '../../sources/hdrelay-config.ts';
import type { CamInputs } from './inputs.ts';

const STALE_MS = 45 * MIN;
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

/** Shared freshness rule for everything that is not YouTube or UDOT. */
function freshness(def: CamDef, online: boolean | null, asOf: string | null, hidden: boolean, now: number): Status {
  if (online === false) return 'offline';
  if (hidden) return 'stale';
  if (!asOf) return online === true && def.live ? 'live' : 'unknown';
  const ms = isoToMs(asOf);
  if (ms !== null && now - ms <= STALE_MS) return 'ok';
  const roundshot = def.kind === 'roundshot' || def.kind === 'roundshot360';
  return roundshot && !isBetweenLocal(now, '07:10', '17:30') ? 'ok' : 'stale'; // no captures at night
}

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
  const out: Omit<CamState, 'id' | 'timelapse'> = {
    status,
    online: status === 'live' ? true : status === 'offline' ? false : null,
    asOf: inp.status[def.id]?.asOf ?? null,
    still: ytStill(def.still, slot),
    live: videoId ? { type: 'youtube', videoId } : null,
  };
  if (slot) out.thumbKind = slot.thumbKind;
  return out;
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
  return {
    status: freshness(def, online, asOf, false, now),
    online,
    asOf,
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
  if (def.archive) {
    const t = Math.max(inp.frames.get(def.id)?.newest ?? 0, inp.stakeT[def.id] ?? 0);
    asOf = t > 0 ? isoUtc(t) : asOf;
  }
  const online = e?.online ?? null;
  const live = def.live?.type === 'iframe' && def.live.url ? { type: 'iframe' as const, url: def.live.url } : null;
  return { status: freshness(def, online, asOf, e?.hidden === true, now), online, asOf, still: { ...def.still }, live };
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
  // Only archive lists are served today (§6.3); HDRelay, Prism and Roundshot lists arrive in Phase 2.
  const available = ready !== null && now - ready <= DEFAULT_HOURS * HOUR;
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
