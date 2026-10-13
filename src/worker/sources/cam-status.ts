// Cam freshness, hourly in slot 11 (spec §6.4, §5.4). Job 'cam-status', row `cams:status` = {[camId]: entry}.
// Checks: Alta DO HEAD x5, Prism cam_init x1 (4 cams), HDRelay frames/info x9, Roundshot Location x3, Ski Utah HEAD x2
// = 20 requests, each one subrequest (redirects are never followed). Should the registry outgrow CAP, a window of
// CAP requests rotates every hour and unchecked cams keep their previous entry. One kind file per provider in
// cam-status/. YouTube (yt:state), UDOT (udot:cams) and archived stakes (stake_frames) are merged by /api/cams.
import { CAMS } from '../../../config/cams/index.ts';
import { HOUR, isoUtc } from '../../shared/time.ts';
import type { CamDef } from '../../shared/types.ts';
import { doStill } from './cam-status/do-still.ts';
import { ARCHIVES, applyHdrelayOnline, frameInfoUrl, HDRELAY_CAMS, hdrelay } from './cam-status/hdrelay.ts';
import { CAM_INIT_URL, prism } from './cam-status/prism.ts';
import { runProbe } from './cam-status/probe.ts';
import { roundshot } from './cam-status/roundshot.ts';
import { skiutah } from './cam-status/skiutah.ts';
import type { CamStatusEntry, CamStatusRaw, CamStatusRow, CheckReq, KindCheck } from './cam-status/types.ts';
import { type FetchCtx, type Output, type ParseCtx, type Source, ValidationError } from './types.ts';

export type { CamStatusEntry, CamStatusRaw, CamStatusRow } from './cam-status/types.ts';

export const CAM_STATUS_ROW = 'cams:status';
/** Read (not written) by this job: `online` for the 12 HDRelay cams. */
export const HDRELAY_CONFIG_ROW = 'hdrelay:config';
export const CAP = 20; // §6.4 / §5.3 slot 11: cam-status <= 20 subrequests

const KINDS: readonly KindCheck[] = [doStill, prism, hdrelay, roundshot, skiutah];
const KIND_BY_NAME = new Map(KINDS.map((k) => [k.name, k]));
const CAM_IDS = new Set((CAMS as readonly CamDef[]).map((c) => c.id));

/** Every request a full run makes, in kind order. */
export const allRequests = (now: number): CheckReq[] => KINDS.flatMap((k) => k.requests(now));

/** All requests while they fit in CAP (20 of 20 today), else a CAP-long window that moves every hour. */
export function pickRequests(all: readonly CheckReq[], now: number): CheckReq[] {
  if (all.length <= CAP) return [...all];
  const start = (Math.floor(now / HOUR) * CAP) % all.length;
  return Array.from({ length: CAP }, (_, i) => all[(start + i) % all.length] as CheckReq);
}

/** The last-good row, minus cams no longer in the registry. */
function prevRow(prev: unknown): CamStatusRow {
  const out: CamStatusRow = {};
  if (!prev || typeof prev !== 'object') return out;
  for (const [id, e] of Object.entries(prev)) {
    if (CAM_IDS.has(id) && e && typeof e === 'object') out[id] = e as CamStatusEntry;
  }
  return out;
}

/**
 * Pure: probes -> row. Each answered probe patches its cams over the previous entry (so an offline cam keeps its
 * last asOf); unanswered ones keep the previous entry. Gate: at least one probe must answer.
 */
export function parseCamStatus(raw: unknown, ctx: ParseCtx): CamStatusRow {
  const probes = (raw as Partial<CamStatusRaw> | null)?.probes;
  if (!probes || typeof probes !== 'object') throw new ValidationError('cam-status: no probes');
  const prev = prevRow(ctx.prev[CAM_STATUS_ROW]);
  const row: CamStatusRow = { ...prev };
  const checkedAt = isoUtc(ctx.now);
  let answered = 0;
  for (const [key, probe] of Object.entries(probes)) {
    const sep = key.indexOf(':');
    const kind = KIND_BY_NAME.get(sep < 0 ? key : key.slice(0, sep));
    if (!kind || !probe || typeof probe !== 'object' || typeof probe.status !== 'number') continue;
    const patch = kind.read(sep < 0 ? '' : key.slice(sep + 1), probe, { now: ctx.now, prev });
    if (!patch) continue;
    answered++;
    for (const [id, p] of Object.entries(patch)) row[id] = { online: null, asOf: null, ...prev[id], ...p, checkedAt };
  }
  if (answered === 0) throw new ValidationError(`cam-status: none of ${Object.keys(probes).length} checks answered`);
  applyHdrelayOnline(row, ctx.prev[HDRELAY_CONFIG_ROW], checkedAt);
  return row;
}

const firstArchive = HDRELAY_CAMS.find((c) => c.id === 'snowbasin-snowstake');

export const camStatus: Source<CamStatusRaw> = {
  id: 'cam-status',
  staleAfterMin: 120,
  rows: [CAM_STATUS_ROW],
  reads: [HDRELAY_CONFIG_ROW], // last-good HDRelay config: `online` for the 12 HDRelay cams
  maxSubrequests: (ctx) => pickRequests(allRequests(ctx.now), ctx.now).length, // 20; no redirect hops
  probes: [
    { hostId: 'alta-do', url: 'https://alta-webcams.sfo3.cdn.digitaloceanspaces.com/Superior.jpg' },
    { hostId: 'prism-caminit', url: CAM_INIT_URL },
    {
      hostId: 'hdrelay-img',
      url: frameInfoUrl(firstArchive?.cameraId ?? '', ARCHIVES['snowbasin-snowstake'].position),
    },
    { hostId: 'roundshot', url: 'https://backend.roundshot.com/cams/09123258cc29cd6e86d3af9a3836c150/medium' },
    { hostId: 'skiutah', url: 'https://www.skiutah.com/files/blob/webcam/LBSKmCQHw9GVGF5AcHnE2o' },
  ],
  async fetch(ctx: FetchCtx): Promise<CamStatusRaw> {
    const reqs = pickRequests(allRequests(ctx.now), ctx.now);
    const got = await Promise.all(reqs.map((r) => runProbe(ctx.fetch, r)));
    return { probes: Object.fromEntries(reqs.map((r, i) => [r.key, got[i] ?? { status: 0 }])) };
  },
  parse: (raw: CamStatusRaw, ctx: ParseCtx): Output => ({ rows: { [CAM_STATUS_ROW]: parseCamStatus(raw, ctx) } }),
};
