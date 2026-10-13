// UDOT Cctv road cams (A.7): plain <img> only (malformed CORS headers), refreshed every 60 s; age = load time.
// RWIS cams under /AnimatedGifs/ are 0.5-1.3 MB animated GIFs that wait for a tap in data saver.
import { type KindSpec, noVars } from './kind.ts';

export const isGif = (url: string): boolean => /\.gif(?:\?|$)/i.test(url);

export const udot: KindSpec = { player: null, cadenceMin: () => 2, vars: noVars, heavy: isGif };
