// roads -> roads:{lcc,bcc,parleys,snowbasin} (spec §5.4, §5.6, Appendix B udot-wp / udot-list / udot-api).
// Keyless by default: the three UDOT WordPress feeds plus /List/GetData. With UDOT_API_KEY (ctx.keyed.udot) the
// RoadConditions/MountainPasses/MessageSigns lists come from api/v2 instead; traffic stays on the keyless searches
// with api `event` as their fallback. Resort cross-checks: Snowbird roads/parking/alerts and Brighton
// reportpal-roads are fetched here; Alta, Brighton comments and Deer Valley come from their last-good rows (`reads`).
import { CORRIDORS } from '../../../config/roads.ts';
import type { Corridor } from '../../shared/types.ts';
import { RESORT_ROWS } from './roads/cross.ts';
import { BRIGHTON_ROADS, fetchRoads, roadsBudget, wpUrl } from './roads/fetch.ts';
import { parseRoads, rowId } from './roads/parse.ts';
import type { RoadsRaw } from './roads/raw.ts';
import { listUrl } from './roads/udot-list.ts';
import type { Source } from './types.ts';

export type { RoadsRaw } from './roads/raw.ts';

const wpProbe = (c: Corridor): string => wpUrl(CORRIDORS[c].wpSite).replace('per_page=50', 'per_page=1');

export const roads: Source<RoadsRaw> & { reads: readonly string[] } = {
  id: 'roads',
  staleAfterMin: 25,
  rows: (Object.keys(CORRIDORS) as Corridor[]).map(rowId),
  reads: RESORT_ROWS, // the dispatcher must load these last-good rows into ctx.prev (see the integration notes)
  maxSubrequests: roadsBudget,
  probes: [
    { hostId: 'udot-wp-cc', url: wpProbe('lcc') },
    { hostId: 'udot-wp-wb', url: wpProbe('parleys') },
    { hostId: 'udot-wp-ov', url: wpProbe('snowbasin') },
    { hostId: 'udot-list', url: listUrl('MountainPasses', 0, '', 1) },
    { hostId: 'snowbird-roads', url: 'https://api.snowbird.com/api/v1/dor/drupal/roads' },
    { hostId: 'brighton-roads', url: BRIGHTON_ROADS },
  ],
  fetch: fetchRoads,
  parse: parseRoads,
};
