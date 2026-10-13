// The resort page's two cam galleries (spec §8.7.2, §8.7.6), both from the cams feature: every Appendix A cam of the
// resort (registry order, stakes first) and, inside the roads rows, the road cams of each corridor on the way.
// CamGallery owns tiles, live players, timelapse, Rewind, the pick ★ and the offline/alternate gating of UDOT cams.
import { RESORT_CAMS, UDOT_CAMS } from '../../../../config/cams/index.ts';
import { RESORTS } from '../../../../config/resorts.ts';
import { RESORT_ROAD_CAMS } from '../../../../config/roads.ts';
import type { CamDef, Corridor, ResortId } from '../../../shared/types.ts';
import { Section } from '../../ui/Section.tsx';
import { CAM_BY_ID, CamGallery } from '../cams/index.ts';

/** Road cams for one corridor of the route: the resort's RESORT_ROAD_CAMS list, else every cam of that corridor. */
export function roadCams(id: ResortId, c: Corridor): CamDef[] {
  if (c !== RESORTS[id].corridor) return UDOT_CAMS.filter((cam: CamDef) => cam.corridor === c);
  const ids: readonly string[] = RESORT_ROAD_CAMS[id];
  return ids.flatMap((camId) => CAM_BY_ID.get(camId) ?? []);
}

export function ResortCams({ id, pick }: { id: ResortId; pick: ResortId | null }) {
  const n = RESORT_CAMS[id].length;
  return (
    <Section testid="cams" title="Cams" index="02" sub={`${n} cams · tap a tile for live`}>
      <CamGallery resort={id} variant="detail" pick={pick} />
    </Section>
  );
}

export function RoadCams({ id, corridor, pick }: { id: ResortId; corridor: Corridor; pick: ResortId | null }) {
  return <CamGallery cams={roadCams(id, corridor)} variant="card" pick={pick} />;
}
