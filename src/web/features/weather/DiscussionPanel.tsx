// §04 "NWS discussion & alerts": the AFD key messages (open), each active alert's headline with its span and
// resorts, the NWS point forecast pages for the shown resort's summit and base, and the Open-Meteo credit.
import { RESORTS } from '../../../../config/resorts.ts';
import type { ResortId, Snapshot } from '../../../shared/types.ts';
import { Section } from '../../ui/Section.tsx';
import { AfdNotes, afdBullets, SourceLine, worstMeta } from '../conditions/index.ts';
import type { AlertView } from './alerts-view.ts';

interface Props {
  id: ResortId;
  snap: Snapshot | null;
  now: number;
  alerts: readonly AlertView[];
}

const external = { target: '_blank', rel: 'noreferrer' } as const;

const pointUrl = (p: { lat: number; lon: number }): string =>
  `https://forecast.weather.gov/MapClick.php?lat=${p.lat}&lon=${p.lon}`;

function KeyMessages({ snap, now }: { snap: Snapshot | null; now: number }) {
  const afd = snap?.afd?.data;
  if (!snap) return <p class="wx-empty">Loading forecast…</p>;
  if (afdBullets(afd?.keyMessages).length > 0) return <AfdNotes now={now} open />;
  return (
    <p class="wx-empty">
      No key messages in the latest NWS discussion.
      {typeof afd?.url === 'string' ? (
        <>
          {' '}
          <a class="wx-link" href={afd.url} {...external}>
            Full NWS discussion ↗
          </a>
        </>
      ) : null}
    </p>
  );
}

export function DiscussionPanel({ id, snap, now, alerts }: Props) {
  const r = RESORTS[id];
  const sub = <SourceLine source="NWS AFD" fresh={worstMeta([snap?.afd?.meta], now)} />;
  return (
    <Section testid="discussion" title="NWS discussion & alerts" index="04" sub={sub}>
      <div class="wx-card wx-disc">
        <KeyMessages snap={snap} now={now} />
        {alerts.map((a) => (
          <div key={a.key} class="wx-alert-more">
            <p class="wx-kicker">
              {a.event}
              {a.when ? ` · ${a.when}` : ''}
            </p>
            <p>{a.headline}</p>
            <p class="wx-dim">{a.tags.join(' · ')}</p>
          </div>
        ))}
        <p class="wx-links">
          <a class="wx-link" href={pointUrl(r.summit)} {...external}>
            NWS point forecast · {r.name} summit ↗
          </a>
          <a class="wx-link" href={pointUrl(r.base)} {...external}>
            {r.name} base ↗
          </a>
        </p>
        <p class="wx-note">
          Hourly models: weather data by{' '}
          <a href="https://open-meteo.com/" {...external}>
            Open-Meteo.com
          </a>{' '}
          (CC BY 4.0).
        </p>
      </div>
    </Section>
  );
}
