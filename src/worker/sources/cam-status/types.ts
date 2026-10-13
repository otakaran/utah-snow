// cam-status shapes (spec §6.4). The row types belong in src/shared/types/cams.ts once /api/cams reads them.

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

/** What one request saw. JSON-serialisable, so fixtures store it as is. */
export interface Probe {
  status: number; // 0 = the request threw (err holds the error name)
  err?: string;
  lastModified?: string;
  etag?: string;
  location?: string;
  contentType?: string;
  body?: unknown; // parsed JSON (frames/info, cam_init); absent for HEADs and redirects
}

/** Raw for cam-status: probe key -> probe. Keys are `${check}:${camId}`, or `prism` for the one cam_init call. */
export interface CamStatusRaw {
  probes: Record<string, Probe>;
}

/** One planned request. */
export interface CheckReq {
  key: string;
  url: string;
  method: 'GET' | 'HEAD';
  json: boolean; // read and JSON.parse the body (GET 200 only)
}

export interface ReadCtx {
  now: number;
  prev: CamStatusRow;
}

/** Fields a probe sets; the rest carry over from the previous entry (e.g. `asOf` stays while a cam is offline). */
export type EntryPatch = Partial<Omit<CamStatusEntry, 'checkedAt'>>;

/** One provider check: plan requests from config, read one probe into entries (null = told us nothing). */
export interface KindCheck {
  name: string; // probe-key prefix
  requests(now: number): CheckReq[];
  read(id: string, probe: Probe, ctx: ReadCtx): Record<string, EntryPatch> | null;
}
