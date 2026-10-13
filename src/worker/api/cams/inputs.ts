// /api/cams inputs (spec §6.4 "Other inputs merged by /api/cams"): the status rows decoded from their payload
// strings, plus the stake_frames stats. Malformed or missing rows decode to empty values, never errors.
import { HDRELAY_CONFIG_ROW } from '../../../../config/cams/index.ts';
import { isObj, tryJson } from '../../../shared/json.ts';
import type { CamStatusRow, HdrelayConfigRow, UdotCamsRow, YtState } from '../../../shared/types.ts';
import { CAM_STATUS_ROW } from '../../sources/cam-status.ts';
import { UDOT_CAMS_ROW } from '../../sources/udot-cam-check.ts';
import { readState } from '../../sources/youtube/state.ts';
import type { FrameStat, PayloadRow } from '../../store/frames.ts';

export const YT_ROW = 'yt:state';
const STAKE_ROWS = ['stake:alta', 'stake:skiutah'];
/** Every source_state row /api/cams reads. */
export const CAM_ROWS: readonly string[] = [CAM_STATUS_ROW, YT_ROW, HDRELAY_CONFIG_ROW, UDOT_CAMS_ROW, ...STAKE_ROWS];

export interface CamInputs {
  status: Partial<CamStatusRow>;
  yt: YtState; // the last-good row aligned with today's slots, or the config seeds (keyless start)
  hdrelay: Partial<HdrelayConfigRow>;
  udot: Partial<UdotCamsRow>;
  stakeT: Record<string, number>; // newest picture per archived cam from the stake rows (archived or not)
  frames: Map<string, { newest: number; ready: number | null }>;
  maxAt: number; // newest fetched_at / frame t over the inputs: the body's generatedAt
}

const record = <T>(v: unknown): Partial<Record<string, T>> => (isObj(v) ? (v as Partial<Record<string, T>>) : {});

function stakeTimes(rows: readonly unknown[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const row of rows) {
    const cams = isObj(row) && isObj(row.cams) ? row.cams : {};
    for (const [id, c] of Object.entries(cams)) {
      if (isObj(c) && typeof c.t === 'number' && Number.isFinite(c.t)) out[id] = c.t;
    }
  }
  return out;
}

/** Pure: D1 rows -> CamInputs. */
export function decodeInputs(rows: readonly PayloadRow[], frames: readonly FrameStat[], now: number): CamInputs {
  const byId = new Map(rows.map((r) => [r.source_id, tryJson(r.payload)]));
  const stats = new Map(frames.map((f) => [f.cam_id, { newest: Number(f.newest), ready: f.ready ?? null }]));
  const maxAt = Math.max(0, ...rows.map((r) => r.fetched_at), ...frames.map((f) => Number(f.newest)));
  return {
    status: record(byId.get(CAM_STATUS_ROW)),
    yt: readState(byId.get(YT_ROW), now),
    hdrelay: record(byId.get(HDRELAY_CONFIG_ROW)),
    udot: record(byId.get(UDOT_CAMS_ROW)),
    stakeT: stakeTimes(STAKE_ROWS.map((id) => byId.get(id))),
    frames: stats,
    maxAt,
  };
}
