// Settings "I am" (spec §8.5 item 2): which tracker person this phone belongs to, and how this device rides. Once a
// tracker person is chosen, their tracker ski/board mode is used, so it shows read-only with a link to the Tracker.
import type { SkiMode } from '../../../shared/types.ts';
import { me, ride, setMe, setRide } from '../../data/settings.ts';
import { people } from '../../data/tracker.ts';
import { Toggle } from '../../ui/Toggle.tsx';

const MODE: Record<SkiMode, string> = { ski: 'Skier', board: 'Snowboarder', unknown: 'Not set' };

export function WhoAmI() {
  const id = me.value;
  const list = people.value;
  const person = list.find((p) => p.id === id);
  return (
    <div class="stack">
      {list.length === 0 ? (
        <p class="field-note">No crew yet. Add people on the Tracker page, then pick yourself here.</p>
      ) : (
        <label class="field">
          <span class="field-label">This phone belongs to</span>
          <select
            value={id === null ? '' : id === '' ? '-' : id}
            onChange={(e) => {
              const v = e.currentTarget.value;
              setMe(v === '-' ? '' : v || null);
            }}
          >
            <option value="">Not set (ask me)</option>
            <option value="-">Skip (crew only)</option>
            {list.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <div class="field">
        {/* The Toggle names itself with a hidden legend; the read-only line needs this label read. */}
        <span class="field-label" aria-hidden={person ? undefined : 'true'}>
          Rides
        </span>
        {person ? (
          <p class="ride-locked" data-testid="ride-from-tracker">
            {MODE[person.mode]} <span class="dim">(from Tracker)</span> · <a href="#/tracker">change on Tracker</a>
          </p>
        ) : (
          <Toggle
            label="Rides"
            name="ride"
            value={ride.value}
            onChange={setRide}
            options={[
              { value: 'ski', label: 'Skier' },
              { value: 'board', label: 'Snowboarder' },
            ]}
          />
        )}
      </div>
      <p class="field-note">Alta and Deer Valley are skiers-only.</p>
    </div>
  );
}
