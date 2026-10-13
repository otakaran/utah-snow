// Roundshot 360 (Snowbird Hidden Peak 360): a 2324x450 strip as the still; a tap opens the provider's own 360
// viewer as an iframe (CamDef live.url, https://snowbird.roundshot.com/tv/). Frames every 10 min in daylight.
import { type KindSpec, noVars } from './kind.ts';

export const roundshot360: KindSpec = { player: 'iframe', cadenceMin: () => 10, vars: noVars };
