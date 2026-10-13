// HDRelay player configs (spec §6.2, §5.4): Snowbird 5 + Snowbasin 7. Runs inside the maintenance job at 08Z.
// Job 'hdrelay-config', row `hdrelay:config` = {[camId]: HdrelayCamConfig}. One GET per GUID, 12 subrequests.
// fetchx sends its explicit UA and never a Referer: manage.hdrelay.com answers 403 to any foreign Referer, and
// browsers never fetch these configs. Never use server.jpg (b15b answers 404) and never run the config's
// prepareFunction/_script. A GUID answering 404 ('player not found') marks the cam offline and `gone`.
import { CAMS } from '../../../config/cams/index.ts';
import { MAINT } from '../../../config/schedule.ts';
import { num } from '../../shared/num.ts';
import { HOUR, isoUtc } from '../../shared/time.ts';
import type { CamDef } from '../../shared/types.ts';
import { type FetchCtx, type Output, type ParseCtx, type Source, ValidationError } from './types.ts';

export const HDRELAY_CONFIG_ROW = 'hdrelay:config';
export const PLAYER_URL = 'https://manage.hdrelay.com/player/';
/** Hard fallback host (spec §8.3): live = 'https:' + host + '/camera/' + cameraId + '/relay/playlist.m3u8'. */
export const DEFAULT_HOST = '//b15.hdrelay.com';
const HOST_RE = /^(?:https?:)?(\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.hdrelay\.com)\/?$/i;
const CAMERA_ID_RE = /^[0-9a-f-]{20,40}$/i;

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

export interface PlayerProbe {
  status: number; // 0 = the request threw
  body?: unknown; // parsed JSON for 200
  err?: string;
}
/** Raw: cam id -> what its player GUID answered. */
export type HdrelayConfigRaw = Record<string, PlayerProbe>;

/** The 12 HDRelay cams with a player GUID, from the registry. */
export const PLAYERS = (CAMS as readonly CamDef[])
  .filter((c) => c.kind === 'hdrelay' && c.live?.playerGuid)
  .map((c) => ({ id: c.id, guid: c.live?.playerGuid ?? '', cameraId: c.live?.cameraId ?? '' }));

/** True in the maintenance tick that runs this job: MAINT.utcHours[0] (08Z, with the D1 prune). */
export const hdrelayConfigDue = (now: number): boolean => Math.floor(now / HOUR) % 24 === MAINT.utcHours[0];

type Player = (typeof PLAYERS)[number];
interface Body {
  camera?: { id?: unknown; status?: { online?: unknown } };
  server?: { hls?: unknown };
  video?: { timeout?: { inactive?: unknown }; record?: { enabled?: unknown } };
  image?: { position?: unknown; overlays?: { hotlink?: { enabled?: unknown; time?: unknown } } };
}

const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null);

function fallback(p: Player, prev: HdrelayCamConfig | undefined): HdrelayCamConfig {
  return (
    prev ?? {
      guid: p.guid,
      cameraId: p.cameraId,
      host: DEFAULT_HOST,
      online: null,
      timeoutInactive: null,
      recordEnabled: null,
      hotlink: null,
      checkedAt: null,
    }
  );
}

/** One 200 body -> config, or null when it has no usable camera.id. */
export function readPlayer(p: Player, body: unknown, checkedAt: string): HdrelayCamConfig | null {
  const b = (body && typeof body === 'object' ? body : {}) as Body;
  const cameraId = b.camera?.id;
  if (typeof cameraId !== 'string' || !CAMERA_ID_RE.test(cameraId)) return null;
  const hls = typeof b.server?.hls === 'string' ? HOST_RE.exec(b.server.hls.trim())?.[1] : undefined;
  const hl = b.image?.overlays?.hotlink;
  const out: HdrelayCamConfig = {
    guid: p.guid,
    cameraId,
    host: hls ? hls.toLowerCase() : DEFAULT_HOST,
    online: bool(b.camera?.status?.online),
    timeoutInactive: num(b.video?.timeout?.inactive),
    recordEnabled: bool(b.video?.record?.enabled),
    hotlink: hl && typeof hl === 'object' ? { enabled: hl.enabled === true, time: num(hl.time) } : null,
    checkedAt,
  };
  const pos = b.image?.position;
  if (pos === 'default' || pos === 'panorama') out.position = pos;
  return out;
}

/** Pure. Gate: at least one GUID must return a readable config; failures keep the previous entry. */
export function parseHdrelayConfig(raw: unknown, ctx: ParseCtx): HdrelayConfigRow {
  if (!raw || typeof raw !== 'object') throw new ValidationError('hdrelay-config: no probes');
  const probes = raw as Partial<HdrelayConfigRaw>;
  const prevRow = ctx.prev[HDRELAY_CONFIG_ROW];
  const prev = (prevRow && typeof prevRow === 'object' ? prevRow : {}) as Partial<HdrelayConfigRow>;
  const checkedAt = isoUtc(ctx.now);
  const row: HdrelayConfigRow = {};
  let read = 0;
  for (const p of PLAYERS) {
    const probe = probes[p.id];
    const cfg = probe?.status === 200 ? readPlayer(p, probe.body, checkedAt) : null;
    if (cfg) read++;
    row[p.id] =
      cfg ??
      (probe?.status === 404
        ? { ...fallback(p, prev[p.id]), online: false, gone: true, checkedAt }
        : fallback(p, prev[p.id]));
  }
  if (read === 0) throw new ValidationError(`hdrelay-config: none of ${PLAYERS.length} player configs was readable`);
  return row;
}

export const hdrelayConfig: Source<HdrelayConfigRaw> = {
  id: 'hdrelay-config',
  staleAfterMin: 2880,
  rows: [HDRELAY_CONFIG_ROW],
  maxSubrequests: () => PLAYERS.length, // 12 GETs; redirects are not followed
  probes: [{ hostId: 'hdrelay-config', url: `${PLAYER_URL}f9e1b19a-a72f-4319-8c01-0fd3e4392efb` }],
  async fetch(ctx: FetchCtx): Promise<HdrelayConfigRaw> {
    const opts = { headers: { Accept: 'application/json' }, follow: false, allowStatus: true } as const;
    const got = await Promise.all(
      PLAYERS.map(async (p): Promise<PlayerProbe> => {
        try {
          const res = await ctx.fetch<string>(`${PLAYER_URL}${p.guid}`, opts);
          if (res.status !== 200) return { status: res.status };
          try {
            return { status: 200, body: JSON.parse(res.data) };
          } catch {
            return { status: 200, err: 'not JSON' };
          }
        } catch (err) {
          return { status: 0, err: err instanceof Error ? err.name : 'Error' };
        }
      }),
    );
    return Object.fromEntries(PLAYERS.map((p, i) => [p.id, got[i] ?? { status: 0 }]));
  },
  parse: (raw: HdrelayConfigRaw, ctx: ParseCtx): Output => ({
    rows: { [HDRELAY_CONFIG_ROW]: parseHdrelayConfig(raw, ctx) },
  }),
};
