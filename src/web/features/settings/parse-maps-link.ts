// [Paste Google Maps link] (spec §8.5): coordinates from a full Google Maps URL, trying MAPS_LINK_RES in order (place
// pin !3d…!4d…, map center @lat,lon, then ?q= / ll=). No geocoder and no network: a short maps.app.goo.gl link
// redirects server-side, which the browser cannot follow for us, so it gets a hint instead.
import { MAPS_LINK_RES } from '../../../../config/bases.ts';

export type MapsLink = { lat: number; lon: number } | { error: string };

export const SHORT_LINK_HINT = 'Open the link, then copy the full URL from the address bar';
export const NO_COORDS = 'No coordinates in that link';
const SHORT_RE = /^(?:https?:\/\/)?(?:maps\.app\.goo\.gl|goo\.gl\/maps)\//i;

function decoded(s: string): string {
  try {
    return decodeURIComponent(s); // ?q=40.6%2C-111.8
  } catch {
    return s;
  }
}

/** The first coordinate pair in a Google Maps link, or the error line to show. */
export function parseMapsLink(text: string): MapsLink {
  const s = decoded(text.trim());
  if (SHORT_RE.test(s)) return { error: SHORT_LINK_HINT };
  for (const re of MAPS_LINK_RES) {
    const m = re.exec(s);
    if (m) return { lat: Number(m[1]), lon: Number(m[2]) };
  }
  return { error: NO_COORDS };
}
