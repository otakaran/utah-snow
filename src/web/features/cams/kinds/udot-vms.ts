// UDOT variable message signs (3 animated GIFs on LCC): plain <img> only, tap-to-load in data saver.
import { type KindSpec, noVars } from './kind.ts';
import { isGif } from './udot.ts';

export const udotVms: KindSpec = { player: null, cadenceMin: () => 2, vars: noVars, heavy: isGif };
