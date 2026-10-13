// Cam registry shapes (spec §4.3). Imported through src/shared/types.ts, never directly.
// Arrays are readonly so config/cams can use `as const satisfies readonly CamDef[]`.
import type { ResortId } from './resort.ts';
import type { Corridor } from './roads.ts';

export type CamKind =
  | 'do_still'
  | 'prism'
  | 'hdrelay'
  | 'roundshot'
  | 'roundshot360'
  | 'youtube'
  | 'camstreamer_youtube'
  | 'skiutah'
  | 'udot'
  | 'udot_vms';

export interface CamDef {
  id: string;
  resort: ResortId | null;
  corridor?: Corridor;
  name: string;
  kind: CamKind;
  /** URL templates; only src/shared/cam-url.ts expands their placeholders. */
  still: { card: string; detail: string; wall: string };
  /** dvr: detail-page Rewind, hidden if getDuration() < 3600. */
  live?: { type: 'hls' | 'youtube' | 'iframe'; url?: string; playerGuid?: string; cameraId?: string; dvr?: boolean };
  pageUrl: string;
  /** Applies everywhere, TV wall included. */
  refreshS: number;
  isStake: boolean;
  hero: boolean;
  /** Cam ids shown in order while this cam is stale/offline/not live. */
  fallback?: readonly string[];
  /** source = cam whose archive is used (default: self). */
  timelapse: { provider: 'archive' | 'hdrelay' | 'prism' | 'roundshot' | 'none'; source?: string; mp4?: boolean };
  /** The Worker archives this still to KV (§6.3). */
  archive?: { everyMin: 5 | 15 };
  seasonal?: boolean;
  hiddenUntilFresh?: boolean;
  offlineGated?: boolean;
  alternate?: boolean;
  detailOnly?: boolean;
  credit: string;
  /** From master-playlist BANDWIDTH (Appendix A). */
  bitrateMbps?: number;
}

/** Archive state of one snow-stake cam (spec §6.3): `cams[camId]` of the stake:alta / stake:skiutah rows. */
export interface StakeCam {
  t: number; // Last-Modified (ms) of the newest distinct picture; its KV key is cam:{camId}:{t}
  asOf: string; // the same instant, ISO
  hash: string; // upstream ETag digest, or SHA-1 of the body
  bytes: number;
  archived: boolean; // a frame for `t` went to Output.frames (false when the picture was older than 24 h)
  lm: string; // validators of the last 200; they move on unchanged uploads too
  etag: string | null;
  err?: string; // this cam failed in the last run (multi-cam rows only)
}
export interface StakeRow {
  asOf: string | null; // newest `t` over the cams
  cams: Record<string, StakeCam>;
}

// Cam status rows (spec §6.2, §6.4): cams:status (cam-status job), hdrelay:config and udot:cams (maintenance).

/** Archive bounds: HDRelay frames/info (one position) or the Prism cam_init 24 h image list. */
export interface CamArchive {
  position?: 'default' | 'panorama'; // HDRelay only
  first: string | null; // ISO
  last: string | null; // ISO
  /** Scrubber on: active archives while they have a frame, gated ones only while `last` is < 30 min old. */
  enabled: boolean;
}

/** One `cams:status` entry. A cam whose `asOf` is more than 45 min old shows as stale. */
export interface CamStatusEntry {
  online: boolean | null; // null = unknown
  asOf: string | null; // ISO time of the newest image; null for live-only stills (HDRelay snapshot)
  checkedAt: string; // ISO; when this entry was last refreshed (rotation keeps older entries)
  archive?: CamArchive;
  path?: string; // Prism: current object path 'YYYY/MM/DD/HH-MM' (local wall clock)
  hidden?: boolean; // Ski Utah hiddenUntilFresh: the ETag has not changed for 3 h
  etag?: string; // Ski Utah hiddenUntilFresh tracking
  etagSince?: string; // ISO; first time this ETag was seen (or its Last-Modified, if older)
}

/** Row `cams:status`: cam id -> entry. Only the cams this job checks (YouTube, UDOT, archives merge in /api/cams). */
export type CamStatusRow = Record<string, CamStatusEntry>;

export interface HdrelayCamConfig {
  guid: string;
  cameraId: string; // camera.id; the registry's value until a config has been read
  host: string; // server.hls, '//b15.hdrelay.com' today; only *.hdrelay.com is accepted
  online: boolean | null; // camera.status.online; null = never read
  gone?: true; // the GUID answered 404
  timeoutInactive: number | null; // video.timeout.inactive, seconds
  recordEnabled: boolean | null; // video.record.enabled
  hotlink: { enabled: boolean; time: number | null } | null; // image.overlays.hotlink ('Last Snow'), time = epoch ms
  position?: 'default' | 'panorama'; // image.position (timelapse players only)
  checkedAt: string | null; // ISO of the last answer (200 or 404)
}
export type HdrelayConfigRow = Record<string, HdrelayCamConfig>;

export interface UdotCamState {
  online: boolean; // false = the PNG placeholder (or 404): hide the tile
  checkedAt: string; // ISO
}
/** Row `udot:cams`: Cctv cam id -> state. Built up over the three daily batches. */
export type UdotCamsRow = Record<string, UdotCamState>;
