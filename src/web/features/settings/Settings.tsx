// #/settings (spec §8.5): per-device choices, in the spec's section order, each section on a --surface panel (topo
// shows only in the gutters). Every change saves at once; typed values flash "✓ Saved" in their section heading.
import { STRATEGY } from '../../../../config/strategy.ts';
import {
  dataSaver,
  prefersLight,
  setDataSaver,
  setSkiFraction,
  setTheme,
  setUnits,
  skiFraction,
  theme,
  units,
} from '../../data/settings.ts';
import { autoSaver } from '../../lib/data-saver.ts';
import { qty } from '../../lib/format.ts';
import { Section } from '../../ui/Section.tsx';
import { Toggle } from '../../ui/Toggle.tsx';
import { About } from './About.tsx';
import { BaseEditor } from './BaseEditor.tsx';
import { clampEntry, type Flash, savedFlash } from './clamp-entry.ts';
import { FlashNote, useFlash } from './Flash.tsx';
import { WallDefaults } from './WallDefaults.tsx';
import { WhoAmI } from './WhoAmI.tsx';
import './settings.css';

function UnitsSection() {
  const u = units.value;
  return (
    <div class="stack">
      <Toggle
        label="Units"
        name="units"
        value={u}
        onChange={setUnits}
        options={[
          { value: 'imperial', label: 'Imperial (in, °F, mph)' },
          { value: 'metric', label: 'Metric (cm, °C, km/h)' },
        ]}
      />
      <p class="field-note" data-testid="units-example">
        Example: {qty('snow', 14, u)} overnight · {qty('temp', 18, u)} · gusts {qty('wind', 45, u)} · snow level{' '}
        {qty('snowLevel', 6500, u)}
      </p>
    </div>
  );
}

function ThemeSection() {
  return (
    <div class="stack">
      <Toggle
        label="Theme"
        name="theme"
        value={theme.value}
        onChange={setTheme}
        options={[
          { value: 'dark', label: 'Dark' },
          { value: 'sun', label: 'Sun' },
          { value: 'auto', label: `Auto · ${prefersLight.value ? 'sun' : 'dark'}` },
        ]}
      />
      <p class="field-note">
        Sun is the high-contrast light theme for bright light. Auto follows the device's light or dark setting. The TV
        wall is always dark.
      </p>
    </div>
  );
}

function DataSaverSection() {
  return (
    <div class="stack">
      <Toggle
        label="Data saver"
        name="data-saver"
        value={dataSaver.value}
        onChange={setDataSaver}
        options={[
          { value: 'auto', label: `Auto · ${autoSaver.value ? 'on' : 'off'}` },
          { value: 'on', label: 'On' },
          { value: 'off', label: 'Off' },
        ]}
      />
      <p class="field-note">
        On: no auto-refresh except the stake row, live video only when tapped, smallest images. Auto turns it on when
        the browser asks to save data or the connection is 2G/3G.
      </p>
    </div>
  );
}

const toPct = (f: number): number => Math.round(f * 100);
const [MIN_PCT, MAX_PCT] = [toPct(STRATEGY.skiDayFractionRange[0]), toPct(STRATEGY.skiDayFractionRange[1])];
const DEFAULT_PCT = toPct(STRATEGY.skiDayFraction);

function SkiFraction({ onSaved }: { onSaved: (f: Flash) => void }) {
  const pct = toPct(skiFraction.value);
  return (
    <details class="advanced">
      <summary class="disclosure">
        Ski-day fraction: <span class="num">{pct}%</span>
      </summary>
      <label class="field">
        <span class="field-label">Share of the remaining trip days you will actually ski</span>
        <span class="field-row">
          <input
            type="number"
            inputMode="numeric"
            min={MIN_PCT}
            max={MAX_PCT}
            step={5}
            value={pct}
            onChange={(e) => {
              const c = clampEntry(e.currentTarget.value, MIN_PCT, MAX_PCT, pct);
              e.currentTarget.value = String(c.value);
              setSkiFraction(c.value / 100);
              onSaved(savedFlash(c, '%'));
            }}
          />
          <span class="field-unit">%</span>
        </span>
      </label>
      <p class="field-note">
        The pick spends capped days faster when this is high. Default {DEFAULT_PCT}%, range{' '}
        {`${MIN_PCT}–\u2060${MAX_PCT}%`}.
      </p>
    </details>
  );
}

/** The settings page (#/settings). */
export function Settings() {
  const [wallFlash, flashWall] = useFlash();
  const [skiFlash, flashSki] = useFlash();
  return (
    <div class="settings" data-testid="settings">
      <h1 class="page-title">Settings</h1>
      <p class="page-sub">Saved on this device only.</p>
      <Section testid="settings-base" index="01" title="Base">
        <BaseEditor />
      </Section>
      <Section testid="settings-me" index="02" title="I am">
        <WhoAmI />
      </Section>
      <Section testid="settings-units" index="03" title="Units">
        <UnitsSection />
      </Section>
      <Section testid="settings-theme" index="04" title="Theme">
        <ThemeSection />
      </Section>
      <Section testid="settings-data-saver" index="05" title="Data saver">
        <DataSaverSection />
      </Section>
      <Section testid="settings-wall" index="06" title="Wall defaults" sub={<FlashNote flash={wallFlash} />}>
        <WallDefaults onSaved={flashWall} />
      </Section>
      <Section testid="settings-advanced" index="07" title="Advanced" sub={<FlashNote flash={skiFlash} />}>
        <SkiFraction onSaved={flashSki} />
      </Section>
      <Section testid="settings-about" index="08" title="About">
        <About />
      </Section>
    </div>
  );
}
