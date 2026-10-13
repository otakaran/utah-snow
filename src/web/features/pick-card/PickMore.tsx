// The pick card's collapsed block (spec §8.2): crew chips (who is going today), excluded resorts with their reasons,
// and the inputs footnote (each source with its age). The summary counts what is inside, stale inputs as a chip.
import { RESORTS } from '../../../../config/resorts.ts';
import type { PickResult } from '../../../shared/types.ts';
import { people } from '../../data/tracker.ts';
import { FreshnessBadge } from '../../ui/FreshnessBadge.tsx';
import { crewIds, toggleCrew } from './prefs.ts';

function CrewChips() {
  const going = crewIds.value;
  return (
    <>
      <h3 class="pick-more-h">Going today</h3>
      <div class="pick-crew">
        {people.value.map((p) => (
          <button
            key={p.id}
            type="button"
            class="pick-chip"
            aria-pressed={going.includes(p.id)}
            onClick={() => toggleCrew(p.id)}
          >
            <span aria-hidden="true">{going.includes(p.id) ? '✓' : '+'}</span> {p.name}
            {p.mode === 'board' ? ' · board' : ''}
          </button>
        ))}
      </div>
    </>
  );
}

export function PickMore({ r }: { r: PickResult }) {
  const stale = r.inputs.filter((i) => i.status === 'amber' || i.status === 'red').length;
  const showCrew = r.scope === 'crew' && people.value.length > 0;
  const parts = [
    showCrew ? `Crew ${crewIds.value.length}` : null,
    r.excluded.length > 0 ? `${r.excluded.length} excluded` : null,
    'inputs',
  ].filter(Boolean);
  return (
    <details class="pick-more">
      <summary class="disclosure">
        <span>{parts.join(' · ')}</span>
        {stale > 0 ? (
          <span class="pick-stale">
            <span aria-hidden="true">◌</span> {stale} stale
          </span>
        ) : null}
      </summary>
      <div class="pick-more-body">
        {showCrew ? <CrewChips /> : null}
        {r.excluded.length > 0 ? (
          <>
            <h3 class="pick-more-h">Excluded</h3>
            <ul>
              {r.excluded.map((x) => (
                <li key={x.resort}>
                  <b>{RESORTS[x.resort].name}</b> – {x.reasons.join('; ')}
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <h3 class="pick-more-h">Inputs</h3>
        {r.inputs.length === 0 ? (
          <p>Sources not reported yet.</p>
        ) : (
          <ul class="pick-inputs">
            {r.inputs.map((i) => (
              <li key={i.source}>
                <span>{i.source}</span>
                <FreshnessBadge badge={i.status} age={i.ageMin} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
