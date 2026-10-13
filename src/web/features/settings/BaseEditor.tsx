// Base picker (spec §8.5, §4.6): the 5 presets with their drive minutes to each resort. Custom bases (location,
// Google Maps link, /api/drive) are Phase 2, so the custom field is shown disabled with a note.
import { BASES, type BaseId, DRIVE } from '../../../../config/bases.ts';
import { RESORTS } from '../../../../config/resorts.ts';
import type { ResortId } from '../../../shared/types.ts';
import { base, setBase } from '../../data/settings.ts';

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
      <div class="base-custom">
        <label class="field">
          <span class="field-label">Custom base</span>
          <input type="text" disabled placeholder="Label, lat, lon" aria-describedby="base-custom-note" />
        </label>
        <p id="base-custom-note" class="field-note">
          Custom bases (use my location, paste a Google Maps link) arrive in a later update. Until then, pick the
          nearest preset.
        </p>
      </div>
    </div>
  );
}
