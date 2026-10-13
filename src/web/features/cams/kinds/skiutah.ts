// Ski Utah stills (stake stills, Apex Sunrise): plain <img> only, `_ts={s}` busts caches (never `_=`, which 404s).
// About every 15 min. Age: cams:status asOf (Last-Modified) or the stake archive's newest frame.
import { type KindSpec, noVars, refreshCadence } from './kind.ts';

export const skiutah: KindSpec = { player: null, cadenceMin: refreshCadence, vars: noVars };
