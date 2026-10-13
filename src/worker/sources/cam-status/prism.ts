// Prism cams (kind prism): ONE cam_init call for all four (spec §5.4, §6.4); there is no prism:meta row.
// asOf comes only from the epoch field `current.time` (s), never from mysqlTime (local, DST-ambiguous).
// path = current.imagePath without its `000NN/` prefix (the raw imagePath 404s on GCS), else the last images[].path.
import { CAMS } from '../../../../config/cams/index.ts';
import { SITE } from '../../../../config/site.ts';
import { num } from '../../../shared/num.ts';
import type { CamDef } from '../../../shared/types.ts';
import { iso } from './probe.ts';
import type { EntryPatch, KindCheck } from './types.ts';

const PATH_RE = /^\d{4}\/\d{2}\/\d{2}\/\d{2}-\d{2}$/;
const MIN_EPOCH_S = 1_600_000_000; // 2020-09: anything older is junk

/** Prism cams with their cam number ('65' from `prism-cam-00065/`). */
export const PRISM_CAMS = (CAMS as readonly CamDef[])
  .filter((c) => c.kind === 'prism')
  .map((c) => ({ id: c.id, n: /prism-cam-0*(\d+)\//.exec(c.still.card)?.[1] ?? '' }))
  .filter((c) => c.n !== '');

// `url` is mandatory (empty body without it); no `callback`, so the response is JSON.
export const CAM_INIT_URL =
  'https://php.prismcam.com/public/helpers/cam_init.php' +
  `?cams=${PRISM_CAMS.map((c) => c.n).join(',')}&pages=&url=${encodeURIComponent(`${SITE.origin.replace(/^https?:/, '')}/`)}`;

interface PrismCam {
  id?: unknown;
  cam?: { camStatus?: unknown };
  current?: { imagePath?: unknown; time?: unknown };
  images?: { time?: unknown; path?: unknown }[];
}

function epochS(v: unknown, now: number): number | null {
  const s = num(v);
  return s !== null && s >= MIN_EPOCH_S && s <= now / 1000 + 3600 ? s : null;
}

function pathOf(c: PrismCam, images: NonNullable<PrismCam['images']>): string | undefined {
  const cur = typeof c.current?.imagePath === 'string' ? c.current.imagePath.replace(/^\d{5}\//, '') : '';
  if (PATH_RE.test(cur)) return cur;
  const last = images[images.length - 1]?.path;
  return typeof last === 'string' && PATH_RE.test(last) ? last : undefined;
}

function entry(c: PrismCam, now: number): EntryPatch {
  const images = Array.isArray(c.images) ? c.images : [];
  const times = images.map((i) => epochS(i?.time, now)).filter((t): t is number => t !== null);
  const t = epochS(c.current?.time, now);
  const status = c.cam?.camStatus;
  const out: EntryPatch = {
    online: status === undefined || status === null ? null : String(status) === '1',
    archive: {
      first: times.length ? iso(Math.min(...times) * 1000) : null,
      last: times.length ? iso(Math.max(...times) * 1000) : null,
      enabled: times.length > 0,
    },
  };
  if (t !== null) out.asOf = iso(t * 1000);
  const path = pathOf(c, images);
  if (path) out.path = path;
  return out;
}

export const prism: KindCheck = {
  name: 'prism',
  requests: () => (PRISM_CAMS.length ? [{ key: 'prism', url: CAM_INIT_URL, method: 'GET', json: true }] : []),
  read(_id, probe, { now }) {
    const cams = (probe.body as { cams?: unknown } | undefined)?.cams;
    if (probe.status !== 200 || !Array.isArray(cams)) return null;
    const out: Record<string, EntryPatch> = {};
    for (const def of PRISM_CAMS) {
      const c = (cams as PrismCam[]).find((x) => x && String(x.id) === def.n);
      if (c) out[def.id] = entry(c, now); // a cam missing from the answer keeps its previous entry
    }
    return Object.keys(out).length ? out : null;
  },
};
