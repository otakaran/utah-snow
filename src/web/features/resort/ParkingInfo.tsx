// Resort page `info` section (spec §8.7.8): lift hours (C.8), parking rules for today and tomorrow (§4.7 via
// parkingCal; before the trip also its first day), booking windows, and the resort's attribution.

import { RESORT_CAMS } from '../../../../config/cams/index.ts';
import { TRIP } from '../../../../config/ikon.ts';
import { PARKING, type ParkingRule } from '../../../../config/parking.ts';
import { RESORTS } from '../../../../config/resorts.ts';
import { type ParkingDay, parkingCal } from '../../../shared/parking.ts';
import { addDays, formatLocalDate } from '../../../shared/time.ts';
import type { ResortId } from '../../../shared/types.ts';
import { Section } from '../../ui/Section.tsx';
import { StatusChip } from '../../ui/StatusChip.tsx';
import type { StatusWord } from '../../ui/status.ts';
import { bookLabel, hoursLines, hoursSource } from './resort-model.ts';

function parkingStatus(p: ParkingDay): StatusWord {
  if (p.liftReservation) return { tone: 'warn', word: 'Lift reservation' };
  if (p.required) return { tone: 'warn', word: 'Reservation required' };
  return { tone: 'ok', word: p.busy ? 'No reservation · busy' : 'No reservation' };
}

function ParkingCard({ label, p }: { label: string; p: ParkingDay }) {
  const s = parkingStatus(p);
  const need = p.required || p.liftReservation;
  return (
    <div class="rs-card" data-required={need ? 'true' : 'false'}>
      <h3 class="rs-h3">
        {label} <span class="rs-dim">· {formatLocalDate(p.date, 'short')}</span>
      </h3>
      <StatusChip tone={s.tone} word={s.word} />
      <p class="rs-strong">{p.summary}</p>
      {p.notes.length > 0 ? (
        <ul class="rs-list rs-small">
          {p.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      ) : null}
      {p.book ? (
        <a class="rs-tap rs-btn rs-label" href={p.book} target="_blank" rel="noreferrer">
          {bookLabel(p)} ↗{p.cancelBy && need ? ` · cancel by ${p.cancelBy}` : ''}
        </a>
      ) : null}
    </div>
  );
}

/** The C.8 hours source in plain words (config keeps the technical note, e.g. 'live window.Alta.liftStatus'). */
function hoursFrom(id: ResortId): string {
  const src = hoursSource(id);
  const name = RESORTS[id].name;
  if (src.startsWith('live')) return `${name}'s live lift status`;
  if (src.startsWith('historic')) return `last season (${name} has not posted this season's hours yet)`;
  if (src === 'FAQ') return `the ${name} FAQ`;
  return `the ${name} website`;
}

function credits(id: ResortId): string {
  return [...new Set(RESORT_CAMS[id].map((c) => c.credit))].join(', ');
}

export function ParkingInfo({ id, today }: { id: ResortId; today: string }) {
  const def = RESORTS[id];
  const rule: ParkingRule = PARKING[id];
  const days = [
    { label: 'Today', p: parkingCal(id, today) },
    { label: 'Tomorrow', p: parkingCal(id, addDays(today, 1)) },
  ];
  if (today < addDays(TRIP.start, -1)) days.push({ label: 'Trip day 1', p: parkingCal(id, TRIP.start) });
  return (
    <Section testid="info" title="Hours, parking & sources" index="08">
      <div class="rs-card">
        <h3 class="rs-h3">Lift hours</h3>
        <ul class="rs-rows">
          {hoursLines(id).map((h) => (
            <li key={h.label}>
              <span>{h.label}</span>
              <span class="rs-num">{h.hours}</span>
              {h.note ? <span class="rs-wide rs-dim rs-small">{h.note}</span> : null}
            </li>
          ))}
        </ul>
        <p class="rs-dim rs-small">
          Hours from {hoursFrom(id)}. When the resort posts today's hours per lift, they show under Lifts.
        </p>
      </div>
      <div class="rs-park-grid">
        {days.map((d) => (
          <ParkingCard key={d.label} label={d.label} p={d.p} />
        ))}
      </div>
      {rule.releases || rule.limits ? (
        <ul class="rs-list rs-small">
          {rule.releases ? <li>Booking windows: {rule.releases}</li> : null}
          {rule.limits ? <li>Limits: {rule.limits}</li> : null}
        </ul>
      ) : null}
      <p class="rs-dim rs-small">
        Snow, lift and trail data:{' '}
        <a class="rs-tap" href={def.links.conditions} target="_blank" rel="noreferrer">
          {def.name}
        </a>
        . Cams © {credits(id)}. Forecast: NWS Salt Lake City. Avalanche: Utah Avalanche Center. Roads: UDOT.
      </p>
    </Section>
  );
}
