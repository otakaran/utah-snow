// "I am: [select ▾] · skip" (spec §8.5). Shown in the header while utahsnow.me is unset (or names a person who
// is no longer in the tracker) and the tracker has people; also while the tracker is still loading and me is unset,
// so the chip holds its header slot from the first paint (iam-state.ts). Choosing sets `me`; skip stores '' (crew
// only). The select always reads "choose…", so CSS fixes its width instead of letting it follow the names.
import { me, setMe } from '../../data/settings.ts';
import { people, trackerStatus } from '../../data/tracker.ts';
import { iamState } from './iam-state.ts';
import './settings.css';

export function IAmChip() {
  const list = people.value;
  const state = iamState(list, me.value, trackerStatus.value !== 'idle');
  if (state === 'hide') return null;
  return (
    <div class="iam-chip" data-testid="iam-chip" data-state={state}>
      <label class="iam-label">
        <span>I am</span>
        <select
          class="iam-select"
          value=""
          disabled={state === 'wait'}
          onChange={(e) => {
            const id = e.currentTarget.value;
            if (id) setMe(id);
          }}
        >
          {/* selected: with no person options yet (the 'wait' state) nothing else would show "choose…" */}
          <option value="" disabled selected>
            choose…
          </option>
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <span class="iam-caret" aria-hidden="true">
          ▾
        </span>
      </label>
      <button type="button" class="iam-skip" onClick={() => setMe('')}>
        skip
      </button>
    </div>
  );
}
