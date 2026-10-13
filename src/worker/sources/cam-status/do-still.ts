// Alta DigitalOcean stills (kind do_still): HEAD `?t={minute}` -> Last-Modified (spec §6.4).
// The Collins stake (it has `archive`) is excluded: its freshness comes from stake-alta's frames.
import { CAMS } from '../../../../config/cams/index.ts';
import { httpDateToMs, isoUtc, MIN } from '../../../shared/time.ts';
import type { CamDef } from '../../../shared/types.ts';
import { stillBase } from './probe.ts';
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
  read(id, probe) {
    if (probe.status === 200) {
      const lm = httpDateToMs(probe.lastModified);
      return lm === null ? null : { [id]: { online: true, asOf: isoUtc(lm) } };
    }
    if (probe.status === 403 || probe.status === 404) return { [id]: { online: false } };
    return null;
  },
};
