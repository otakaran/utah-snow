// Ski Utah stills without our own archive (spec §6.4): HEAD the blob with `?_ts={s}` (a `_=` query returns a 404
// HTML page, so fetchx `bust` is never used here). Covers the Brighton stake (kind skiutah) and the Solitude Apex
// override (a youtube cam whose stills are Ski Utah). Archived stakes get their asOf from stake_frames instead.
// hiddenUntilFresh cams: Last-Modified moves even when the image is stale, so freshness = how long the ETag (the
// body's SHA-1) has been unchanged; >= 3 h hides the tile.
import { CAMS } from '../../../../config/cams/index.ts';
import { HOUR, httpDateToMs, isoToMs, isoUtc } from '../../../shared/time.ts';
import type { CamDef } from '../../../shared/types.ts';
import { stillBase } from './probe.ts';
import type { EntryPatch, KindCheck, ReadCtx } from './types.ts';

const BLOB = 'https://www.skiutah.com/files/blob/webcam/';
const HIDE_AFTER_MS = 3 * HOUR;

const CAMS_SU = (CAMS as readonly CamDef[]).filter((c) => c.still.card.startsWith(BLOB) && !c.archive);
const byId = new Map(CAMS_SU.map((c) => [c.id, c]));

function etagEntry(id: string, etag: string, lastModified: string | undefined, ctx: ReadCtx): EntryPatch {
  const prev = ctx.prev[id];
  const lm = httpDateToMs(lastModified);
  // First sight of this ETag: it is at least as old as Last-Modified (when that is in the past).
  const since = (prev?.etag === etag ? isoToMs(prev.etagSince) : null) ?? (lm !== null && lm < ctx.now ? lm : ctx.now);
  const at = isoUtc(since);
  return { online: true, asOf: at, etag, etagSince: at, hidden: ctx.now - since >= HIDE_AFTER_MS };
}

export const skiutah: KindCheck = {
  name: 'skiutah',
  requests: (now) =>
    CAMS_SU.map((c) => ({
      key: `skiutah:${c.id}`,
      url: `${stillBase(c.still.card)}?_ts=${Math.floor(now / 1000)}`,
      method: 'HEAD',
      json: false,
    })),
  read(id, probe, ctx) {
    const cam = byId.get(id);
    if (!cam) return null;
    const image = probe.status === 200 && /^image\//i.test(probe.contentType ?? '');
    if (probe.status === 404) return { [id]: { online: false } };
    if (!image) return null;
    const etag = probe.etag?.replace(/^W\//, '').replace(/"/g, '');
    if (cam.hiddenUntilFresh && etag) return { [id]: etagEntry(id, etag, probe.lastModified, ctx) };
    const lm = httpDateToMs(probe.lastModified);
    return lm === null ? null : { [id]: { online: true, asOf: isoUtc(lm) } };
  },
};
