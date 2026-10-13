// Cam registry (spec §4.3, Appendix A): CAMS = 56 resort cams + 52 UDOT cams, STAKE_ORDER, HEROES. Data only;
// URL templates expand in src/shared/cam-url.ts. Integrity checks live in src/shared/config.test.ts.
import type { CamDef, ResortId } from '../../src/shared/types.ts';
import { ALTA_CAMS } from './alta.ts';
import { BRIGHTON_CAMS } from './brighton.ts';
import { DEER_VALLEY_CAMS } from './deer-valley.ts';
import { SNOWBASIN_CAMS } from './snowbasin.ts';
import { SNOWBIRD_CAMS } from './snowbird.ts';
import { SOLITUDE_CAMS } from './solitude.ts';
import { UDOT_CAMS } from './udot.ts';

export { UDOT_CAMS };

/** Row the maintenance job's hdrelay-config writes (08Z) and cam-status reads for the HDRelay cams' `online`. */
export const HDRELAY_CONFIG_ROW = 'hdrelay:config';

export const RESORT_CAMS = {
  alta: ALTA_CAMS,
  snowbird: SNOWBIRD_CAMS,
  brighton: BRIGHTON_CAMS,
  solitude: SOLITUDE_CAMS,
  'deer-valley': DEER_VALLEY_CAMS,
  snowbasin: SNOWBASIN_CAMS,
} as const satisfies Record<ResortId, readonly CamDef[]>;

export const CAMS = [
  ...ALTA_CAMS,
  ...SNOWBIRD_CAMS,
  ...BRIGHTON_CAMS,
  ...SOLITUDE_CAMS,
  ...DEER_VALLEY_CAMS,
  ...SNOWBASIN_CAMS,
  ...UDOT_CAMS,
] as const satisfies readonly CamDef[];

/** Every registered cam id, so references to cams are checked at compile time. */
export type CamId = (typeof CAMS)[number]['id'];

/** StakeRow and TV-wall order (5–6 tiles; brighton-snowstake-skiutah is omitted while hiddenUntilFresh). */
export const STAKE_ORDER = [
  'alta-collins-stake',
  'snowbird-snowstake',
  'solitude-snowstake',
  'deer-valley-ontario-snowstake-live',
  'snowbasin-snowstake',
  'brighton-snowstake-skiutah',
] as const satisfies readonly CamId[];

/** One hero per resort; hero fallback chains live on the CamDef (`fallback`). */
export const HEROES = {
  alta: 'alta-mount-baldy',
  snowbird: 'snowbird-hidden-peak',
  brighton: 'brighton-top-of-crest',
  solitude: 'solitude-powderhorn',
  'deer-valley': 'deer-valley-sterling',
  snowbasin: 'snowbasin-needles',
} as const satisfies Record<ResortId, CamId>;
