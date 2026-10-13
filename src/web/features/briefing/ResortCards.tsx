// The `resorts` section (spec §8.2): six ResortCards in the fixed order alta, snowbird, brighton, solitude,
// deer-valley, snowbasin. Never re-sorted by score; the crew pick only gets the outline.
import type { ComponentChildren } from 'preact';
import { RESORT_IDS } from '../../../../config/resorts.ts';
import { localDate } from '../../../shared/time.ts';
import type { ResortId } from '../../../shared/types.ts';
import { me as meSetting, units } from '../../data/settings.ts';
import { serverNow, snapshot } from '../../data/snapshot.ts';
import { people, skiDays } from '../../data/tracker.ts';
import { Section } from '../../ui/Section.tsx';
import { crewIds, crewPick, drive } from '../pick-card/index.ts';
import { ResortCard } from './ResortCard.tsx';
import { daysLeftText, driveText } from './resort-facts.ts';

export function ResortCards({ hero }: { hero: (id: ResortId, isPick: boolean) => ComponentChildren }) {
  const snap = snapshot.value;
  const now = serverNow.value;
  const u = units.value;
  const pick = crewPick.value;
  const d = drive.value;
  const crew = crewIds.value;
  const meId = people.value.some((p) => p.id === meSetting.value) ? meSetting.value : null;
  const date = pick?.date ?? localDate(now);
  return (
    <Section testid="resorts" index="03" title="Resorts" sub="fixed order">
      <div class="rc-list">
        {RESORT_IDS.map((id) => {
          const isPick = pick?.pick === id;
          return (
            <ResortCard
              key={id}
              id={id}
              block={snap?.resorts?.[id]}
              now={now}
              units={u}
              isPick={isPick}
              date={date}
              drive={driveText(d.min[id], d.live[id], d.approx)}
              daysLeft={daysLeftText(id, skiDays.value, crew, meId)}
              hero={hero(id, isPick)}
            />
          );
        })}
      </div>
    </Section>
  );
}
