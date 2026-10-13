// Wall defaults (spec §8.5 item 6, §8.4): rotate / yt seconds, HLS cap and cam set, stored in utahsnow.wall.
// #/wall URL params override them; "Open wall" carries the current values as params.
import { WALL_SET_DEFS, WALL_SETS } from '../../../../config/wall.ts';
import { setWallDefaults, wallDefaults } from '../../data/settings.ts';
import { type WallParams, wallHref, wallParams } from '../../router.ts';

const NUMBERS: { key: 'rotate' | 'yt' | 'hls'; label: string; min: number; max: number; unit: string }[] = [
  { key: 'rotate', label: 'Page every', min: 5, max: 600, unit: 's' },
  { key: 'yt', label: 'YouTube cam for', min: 30, max: 3600, unit: 's' },
  { key: 'hls', label: 'Live streams at once', min: 0, max: 4, unit: '' },
];

export function WallDefaults() {
  const w = wallDefaults.value;
  const update = (key: keyof WallParams, raw: string) => {
    setWallDefaults(wallParams((k) => (k === key ? raw : w[k]), w));
  };
  return (
    <div class="wall-form">
      <div class="field-grid">
        {NUMBERS.map((n) => (
          <label key={n.key} class="field">
            <span class="field-label">{n.label}</span>
            <span class="field-row">
              <input
                type="number"
                inputMode="numeric"
                min={n.min}
                max={n.max}
                step={1}
                value={w[n.key]}
                onChange={(e) => update(n.key, e.currentTarget.value)}
              />
              {n.unit ? <span class="field-unit">{n.unit}</span> : null}
            </span>
          </label>
        ))}
        <label class="field field-wide">
          <span class="field-label">Cam set</span>
          <select value={w.set} onChange={(e) => update('set', e.currentTarget.value)}>
            {WALL_SETS.map((s) => (
              <option key={s} value={s}>
                {WALL_SET_DEFS[s].long}
              </option>
            ))}
          </select>
        </label>
      </div>
      <a class="btn btn-primary" href={wallHref(w)} data-testid="open-wall">
        Open wall
      </a>
      <p class="field-note">Cast a dedicated browser window to the TV, never a tab you will switch away from.</p>
    </div>
  );
}
