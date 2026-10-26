// The #/weather page (concept B "Storm Timeline"): head, the NWS alerts strip, the sticky resort + section jump
// row, then 01 This week (six lanes), 02 the shown resort's 8-day outlook and 03 its next 48 hours (side by side
// from 1100 px), 04 the NWS discussion, and links on. `resort` comes from ?r=; without it the page shows the crew
// pick, latched once known so a recomputed pick never swaps the page under the reader (RESORT_IDS[0] until then).
import { useEffect, useRef, useState } from 'preact/hooks';
import { RESORT_IDS, RESORTS } from '../../../../config/resorts.ts';
import { localDate } from '../../../shared/time.ts';
import type { ResortId } from '../../../shared/types.ts';
import { openMeteo, openMeteoRetryAt, openMeteoStatus, startOpenMeteo } from '../../data/open-meteo.ts';
import { units } from '../../data/settings.ts';
import { serverNow, snapshot } from '../../data/snapshot.ts';
import { resortHref } from '../../router.ts';
import { weekDates, weekRows } from '../conditions/index.ts';
import { crewPick } from '../pick-card/index.ts';
import { AlertsStrip } from './AlertsStrip.tsx';
import { alertsView } from './alerts-view.ts';
import { DiscussionPanel } from './DiscussionPanel.tsx';
import { HourlyPanel } from './HourlyPanel.tsx';
import { OutlookPanel } from './OutlookPanel.tsx';
import { WeatherJump } from './WeatherJump.tsx';
import { WeekPanel } from './WeekPanel.tsx';

const toOutlook = () => document.getElementById('outlook')?.scrollIntoView({ block: 'start' });

export function WeatherPage({ resort }: { resort: ResortId | null }) {
  useEffect(() => startOpenMeteo(), []);
  const pick = crewPick.value?.pick ?? null;
  const [latched, setLatched] = useState<ResortId | null>(() => crewPick.peek()?.pick ?? null);
  useEffect(() => {
    if (latched === null && pick !== null) setLatched(pick);
  }, [latched, pick]);
  const id = resort ?? latched ?? RESORT_IDS[0];

  // A lane name opens that resort's outlook: scroll there once the new resort has rendered.
  const pending = useRef(false);
  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    toOutlook();
  }, [id]);
  const onPick = (r: ResortId) => {
    if (r === id) toOutlook();
    else pending.current = true;
  };

  const snap = snapshot.value;
  const now = serverNow.value;
  const u = units.value;
  const om = openMeteo.value;
  const today = localDate(now);
  const rows = weekRows(snap?.forecast, weekDates(today, 7), u, om?.data);
  const alerts = alertsView(snap?.alerts?.data, now);
  return (
    <article class="wx" data-testid="weather" data-resort={id} aria-labelledby="weather-title">
      <header class="wx-top">
        <h1 id="weather-title" class="page-title">
          Weather
        </h1>
        <p class="wx-sub">NWS Salt Lake City point forecasts, base and summit · hourly models by Open-Meteo</p>
      </header>
      <AlertsStrip alerts={alerts} />
      <WeatherJump id={id} pick={pick} />
      <WeekPanel rows={rows} snap={snap} today={today} now={now} pick={pick} onPick={onPick} />
      <div class="wx-pair">
        <OutlookPanel id={id} snap={snap} today={today} now={now} units={u} om={om} />
        <HourlyPanel
          id={id}
          now={now}
          units={u}
          om={om}
          status={openMeteoStatus.value}
          retryAt={openMeteoRetryAt.value}
        />
      </div>
      <DiscussionPanel id={id} snap={snap} now={now} alerts={alerts} />
      <p class="wx-foot">
        <a class="wx-link" href={resortHref(id)}>
          {RESORTS[id].name} resort page →
        </a>
        <a class="wx-link" href="#/cams">
          Cams →
        </a>
      </p>
    </article>
  );
}
