// Alta DigitalOcean stills (kind do_still): HEAD `?t={minute}` -> Last-Modified (spec §6.4).
// The Collins stake (it has `archive`) is excluded: its freshness comes from stake-alta's frames.
import { CAMS } from '../../../../config/cams/index.ts';
import type { CamDef } from '../../../shared/types.ts';
import { httpDateIso, stillBase } from './probe.ts';
import type { KindCheck } from './types.ts';

const CAMS_DO = (CAMS as readonly CamDef[]).filter((c) => c.kind === 'do_still' && !c.archive);

export const doStill: KindCheck = {
  name: 'do',
  requests: (now) =>
    CAMS_DO.map((c) => ({
      key: `do:${c.id}`,
      url: `${stillBase(c.still.card)}?t=${Math.floor(now / 60_000)}`,
      method: 'HEAD',
      json: false,
    })),
  read(id, probe) {
    if (probe.status === 200) {
      const asOf = httpDateIso(probe.lastModified);
      return asOf ? { [id]: { online: true, asOf } } : null;
    }
    if (probe.status === 403 || probe.status === 404) return { [id]: { online: false } };
    return null;
  },
};
