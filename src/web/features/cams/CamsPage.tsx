// #/cams: a sticky JumpBar (★ pick first, the other resorts, Roads), every resort gallery in canonical resort order,
// then the UDOT road cams per corridor (VMS signs first; the road's status chip in the heading). Each resort opens
// with a 2x2 stake hero tile carrying the overnight-inches plate; the pick's heading gets the ★ and a solid accent
// rule. Tiles load lazily and refresh only while on screen, so the long page costs no more than what is in view.
// Every section carries a data-testid: cams-<resort> and cams-road-<corridor>.
import { HEROES, UDOT_CAMS } from '../../../../config/cams/index.ts';
import { RESORTS } from '../../../../config/resorts.ts';
import { CORRIDORS } from '../../../../config/roads.ts';
import type { CamDef, Corridor, ResortId } from '../../../shared/types.ts';
import { fmt } from '../../../shared/units.ts';
import { camStates } from '../../data/cams.ts';
import { units } from '../../data/settings.ts';
import { serverNow, snapshot } from '../../data/snapshot.ts';
import { JumpBar, type JumpItem } from '../../ui/JumpBar.tsx';
import { Section } from '../../ui/Section.tsx';
import { StatusChip } from '../../ui/StatusChip.tsx';
import { roadView } from '../conditions/index.ts';
import { overnightOf } from '../pick-card/index.ts';
import { CamGallery, resortGallery } from './CamGallery.tsx';
import { visibleCams } from './cam-view.ts';

const RESORT_IDS = Object.keys(RESORTS) as ResortId[];
const CORRIDOR_IDS = Object.keys(CORRIDORS) as Corridor[];
const pad = (n: number): string => String(n).padStart(2, '0');
/** Section's heading id (`<testid>-title`): the JumpBar's scroll target. */
const head = (testid: string): string => `${testid}-title`;

/** A corridor's cams, VMS signs first (travel times and warnings read before the scenery). */
function roadList(c: Corridor): CamDef[] {
  const cams = UDOT_CAMS.filter((cam: CamDef) => cam.corridor === c);
  return [...cams.filter((d) => d.kind === 'udot_vms'), ...cams.filter((d) => d.kind !== 'udot_vms')];
}

function jumpItems(pick: ResortId | null): JumpItem[] {
  const order = pick ? [pick, ...RESORT_IDS.filter((id) => id !== pick)] : RESORT_IDS;
  return [
    ...order.map((id) => ({ id: head(`cams-${id}`), label: RESORTS[id].name, accent: id === pick, star: id === pick })),
    { id: head(`cams-road-${CORRIDOR_IDS[0]}`), label: 'Roads' },
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
  const u = units.value;
  return (
    <>
      <JumpBar items={jumpItems(pick)} />
      {RESORT_IDS.map((id, i) => {
        const cams = resortGallery(id);
        const n = visibleCams(cams, states, 'detail', now).length;
        const off = cams.filter((d) => states.get(d.id)?.status === 'seasonal-off').length;
        const isPick = id === pick;
        const inches = fmt('snow', overnightOf(snap, id), u);
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
                {n} cams{off > 0 ? ` · ${off} off-season` : ''} · <a href={`#/resort/${id}`}>Resort page</a>
              </>
            }
          >
            <CamGallery
              cams={cams}
              variant="detail"
              pick={pick}
              showResort={false}
              hero={HEROES[id]}
              heroOverlay={
                inches.value === '—' ? null : (
                  <span class="cam-inches">
                    <span class="cam-inches-num num">
                      {inches.value}
                      <small>{inches.unit}</small>
                    </span>
                    <span class="cam-inches-cap">Overnight</span>
                  </span>
                )
              }
            />
          </Section>
        );
      })}
      {CORRIDOR_IDS.map((c, i) => {
        const cams = roadList(c);
        const n = visibleCams(cams, states, 'detail', now).length;
        const block = snap?.roads[c];
        const v = roadView(block, now);
        const traction = !v.stale && block?.data?.tractionLaw === true && block.data.state !== 'traction';
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
