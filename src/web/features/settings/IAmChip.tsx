// "I am: [select ▾] · skip" (spec §8.5). Shown in the header while utahsnow.me is unset (or names a person who
// is no longer in the tracker) and the tracker has people. Choosing sets `me`; skip stores '' (crew only).
import { me, setMe } from '../../data/settings.ts';
import { type Person, people } from '../../data/tracker.ts';
import './settings.css';

/** True when `me` should be asked: unset, or set to someone not in `list` ('' = skipped, never asked). */
export function needsMe(list: readonly Pick<Person, 'id'>[], id: string | null): boolean {
  if (list.length === 0 || id === '') return false;
  return id === null || !list.some((p) => p.id === id);
}

export function IAmChip() {
  const list = people.value;
  if (!needsMe(list, me.value)) return null;
  return (
    <div class="iam-chip" data-testid="iam-chip">
      <label class="iam-label">
        <span>I am</span>
        <select
          class="iam-select"
          value=""
          onChange={(e) => {
            const id = e.currentTarget.value;
            if (id) setMe(id);
          }}
        >
          <option value="" disabled>
            choose…
          </option>
          {list.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <button type="button" class="iam-skip" onClick={() => setMe('')}>
        skip
      </button>
    </div>
  );
}
