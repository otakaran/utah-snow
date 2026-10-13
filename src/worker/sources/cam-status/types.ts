// cam-status internals (spec §6.4). The row types (CamStatusEntry, CamStatusRow) live in src/shared/types/cams.ts.
import type { CamStatusEntry, CamStatusRow } from '../../../shared/types.ts';

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
