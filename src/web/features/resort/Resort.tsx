// Resort detail page (#/resort/:id, spec §8.7). A sticky jump row (the six resorts as #/resort/:id links, the
// current one in accent, ★ on the pick; then buttons to each section heading), then the sections in spec order, each
// root with its data-testid: head, cams, snow, lifts, weather, roads, avalanche, info. Unknown ids never get here
// (router.ts redirects to #/).
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
import { JumpBar } from '../../ui/JumpBar.tsx';
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

/** Jump targets: each section's heading id (ui/Section.tsx `<testid>-title`). */
const SECTIONS = [
  { id: 'cams-title', label: 'Cams' },
  { id: 'snow-title', label: 'Snow' },
  { id: 'lifts-title', label: 'Lifts' },
  { id: 'weather-title', label: 'Weather' },
  { id: 'roads-title', label: 'Roads' },
  { id: 'avalanche-title', label: 'Avy' },
  { id: 'info-title', label: 'Parking' },
];

function ResortJump({ id, pick }: { id: ResortId; pick: ResortId | null }) {
  return (
    <div class="jumpbar jumpbar-sticky rs-jump">
      <nav class="rs-jump-resorts" aria-label="Resorts">
        {RESORT_IDS.map((r) => (
          <a
            key={r}
            href={`#/resort/${r}`}
            class={r === id ? 'jump jump-accent' : 'jump'}
            aria-current={r === id ? 'page' : undefined}
          >
            {r === pick ? (
              <>
                <span class="jump-star" aria-hidden="true">
                  ★
                </span>
                <span class="sr-only">Today's pick: </span>
              </>
            ) : null}
            {RESORTS[r].name}
          </a>
        ))}
      </nav>
      <JumpBar items={SECTIONS} sticky={false} />
    </div>
  );
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
