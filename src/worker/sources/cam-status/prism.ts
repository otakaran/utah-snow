// Prism cams (kind prism): ONE cam_init call for all four (spec §5.4, §6.4); there is no prism:meta row.
// asOf comes only from the epoch field `current.time` (s), never from mysqlTime (local, DST-ambiguous).
// path = current.imagePath without its `000NN/` prefix (the raw imagePath 404s on GCS), else the last images[].path.
// The cam_init URL, path format, epoch floor and cam numbers here are also the timelapse's (frames/prism.ts).
import { CAMS } from '../../../../config/cams/index.ts';
import { SITE } from '../../../../config/site.ts';
import { num } from '../../../shared/num.ts';
import { isoUtc } from '../../../shared/time.ts';
import type { CamDef } from '../../../shared/types.ts';
import type { EntryPatch, KindCheck } from './types.ts';

/** images[].path: 'YYYY/MM/DD/HH-MM' (Denver wall time). */
export const PRISM_PATH_RE = /^\d{4}\/\d{2}\/\d{2}\/\d{2}-\d{2}$/;
export const PRISM_MIN_EPOCH_S = 1_600_000_000; // 2020-09: anything older is junk

/** The cam's Prism number from its still URL: { n: '88', pad: '00088' } from `prism-cam-00088/`. */
export function prismCam(def: CamDef): { n: string; pad: string } | null {
  const pad = /\/prism-cam-(\d{5})\//.exec(def.still.card)?.[1];
  return pad ? { n: String(Number(pad)), pad } : null;
}

/** cam_init for these cam numbers. `url` is mandatory (an empty body without it); no `callback`, so it is JSON. */
export const camInitUrl = (ns: readonly string[]): string =>
  'https://php.prismcam.com/public/helpers/cam_init.php' +
  `?cams=${ns.join(',')}&pages=&url=${encodeURIComponent(`${SITE.origin.replace(/^https?:/, '')}/`)}`;

/** Prism cams with their cam number. */
export const PRISM_CAMS = (CAMS as readonly CamDef[])
  .filter((c) => c.kind === 'prism')
  .flatMap((c) => {
    const cam = prismCam(c);
    return cam ? [{ id: c.id, n: cam.n }] : [];
  });

export const CAM_INIT_URL = camInitUrl(PRISM_CAMS.map((c) => c.n));

interface PrismCam {
  id?: unknown;
  cam?: { camStatus?: unknown };
  current?: { imagePath?: unknown; time?: unknown };
  images?: { time?: unknown; path?: unknown }[];
}

function epochS(v: unknown, now: number): number | null {
  const s = num(v);
  return s !== null && s >= PRISM_MIN_EPOCH_S && s <= now / 1000 + 3600 ? s : null;
}

function pathOf(c: PrismCam, images: NonNullable<PrismCam['images']>): string | undefined {
  const cur = typeof c.current?.imagePath === 'string' ? c.current.imagePath.replace(/^\d{5}\//, '') : '';
  if (PRISM_PATH_RE.test(cur)) return cur;
  const last = images[images.length - 1]?.path;
  return typeof last === 'string' && PRISM_PATH_RE.test(last) ? last : undefined;
}

function entry(c: PrismCam, now: number): EntryPatch {
  const images = Array.isArray(c.images) ? c.images : [];
  const times = images.map((i) => epochS(i?.time, now)).filter((t): t is number => t !== null);
  const t = epochS(c.current?.time, now);
  const status = c.cam?.camStatus;
  const out: EntryPatch = {
    online: status === undefined || status === null ? null : String(status) === '1',
    archive: {
      first: times.length ? isoUtc(Math.min(...times) * 1000) : null,
      last: times.length ? isoUtc(Math.max(...times) * 1000) : null,
      enabled: times.length > 0,
    },
  };
  if (t !== null) out.asOf = isoUtc(t * 1000);
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
