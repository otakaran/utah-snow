// Morning briefing (spec §8.2). Fixed order inside <main>, each section root carrying its data-testid: header, pick,
// stakes, resorts, roads, avalanche, forecast, then the system-status line; `footer` is app.tsx's <footer> right
// after <main>. Nothing autoplays here.
import { HEROES } from '../../../../config/cams/index.ts';
import { CORRIDORS } from '../../../../config/roads.ts';
import type { CamDef, Corridor } from '../../../shared/types.ts';
import { fmt } from '../../../shared/units.ts';
import { units } from '../../data/settings.ts';
import { serverNow, snapshot } from '../../data/snapshot.ts';
import { longDate, tripLine } from '../../lib/format.ts';
import { CAM_BY_ID, CamGallery, CamTile, StakeRow } from '../cams/index.ts';
import { AvalanchePanel, ForecastPanel, RoadsPanel } from '../conditions/index.ts';
import { crewPick, overnightOf, PickCard } from '../pick-card/index.ts';
import { ResortCards } from './ResortCards.tsx';
import { SystemStatus } from './SystemStatus.tsx';
import './briefing.css';

/** A corridor's ★ briefing cams (A.7), plus the VMS sign GIFs for LCC. */
function roadCams(c: Corridor): CamDef[] {
  const def = CORRIDORS[c];
  const ids: readonly string[] = [...def.briefingCams, ...('vmsCams' in def ? def.vmsCams : [])];
  return ids.flatMap((id) => CAM_BY_ID.get(id) ?? []);
}

function BriefingHeader({ now }: { now: number }) {
  return (
    <section data-testid="header" class="brief-head" aria-labelledby="briefing-title">
      <h1 id="briefing-title">Morning briefing</h1>
      <p>
        {longDate(now)} · {tripLine(now)}
      </p>
    </section>
  );
}

export function Briefing() {
  const u = units.value;
  const snap = snapshot.value;
  const pick = crewPick.value?.pick ?? null;
  const stakeInches = (cam: CamDef) => {
    const q = cam.resort ? fmt('snow', overnightOf(snap, cam.resort), u) : null;
    return q && q.value !== '—' ? (
      <span class="brief-stake-in num">
        {q.value}
        <small>{q.unit}</small>
      </span>
    ) : null;
  };
  return (
    <>
      <BriefingHeader now={serverNow.value} />
      <PickCard />
      <StakeRow pick={pick} no="02" overlay={stakeInches} />
      <ResortCards hero={(id, isPick) => <CamTile id={HEROES[id]} variant="card" star={isPick} />} />
      <RoadsPanel units={u} no="04" cams={(c) => <CamGallery cams={roadCams(c)} variant="card" pick={pick} />} />
      <AvalanchePanel no="05" />
      <ForecastPanel units={u} no="06" />
      <SystemStatus />
    </>
  );
}
