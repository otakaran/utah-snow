// Wall defaults (spec §8.5 item 6, §8.4): rotate / yt seconds, HLS cap, weather-page cadence (wx) and cam set,
// stored in utahsnow.wall.
// #/wall URL params override them; "Open wall window" carries the current values as params into a new window.
// Typed values are clamped to their range, and `onSaved` flashes what was stored in the section heading.
import { WALL_LIMITS, WALL_SET_DEFS, WALL_SETS } from '../../../../config/wall.ts';
import { setWallDefaults, wallDefaults } from '../../data/settings.ts';
import { wallHref } from '../../router.ts';
import { clampEntry, type Flash, savedFlash } from './clamp-entry.ts';

interface NumberField {
  key: keyof typeof WALL_LIMITS;
  label: string;
  /** Its name in the one ranges note. */
  range: string;
  min: number;
  max: number;
  unit: string;
}

const field = (key: NumberField['key'], label: string, range: string, unit: string): NumberField => {
  const [min, max] = WALL_LIMITS[key];
  return { key, label, range, min, max, unit };
};
const NUMBERS: NumberField[] = [
  field('rotate', 'Page every (s)', 'page', '\u00a0s'),
  field('yt', 'YouTube cam (s)', 'YouTube', '\u00a0s'),
  field('hls', 'Live streams', 'streams', ''),
  field('wx', 'Weather page after (pages)', 'weather', ''),
];
// A word joiner after the dash and the no-break space in `unit` keep each range on one line.
const RANGES = NUMBERS.map((n) => `${n.range} ${n.min}–\u2060${n.max}${n.unit}`).join(' · ');

export function WallDefaults({ onSaved }: { onSaved: (f: Flash) => void }) {
  const w = wallDefaults.value;
  return (
    <div class="wall-form">
      <div class="field-grid wall-fields">
        {NUMBERS.map((n) => (
          <label key={n.key} class="field">
            <span class="field-label">{n.label}</span>
            <input
              type="number"
              inputMode="numeric"
              min={n.min}
              max={n.max}
              step={1}
              value={w[n.key]}
              onChange={(e) => {
                const c = clampEntry(e.currentTarget.value, n.min, n.max, w[n.key]);
                e.currentTarget.value = String(c.value); // the signal may not change (same value), so set it here
                setWallDefaults({ ...w, [n.key]: c.value });
                onSaved(savedFlash(c, n.unit));
              }}
            />
          </label>
        ))}
        <label class="field field-wide">
          <span class="field-label">Cam set</span>
          <select
            value={w.set}
            onChange={(e) => {
              setWallDefaults({ ...w, set: WALL_SETS.find((s) => s === e.currentTarget.value) ?? w.set });
              onSaved({ ok: true, text: 'Saved' });
            }}
          >
            {WALL_SETS.map((s) => (
              <option key={s} value={s}>
                {WALL_SET_DEFS[s].long}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p class="field-note">
        Ranges: {RANGES}. With 0 streams the wall shows stills only; 0 = no weather page. URL params on #/wall override
        these.
      </p>
      <a class="btn btn-primary" href={wallHref(w)} target="_blank" rel="noopener" data-testid="open-wall">
        Open wall window <span aria-hidden="true">↗</span>
      </a>
      <p class="field-note">Cast a dedicated browser window to the TV, never a tab you will switch away from.</p>
    </div>
  );
}
