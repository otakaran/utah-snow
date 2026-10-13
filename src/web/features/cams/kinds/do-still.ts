// Alta DigitalOcean stills (A.1). Plain <img> only: the bucket sends no ACAO, so never crossorigin, fetch or canvas.
// Age: cams:status asOf (HEAD Last-Modified); Collins comes from the stake-alta archive.
import { type KindSpec, noVars, refreshCadence } from './kind.ts';

export const doStill: KindSpec = { player: null, cadenceMin: refreshCadence, vars: noVars };
