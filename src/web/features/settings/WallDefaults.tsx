// Wall defaults (spec §8.5 item 6, §8.4): rotate / yt seconds, HLS cap and cam set, stored in utahsnow.wall.
// #/wall URL params override them; "Open wall" carries the current values as params.
import { setWallDefaults, wallDefaults } from '../../data/settings.ts';
import { type WallParams, type WallSet, wallHref, wallParams } from '../../router.ts';

const SET_LABEL: Record<WallSet, string> = {
  all: 'Every resort + every starred road cam',
  stakes: 'Stake cams only',
  lcc: 'Little Cottonwood (Alta, Snowbird)',
  bcc: 'Big Cottonwood (Brighton, Solitude)',
  pc: 'Park City (Deer Valley)',
  ogden: 'Ogden (Snowbasin)',
};

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
            {(Object.keys(SET_LABEL) as WallSet[]).map((s) => (
              <option key={s} value={s}>
                {SET_LABEL[s]}
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
