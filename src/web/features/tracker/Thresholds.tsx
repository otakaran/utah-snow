// Save thresholds (spec §9.5, §10): for each capped group, the days left (crew minimum, and mine when "I am" is
// set), today's save-threshold (spend a day only on at least this much snow) and the first use-it-or-lose-it date.
// Values come from the pick engine through the pick-card feature.
import { CAP_GROUPS } from '../../../../config/ikon.ts';
import { GROUP_IDS } from '../../../shared/caps.ts';
import { formatLocalDate } from '../../../shared/time.ts';
import type { GroupThreshold, PickResult } from '../../../shared/types.ts';
import { units } from '../../data/settings.ts';
import { qty } from '../../lib/format.ts';
import { crewPick, me, mePick } from '../pick-card/index.ts';

const CAPPED = GROUP_IDS.filter((g) => CAP_GROUPS[g].cap !== null);

function thresholdText(t: GroupThreshold | undefined): string {
  if (!t) return '—';
  if (t.remaining === 0) return 'none left';
  return t.threshold <= 0 ? 'free: use it' : `≥ ${qty('snow', t.threshold, units.value)}`;
}

function Row({ who, pick }: { who: string; pick: PickResult }) {
  return (
    <tr>
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
  const mine = mePick.value;
  const self = me.value;
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
          <Row who="Crew" pick={crew} />
          {mine && self ? <Row who={`${self.name} (me)`} pick={mine} /> : null}
        </tbody>
      </table>
      <p class="field-note">Spend a capped day only when the snow reaches its threshold; Solitude is never capped.</p>
    </div>
  );
}
