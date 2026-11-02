// Alta DigitalOcean stills (kind do_still): HEAD `?t={minute}` -> ETag + Last-Modified (spec §6.4). Alta's uploader
// rewrites every object each minute, so Last-Modified moves even when a camera is frozen (on 2026-11-01 High Rustler
// served an Oct 21 frame as "9 min ago"): asOf is when the ETag (the body's MD5) was first seen, so a repeat ETag
// turns the tile stale through /api/cams' 45-min rule after the next hourly check, with an honest age.
// The Collins stake (it has `archive`) is excluded: its freshness comes from stake-alta's frames.
import { CAMS } from '../../../../config/cams/index.ts';
import { httpDateToMs, isoUtc, MIN } from '../../../shared/time.ts';
import type { CamDef } from '../../../shared/types.ts';
import { cleanEtag, etagSince, stillBase } from './probe.ts';
import type { KindCheck } from './types.ts';

const CAMS_DO = (CAMS as readonly CamDef[]).filter((c) => c.kind === 'do_still' && !c.archive);

export const doStill: KindCheck = {
  name: 'do',
  requests: (now) =>
    CAMS_DO.map((c) => ({
      key: `do:${c.id}`,
      url: `${stillBase(c.still.card)}?t=${Math.floor(now / MIN)}`,
      method: 'HEAD',
      json: false,
    })),
  read(id, probe, ctx) {
    if (probe.status === 200) {
      const etag = cleanEtag(probe.etag);
      if (etag) {
        const at = etagSince(ctx.prev[id], etag, probe.lastModified, ctx.now);
        return { [id]: { online: true, asOf: at, etag, etagSince: at } };
      }
      const lm = httpDateToMs(probe.lastModified);
      return lm === null ? null : { [id]: { online: true, asOf: isoUtc(lm) } };
    }
    if (probe.status === 403 || probe.status === 404) return { [id]: { online: false } };
    return null;
  },
};
