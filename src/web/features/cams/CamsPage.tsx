// #/cams: every resort gallery in canonical resort order, then the UDOT road cams per corridor. Tiles load lazily
// and refresh only while on screen, so the long page costs no more than what is in view. Every section carries a
// data-testid: cams-<resort> and cams-road-<corridor>.
import { UDOT_CAMS } from '../../../../config/cams/index.ts';
import { RESORTS } from '../../../../config/resorts.ts';
import { CORRIDORS } from '../../../../config/roads.ts';
import type { CamDef, Corridor, ResortId } from '../../../shared/types.ts';
import { Section } from '../../ui/Section.tsx';
import { CamGallery, resortGallery } from './CamGallery.tsx';

const RESORT_IDS = Object.keys(RESORTS) as ResortId[];
const CORRIDOR_IDS = Object.keys(CORRIDORS) as Corridor[];
const pad = (n: number): string => String(n).padStart(2, '0');

interface Props {
  /** The pick resort (★ on its cams). */
  pick?: ResortId | null;
}

export function CamsPage({ pick = null }: Props) {
  return (
    <>
      {RESORT_IDS.map((id, i) => {
        const cams = resortGallery(id);
        return (
          <Section
            key={id}
            testid={`cams-${id}`}
            title={RESORTS[id].name}
            index={pad(i + 1)}
            sub={`${cams.length} cams`}
          >
            <CamGallery cams={cams} variant="detail" pick={pick} />
          </Section>
        );
      })}
      {CORRIDOR_IDS.map((c, i) => {
        const cams = UDOT_CAMS.filter((cam: CamDef) => cam.corridor === c);
        return (
          <Section
            key={c}
            testid={`cams-road-${c}`}
            title={`Road · ${CORRIDORS[c].label}`}
            index={pad(RESORT_IDS.length + i + 1)}
            sub={`${cams.length} UDOT cams`}
          >
            <CamGallery cams={cams} variant="detail" />
          </Section>
        );
      })}
    </>
  );
}
