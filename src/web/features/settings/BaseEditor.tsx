// Base picker (spec §8.5, §4.6): the 5 presets with their drive minutes to each resort, then the custom base form
// (CustomBase.tsx: location, Google Maps link or coordinates; drive times from /api/drive).
import { BASES, type BaseId, DRIVE } from '../../../../config/bases.ts';
import { RESORTS } from '../../../../config/resorts.ts';
import type { ResortId } from '../../../shared/types.ts';
import { base, setBase } from '../../data/settings.ts';
import { CustomBase } from './CustomBase.tsx';

const PRESETS = Object.keys(BASES) as BaseId[];
const RESORT_IDS = Object.keys(RESORTS) as ResortId[];

function driveLine(id: BaseId): string {
  return RESORT_IDS.map((r) => `${RESORTS[r].name} ${DRIVE[id][r].min}`).join(' · ');
}

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
            <span class="base-drive">Drive min: {driveLine(id)}</span>
          </label>
        ))}
      </fieldset>
      <CustomBase />
    </div>
  );
}
