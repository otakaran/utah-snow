// Roundshot stills (Snowbird Hidden Peak, Powder Paradise): backend.roundshot.com redirects to the newest frame;
// daylight frames every 10 min. Age: cams:status asOf from the redirect Location.
import { type KindSpec, noVars } from './kind.ts';

export const roundshot: KindSpec = { player: null, cadenceMin: () => 10, vars: noVars };
