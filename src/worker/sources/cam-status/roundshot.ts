// Roundshot cams (kinds roundshot and roundshot360; one parser serves both): GET the backend still with redirects
// off and read the Location, whose `/{YYYY-MM-DD}/{HH-MM}-00/` is America/Denver wall time (spec §6.4).
// Captures run 07:10 to about dusk, so a night-time asOf is old by design: /api/cams exempts these kinds at night.
import { CAMS } from '../../../../config/cams/index.ts';
import { DAY, HOUR, isoUtc, zonedToUtc } from '../../../shared/time.ts';
import type { CamDef } from '../../../shared/types.ts';
import { stillBase } from './probe.ts';
import type { KindCheck } from './types.ts';

const SLOT_RE = /\/(\d{4}-\d{2}-\d{2})\/(\d{2})-(\d{2})-\d{2}\//;
const MAX_AGE_MS = 30 * DAY;

const CAMS_RS = (CAMS as readonly CamDef[]).filter((c) => c.kind === 'roundshot' || c.kind === 'roundshot360');

/** Location -> epoch ms of the capture, or null. */
export function slotMs(location: string | undefined): number | null {
  const m = location ? SLOT_RE.exec(location) : null;
  return m ? zonedToUtc(`${m[1]} ${m[2]}:${m[3]}`) : null;
}

export const roundshot: KindCheck = {
  name: 'roundshot',
  // The card size (optional / medium); never HEAD-probe slot URLs.
  requests: () =>
    CAMS_RS.map((c) => ({ key: `roundshot:${c.id}`, url: stillBase(c.still.card), method: 'GET', json: false })),
  read(id, probe, { now }) {
    if (probe.status >= 300 && probe.status < 400) {
      const t = slotMs(probe.location);
      return t !== null && t <= now + HOUR && t >= now - MAX_AGE_MS
        ? { [id]: { online: true, asOf: isoUtc(t) } }
        : null;
    }
    if (probe.status === 404) return { [id]: { online: false } };
    return null;
  },
};
