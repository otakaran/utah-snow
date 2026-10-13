// Every CamKind's client behavior. Adding a CamKind to src/shared/types fails tsc here until its file exists.
import type { CamKind } from '../../../../shared/types.ts';
import { camstreamerYoutube } from './camstreamer-youtube.ts';
import { doStill } from './do-still.ts';
import { hdrelay } from './hdrelay.ts';
import type { KindSpec } from './kind.ts';
import { prism } from './prism.ts';
import { roundshot } from './roundshot.ts';
import { roundshot360 } from './roundshot360.ts';
import { skiutah } from './skiutah.ts';
import { udot } from './udot.ts';
import { udotVms } from './udot-vms.ts';
import { youtube } from './youtube.ts';

export type { KindSpec } from './kind.ts';
export { ytVideoId } from './youtube.ts';

export const KINDS: Record<CamKind, KindSpec> = {
  do_still: doStill,
  prism,
  hdrelay,
  roundshot,
  roundshot360,
  youtube,
  camstreamer_youtube: camstreamerYoutube,
  skiutah,
  udot,
  udot_vms: udotVms,
};
