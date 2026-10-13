// HDRelay cams (kind hdrelay): GET frames/info for the 9 archive positions (spec §6.4). GET only: HEAD returns 500.
// Active archives (their card is frames/last.jpg) scrub always and their asOf = archive.last. Gated archives scrub
// only while last is < 30 min old; their card is the live snapshot, so asOf stays null and freshness = `online`.
// `online` for all 12 HDRelay cams comes from the daily hdrelay:config row (maintenance, 08Z).
import { CAMS, type CamId } from '../../../../config/cams/index.ts';
import { num } from '../../../shared/num.ts';
import type { CamDef } from '../../../shared/types.ts';
import { iso } from './probe.ts';
import type { CamStatusRow, KindCheck } from './types.ts';

const GATE_MS = 30 * 60_000;
const MIN_MS = 1_500_000_000_000; // 2017: anything older is junk
const INFO = 'https://img.hdrelay.com/api/frames/info';

/**
 * The 9 archive positions (§6.4), verified against frames/info on 2026-10-12. Not taken from the player config:
 * Peruvian's config says `panorama`, but its frames live under `default`.
 */
export const ARCHIVES = {
  'snowbird-snowstake': { position: 'default', gated: false },
  'snowbird-tram-bullpen': { position: 'default', gated: false },
  'snowbasin-snowstake': { position: 'default', gated: false },
  'snowbasin-middle-bowl-base': { position: 'default', gated: false },
  'snowbird-peruvian-gulch': { position: 'default', gated: true },
  'snowbird-little-cloud': { position: 'default', gated: true },
  'snowbird-mineral-basin': { position: 'default', gated: true },
  'snowbasin-strawberry-patio': { position: 'panorama', gated: true },
  'snowbasin-base-of-wildcat': { position: 'panorama', gated: true },
} as const satisfies Partial<Record<CamId, { position: 'default' | 'panorama'; gated: boolean }>>;

type ArchiveId = keyof typeof ARCHIVES;
const isArchive = (id: string): id is ArchiveId => Object.hasOwn(ARCHIVES, id);

/** All HDRelay cams with their camera id (from the registry's live block). */
export const HDRELAY_CAMS = (CAMS as readonly CamDef[])
  .filter((c) => c.kind === 'hdrelay' && c.live?.cameraId)
  .map((c) => ({ id: c.id, cameraId: c.live?.cameraId ?? '' }));

export const frameInfoUrl = (cameraId: string, position: string): string =>
  `${INFO}?camera=${cameraId}&position=${position}`;

function ms(v: unknown, now: number): number | null {
  const n = num(v);
  return n !== null && n >= MIN_MS && n <= now + 3_600_000 ? n : null;
}

export const hdrelay: KindCheck = {
  name: 'hdrelay',
  requests: () =>
    HDRELAY_CAMS.filter((c) => isArchive(c.id)).map((c) => ({
      key: `hdrelay:${c.id}`,
      url: frameInfoUrl(c.cameraId, ARCHIVES[c.id as ArchiveId].position),
      method: 'GET',
      json: true,
    })),
  read(id, probe, { now }) {
    const body = probe.body as { first?: unknown; last?: unknown } | null | undefined;
    if (probe.status !== 200 || !isArchive(id) || !body || typeof body !== 'object') return null;
    const { position, gated } = ARCHIVES[id];
    const first = ms(body.first, now);
    const last = ms(body.last, now);
    const enabled = last !== null && (!gated || now - last < GATE_MS);
    const archive = {
      position,
      first: first === null ? null : iso(first),
      last: last === null ? null : iso(last),
      enabled,
    };
    return { [id]: gated ? { archive, asOf: null } : { archive, asOf: archive.last } };
  },
};

/** Sets `online` on every HDRelay cam from hdrelay:config (keeps the previous value when the config lacks it). */
export function applyHdrelayOnline(row: CamStatusRow, config: unknown, nowIso: string): void {
  const cfg = config && typeof config === 'object' ? (config as Record<string, { online?: unknown } | undefined>) : {};
  for (const { id } of HDRELAY_CAMS) {
    const online = cfg[id]?.online;
    const cur = row[id] ?? { online: null, asOf: null, checkedAt: nowIso };
    row[id] = { ...cur, online: typeof online === 'boolean' ? online : cur.online };
  }
}
