// Base picker (spec §8.5, §4.6): the 5 presets with their drive minutes to each resort, then the custom base form
// (CustomBase.tsx: location, Google Maps link or coordinates; drive times from /api/drive).
import { BASES, type BaseId } from '../../../../config/bases.ts';
import { driveMatrix } from '../../../shared/geo.ts';
import { base, setBase } from '../../data/settings.ts';
import { CustomBase } from './CustomBase.tsx';
import { DriveChips } from './DriveChips.tsx';

const PRESETS = Object.keys(BASES) as BaseId[];

const minutes = (id: BaseId) => driveMatrix({ id, ...BASES[id] }).min;

export function BaseEditor() {
  const b = base.value;
  const current = 'preset' in b ? b.preset : null;
  return (
    <div class="base-editor">
      <fieldset class="base-presets">
        <legend class="sr-only">Base presets</legend>
        {PRESETS.map((id) => (
          <label key={id} class={`base-option${current === id ? ' is-on' : ''}`}>
            <input
              type="radio"
              name="base-preset"
              value={id}
              checked={current === id}
              onChange={() => setBase({ preset: id })}
            />
            <span class="base-name">{BASES[id].label}</span>
            <DriveChips min={minutes(id)} />
          </label>
        ))}
      </fieldset>
      <CustomBase />
    </div>
  );
}
