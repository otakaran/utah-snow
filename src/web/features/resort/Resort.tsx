// Resort detail page (#/resort/:id, spec §8.7). A sticky jump row (the six resorts as #/resort/:id links, the
// current one in accent, ★ on the pick; then buttons to each section), then the sections in spec order, each root
// with its data-testid (also its id): head, cams, snow, lifts, weather, roads, avalanche, info. Unknown ids never get
// here (router.ts redirects to #/).
import { useEffect } from 'preact/hooks';
import { RESORT_IDS, RESORTS } from '../../../../config/resorts.ts';
import { badge } from '../../../shared/freshness.ts';
import { routeCorridors } from '../../../shared/geo.ts';
import { liftsRunning } from '../../../shared/lifts.ts';
import { localDate } from '../../../shared/time.ts';
import type { ResortId } from '../../../shared/types.ts';
import { baseInfo, units } from '../../data/settings.ts';
import { serverNow, snapshot } from '../../data/snapshot.ts';
import { skiDays } from '../../data/tracker.ts';
import { JumpBar, type JumpItem } from '../../ui/JumpBar.tsx';
import { AvalanchePanel, RoadsPanel } from '../conditions/index.ts';
import { crewIds, crewPick, drive, me } from '../pick-card/index.ts';
import { LiftList } from './LiftList.tsx';
import { ParkingInfo } from './ParkingInfo.tsx';
import { ResortCams, RoadCams } from './ResortCams.tsx';
import { ResortHead } from './ResortHead.tsx';
import { daysLeft, driveInfo, isStale, resortData } from './resort-model.ts';
import { SnowReport } from './SnowReport.tsx';
import { WeatherPanel } from './WeatherPanel.tsx';
import './resort.css';

/** Jump targets: the section ids (ui/Section.tsx sets id = testid). */
const SECTIONS: JumpItem[] = [
  { id: 'cams', label: 'Cams' },
  { id: 'snow', label: 'Snow' },
  { id: 'lifts', label: 'Lifts' },
  { id: 'weather', label: 'Weather' },
  { id: 'roads', label: 'Roads' },
  { id: 'avalanche', label: 'Avy' },
  { id: 'info', label: 'Parking' },
];

function ResortJump({ id, pick }: { id: ResortId; pick: ResortId | null }) {
  const resorts = RESORT_IDS.map(
    (r, i): JumpItem => ({
      id: `resort-${r}`,
      label: RESORTS[r].name,
      href: `#/resort/${r}`,
      current: r === id,
      accent: r === id,
      star: r === pick,
      rule: i === RESORT_IDS.length - 1,
    }),
  );
  return <JumpBar items={[...resorts, ...SECTIONS]} label="Resorts and sections" />;
}

export function Resort({ id }: { id: ResortId }) {
  const now = serverNow.value;
  const snap = snapshot.value;
  const u = units.value;
  const base = baseInfo.value;
  const today = localDate(now);
  const block = snap?.resorts[id];
  const r = resortData(block?.data);
  const stale = block ? isStale(badge(block.meta, now)) : false;
  const days = daysLeft(id, skiDays.value, crewIds.value, me.value?.id ?? null);
  const d = drive.value;
  const pick = crewPick.value?.pick ?? null;

  useEffect(() => {
    scrollTo(0, 0);
  }, [id]);

  return (
    <article class="rs" data-resort={id} aria-label={RESORTS[id].name}>
      <ResortJump id={id} pick={pick} />
      <ResortHead
        id={id}
        block={block}
        drive={driveInfo(base, id, d, d.live[id])}
        today={today}
        now={now}
        units={u}
        days={days}
      />
      <ResortCams id={id} pick={pick} />
      <SnowReport id={id} r={r} today={today} now={now} units={u} />
      <LiftList r={r} today={today} stale={stale} running={liftsRunning(id, r?.season, now)} />
      <WeatherPanel id={id} r={r} forecast={snap?.forecast} today={today} now={now} units={u} />
      <RoadsPanel
        units={u}
        corridors={routeCorridors(base.lon, id)}
        no="06"
        cams={(c) => <RoadCams id={id} corridor={c} pick={pick} />}
      />
      <AvalanchePanel zones={[RESORTS[id].uacZone]} no="07" />
      <ParkingInfo id={id} today={today} />
    </article>
  );
}
