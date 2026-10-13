// Resort page `weather` section (spec §8.7.5): now (ResortSnapshot.weather), the NWS 3-day forecast for base and
// summit, the NWS text forecast for the summit grid, then the Open-Meteo ModelTable (HRRR/NBM/ECMWF/GFS).
import type { ResortId, ResortSnapshot, Snapshot, WeatherNow } from '../../../shared/types.ts';
import type { Units } from '../../../shared/units.ts';
import { clockRel, qty } from '../../lib/format.ts';
import { Section } from '../../ui/Section.tsx';
import { ModelTable } from '../conditions/index.ts';
import { Amount, Tile } from './Amount.tsx';
import { NwsDays } from './NwsDays.tsx';
import { NwsText } from './NwsText.tsx';

interface Props {
  id: ResortId;
  r: ResortSnapshot | null;
  forecast: Snapshot['forecast'] | undefined;
  today: string;
  now: number;
  units: Units;
}

function Now({ w, now, units }: { w: WeatherNow; now: number; units: Units }) {
  const temps = [
    { label: 'Base', v: w.baseTempF },
    { label: 'Mid', v: w.midTempF },
    { label: 'Summit', v: w.summitTempF },
  ].filter((t) => t.label !== 'Mid' || t.v !== null);
  return (
    <div class="rs-card">
      <h3 class="rs-h3">
        Now <span class="rs-dim">· observed {clockRel(w.obsAt, now)}</span>
      </h3>
      <dl class="rs-tiles rs-cols-4">
        {temps.map((t) => (
          <Tile key={t.label} label={t.label}>
            <Amount kind="temp" value={t.v} units={units} />
          </Tile>
        ))}
        <Tile label={`Summit wind${w.windDir ? ` ${w.windDir}` : ''}`}>
          <Amount kind="wind" value={w.summitWindMph} units={units} />
          {w.summitGustMph !== null ? (
            <span class="rs-dim rs-small"> gust {qty('wind', w.summitGustMph, units)}</span>
          ) : null}
        </Tile>
      </dl>
      {w.sky ? <p>{w.sky}</p> : null}
      <p class="rs-dim rs-small">Source: {w.src}</p>
    </div>
  );
}

export function WeatherPanel({ id, r, forecast, today, now, units }: Props) {
  const base = forecast?.[`${id}:base`];
  const summit = forecast?.[`${id}:summit`];
  return (
    <Section testid="weather" title="Weather" index="05" sub="NWS Salt Lake City">
      {r ? <Now w={r.weather} now={now} units={units} /> : <p class="rs-dim">No observations yet.</p>}
      <NwsDays label="summit" block={summit} today={today} now={now} units={units} />
      <NwsDays label="base" block={base} today={today} now={now} units={units} />
      <NwsText id={id} now={now} />
      <ModelTable id={id} today={today} now={now} units={units} />
    </Section>
  );
}
