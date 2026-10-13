// Prism stills (Alta 65/88, Snowbasin 54/115): root 360/1080.jpg objects with ?t={m} (they send max-age=3600).
// Age: cams:status asOf from cam_init current.time. Timelapse (24 h frames + MP4): features/cams/Scrubber.tsx.
import { type KindSpec, noVars, refreshCadence } from './kind.ts';

export const prism: KindSpec = { player: null, cadenceMin: refreshCadence, vars: noVars };
