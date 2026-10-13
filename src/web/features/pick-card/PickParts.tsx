// Pick card pieces below the hero (spec §8.2): reasons (the crew day-cost line expands per member), divergences,
// the top-3 alternatives with one reason each, and booking action links.
import { RESORTS } from '../../../../config/resorts.ts';
import type { PickResult } from '../../../shared/types.ts';
import { fmt, type Units } from '../../../shared/units.ts';
import { snapshot } from '../../data/snapshot.ts';
import { skiDays } from '../../data/tracker.ts';
import { altReason, isDayCost, memberCosts } from './labels.ts';
import { overnightOf } from './snow-values.ts';

const MINUS = /\([−-]\d/;

function DayCostReason({ r, text }: { r: PickResult; text: string }) {
  const cost = r.ranked.find((x) => x.resort === r.pick)?.dayCost;
  const rows =
    cost && r.members.length > 1 ? memberCosts(r.members, skiDays.value, cost.group, r.date, cost.spends) : [];
  if (rows.length === 0) return <>{text}</>;
  return (
    <details class="pick-cost">
      <summary>{text}</summary>
      <ul>
        {rows.map((m) => (
          <li key={m.id}>
            {m.name} <span class="num">{m.before}</span> → <span class="num">{m.after}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

export function Reasons({ r }: { r: PickResult }) {
  const top = r.ranked.find((x) => x.resort === r.pick);
  // Divergences arrive as reasons too ('Eva would pick Alta (+4.4)'); the card shows them on their own line.
  const diverge = r.divergences.map((d) => `${d.name} would pick `);
  const shown = top?.reasons.filter((t) => !diverge.some((p) => t.startsWith(p))) ?? [];
  if (shown.length === 0) return null;
  return (
    <ul class="pick-reasons" data-testid="pick-reasons">
      {shown.map((text) => (
        <li key={text} class={MINUS.test(text) ? 'is-minus' : undefined}>
          <span class="pick-bullet" aria-hidden="true">
            {MINUS.test(text) ? '▲' : '◆'}
          </span>
          <span>{r.scope === 'crew' && isDayCost(text) ? <DayCostReason r={r} text={text} /> : text}</span>
        </li>
      ))}
    </ul>
  );
}

export function Divergences({ r }: { r: PickResult }) {
  if (r.divergences.length === 0) return null;
  return (
    <p class="pick-diverge">
      {r.divergences.map((d, i) => (
        <span key={d.personId}>
          {i > 0 ? ' · ' : ''}
          <b>{d.name}</b> would rather {RESORTS[d.resort].name} (+{d.gain.toFixed(1)})
        </span>
      ))}
    </p>
  );
}

export function Alternatives({ r, units }: { r: PickResult; units: Units }) {
  const alts = r.ranked.filter((x) => x.resort !== r.pick).slice(0, 3);
  if (alts.length === 0) return null;
  return (
    <ol class="pick-alts" aria-label="Alternatives">
      {alts.map((a) => (
        <li key={a.resort}>
          <span class="pick-alt-head">
            <b>{RESORTS[a.resort].name}</b>
            <span class="num pick-alt-in">{fmt('snow', overnightOf(snapshot.value, a.resort), units).text}</span>
            <span class="num pick-alt-net">
              {a.net.toFixed(1)}
              <small> score</small>
            </span>
          </span>
          <span class="pick-alt-why">{altReason(a.reasons)}</span>
        </li>
      ))}
    </ol>
  );
}

export function Actions({ r }: { r: PickResult }) {
  if (r.actions.length === 0) return null;
  return (
    <ul class="pick-actions">
      {r.actions.map((a) => (
        <li key={a.url}>
          <a class="pick-action" href={a.url} target="_blank" rel="noreferrer">
            {a.label} ↗
          </a>
        </li>
      ))}
    </ul>
  );
}
