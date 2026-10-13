// Save thresholds (spec §9.5, §10): for each capped group, the days left (crew minimum, then each person; "I am"
// is marked), today's save-threshold (spend a day only on at least this much snow) and the first use-it-or-lose-it date.
// Values come from the pick engine through the pick-card feature.
import { CAP_GROUPS } from '../../../../config/ikon.ts';
import { GROUP_IDS } from '../../../shared/caps.ts';
import { formatLocalDate } from '../../../shared/time.ts';
import type { GroupThreshold, PickResult } from '../../../shared/types.ts';
import { units } from '../../data/settings.ts';
import { qty } from '../../lib/format.ts';
import { crewPick, me, personPicks } from '../pick-card/index.ts';

const CAPPED = GROUP_IDS.filter((g) => CAP_GROUPS[g].cap !== null);

function thresholdText(t: GroupThreshold | undefined): string {
  if (!t) return '—';
  if (t.remaining === 0) return 'none left';
  return t.threshold <= 0 ? 'free: use it' : `≥ ${qty('snow', t.threshold, units.value)}`;
}

function Row({ id, who, pick }: { id: string; who: string; pick: PickResult }) {
  return (
    <tr data-person={id}>
      <th scope="row">{who}</th>
      {CAPPED.map((g) => {
        const t = pick.thresholds[g];
        return (
          <td key={g} data-group={g}>
            <span class="trk-th-left num">{t?.remaining ?? '—'} left</span>
            <span class="trk-th-snow">{thresholdText(t)}</span>
            {t?.expiringFrom ? (
              <span class="trk-th-exp">use-it-or-lose-it from {formatLocalDate(t.expiringFrom, 'md')}</span>
            ) : null}
          </td>
        );
      })}
    </tr>
  );
}

export function Thresholds() {
  const crew = crewPick.value;
  const selfId = me.value?.id;
  if (!crew) return <p class="field-note">Thresholds appear once today's conditions have loaded.</p>;
  return (
    <div class="trk-table-wrap">
      <table class="trk-table trk-thresholds" data-testid="tracker-threshold-table">
        <thead>
          <tr>
            <th scope="col">For</th>
            {CAPPED.map((g) => (
              <th scope="col" key={g}>
                {CAP_GROUPS[g].label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <Row id="crew" who="Crew" pick={crew} />
          {personPicks.value.map(({ id, name, pick }) =>
            pick ? <Row key={id} id={id} who={id === selfId ? `${name} (me)` : name} pick={pick} /> : null,
          )}
        </tbody>
      </table>
      <p class="field-note">Spend a capped day only when the snow reaches its threshold; Solitude is never capped.</p>
    </div>
  );
}
