// #/cams: a sticky JumpBar (★ pick first, the other resorts, Roads), every resort gallery in canonical resort order,
// then the UDOT road cams per corridor (VMS signs first; the road's status chip in the heading). Each resort opens
// with a 2x2 stake hero tile carrying the overnight-inches plate; the pick's heading gets the ★ and a solid accent
// rule. Tiles load lazily and refresh only while on screen, so the long page costs no more than what is in view.
// Every section carries a data-testid (also its id, the JumpBar target): cams-<resort> and cams-road-<corridor>.
import { HEROES, UDOT_CAMS } from '../../../../config/cams/index.ts';
import { RESORTS } from '../../../../config/resorts.ts';
import { CORRIDORS } from '../../../../config/roads.ts';
import type { CamDef, Corridor, ResortId } from '../../../shared/types.ts';
import { camStates } from '../../data/cams.ts';
import { serverNow, snapshot } from '../../data/snapshot.ts';
import { JumpBar, type JumpItem } from '../../ui/JumpBar.tsx';
import { Section } from '../../ui/Section.tsx';
import { StatusChip } from '../../ui/StatusChip.tsx';
import { roadView, showTraction } from '../conditions/index.ts';
import { CamGallery, resortGallery } from './CamGallery.tsx';
import { visibleCams } from './cam-view.ts';
import { InchPlate } from './InchPlate.tsx';

const RESORT_IDS = Object.keys(RESORTS) as ResortId[];
const CORRIDOR_IDS = Object.keys(CORRIDORS) as Corridor[];
const pad = (n: number): string => String(n).padStart(2, '0');

/** A corridor's cams, VMS signs first (travel times and warnings read before the scenery). */
function roadList(c: Corridor): CamDef[] {
  const cams = UDOT_CAMS.filter((cam: CamDef) => cam.corridor === c);
  return [...cams.filter((d) => d.kind === 'udot_vms'), ...cams.filter((d) => d.kind !== 'udot_vms')];
}

function jumpItems(pick: ResortId | null): JumpItem[] {
  const order = pick ? [pick, ...RESORT_IDS.filter((id) => id !== pick)] : RESORT_IDS;
  return [
    ...order.map((id) => ({ id: `cams-${id}`, label: RESORTS[id].name, accent: id === pick, star: id === pick })),
    { id: `cams-road-${CORRIDOR_IDS[0]}`, label: 'Roads' },
  ];
}

interface Props {
  /** The pick resort (★ on its cams). */
  pick?: ResortId | null;
}

export function CamsPage({ pick = null }: Props) {
  const states = camStates.value;
  const now = serverNow.value;
  const snap = snapshot.value;
  return (
    <>
      <JumpBar items={jumpItems(pick)} />
      {RESORT_IDS.map((id, i) => {
        const cams = resortGallery(id);
        const n = visibleCams(cams, states, 'detail', now).length;
        const off = cams.filter((d) => states.get(d.id)?.status === 'seasonal-off').length;
        const isPick = id === pick;
        return (
          <Section
            key={id}
            testid={`cams-${id}`}
            title={isPick ? `★ ${RESORTS[id].name}` : RESORTS[id].name}
            index={pad(i + 1)}
            class={isPick ? 'cams-sec cams-sec-pick' : 'cams-sec'}
            sub={
              <>
                {isPick ? "Today's pick · " : ''}
                {n} cams{off > 0 ? ` · ${off} off-season` : ''} ·{' '}
                <a class="cams-sub-link" href={`#/resort/${id}`}>
                  Resort page
                </a>
              </>
            }
          >
            <CamGallery
              cams={cams}
              variant="detail"
              pick={pick}
              showResort={false}
              hero={HEROES[id]}
              heroOverlay={<InchPlate resort={id} />}
            />
          </Section>
        );
      })}
      {CORRIDOR_IDS.map((c, i) => {
        const cams = roadList(c);
        const n = visibleCams(cams, states, 'detail', now).length;
        const block = snap?.roads[c];
        const v = roadView(block, now);
        const traction = showTraction(block?.data, v.stale);
        return (
          <Section
            key={c}
            testid={`cams-road-${c}`}
            title={`Road · ${CORRIDORS[c].label}`}
            index={pad(RESORT_IDS.length + i + 1)}
            class="cams-sec"
            sub={
              <>
                <StatusChip tone={v.chip.tone} word={v.chip.word} stale={v.stale} />
                {traction ? <StatusChip tone="warn" word="Traction law" /> : null}
                <span>{n} UDOT cams</span>
              </>
            }
          >
            <CamGallery cams={cams} variant="detail" />
          </Section>
        );
      })}
    </>
  );
}
