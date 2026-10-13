// Header controls backed by data/settings.ts (spec §8.1 items 3, 5, 6): base chip, units toggle, theme toggle.
// The theme button names the mode it switches TO ("Sun" while dark), per the B design.
import type { BaseId } from '../../../../config/bases.ts';
import { baseInfo, resolvedTheme, setTheme, setUnits, units } from '../../data/settings.ts';
import { Icon } from '../../ui/Icon.tsx';
import { Toggle } from '../../ui/Toggle.tsx';
import './settings.css';

// Phone-width chip labels (the full label shows from 420 px up).
const SHORT: Record<BaseId, string> = {
  'cottonwood-heights': 'Cottonwood',
  'downtown-slc': 'Downtown',
  sandy: 'Sandy',
  'park-city-old-town': 'Park City',
  'slc-airport': 'Airport',
};

/** "⌂ Cottonwood Heights": the active base; opens the settings page. */
export function BaseChip() {
  const b = baseInfo.value;
  const short = b.id === 'custom' ? b.label : SHORT[b.id];
  return (
    <a class="hdr-chip" href="#/settings" data-testid="base-chip" aria-label={`Base: ${b.label}. Change in settings`}>
      <Icon name="home" size={16} />
      <span class="hdr-chip-text hdr-chip-long">{b.label}</span>
      <span class="hdr-chip-text hdr-chip-short">{short}</span>
    </a>
  );
}

export function UnitsToggle({ name = 'units-quick' }: { name?: string }) {
  return (
    <Toggle
      label="Units"
      name={name}
      testid="units-toggle"
      value={units.value}
      onChange={setUnits}
      options={[
        { value: 'imperial', label: 'in · °F' },
        { value: 'metric', label: 'cm · °C' },
      ]}
    />
  );
}

export function ThemeToggle() {
  const next = resolvedTheme.value === 'dark' ? 'sun' : 'dark';
  return (
    <button
      type="button"
      class="theme-btn"
      data-testid="theme-toggle"
      aria-label={next === 'sun' ? 'Switch to the sun theme for bright light' : 'Switch to the dark theme'}
      onClick={() => setTheme(next)}
    >
      <Icon name={next === 'sun' ? 'sun' : 'moon'} size={16} />
      <span>{next === 'sun' ? 'Sun' : 'Dark'}</span>
    </button>
  );
}
