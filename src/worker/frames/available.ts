// Whether a provider timelapse can be listed now (spec §6.3, §6.4), for /api/cams `timelapse.available` and the
// /api/stake/:id/frames 404. Inputs: the cam's cams:status entry (hourly). Archive cams are decided by their
// stake_frames index instead (api/cams/state.ts, frames/archive.ts).
// - hdrelay: gated archives only while the hourly frames/info check enabled them; active ones unless it disabled them.
// - prism: unless cam_init last listed no images. roundshot: unless the cam is known offline.
import type { CamDef, CamStatusEntry } from '../../shared/types.ts';
import { hdrelayArchive } from './hdrelay.ts';

export function providerAvailable(def: CamDef, entry: CamStatusEntry | undefined): boolean {
  const enabled = entry?.archive?.enabled;
  switch (def.timelapse.provider) {
    case 'hdrelay': {
      const archive = hdrelayArchive(def.id);
      if (!archive) return false;
      return archive.gated ? enabled === true : enabled !== false;
    }
    case 'prism':
      return enabled !== false;
    case 'roundshot':
      return entry?.online !== false;
    default:
      return false;
  }
}
