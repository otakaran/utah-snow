// #/settings (spec §8.5): per-device choices, in the spec's section order. Every change saves at once.
import { STRATEGY } from '../../../../config/strategy.ts';
import {
  dataSaver,
  me,
  ride,
  setDataSaver,
  setMe,
  setRide,
  setSkiFraction,
  setTheme,
  setUnits,
  skiFraction,
  theme,
  units,
} from '../../data/settings.ts';
import { people } from '../../data/tracker.ts';
import { qty } from '../../lib/format.ts';
import { Section } from '../../ui/Section.tsx';
import { Toggle } from '../../ui/Toggle.tsx';
import { About } from './About.tsx';
import { BaseEditor } from './BaseEditor.tsx';
import { WallDefaults } from './WallDefaults.tsx';
import './settings.css';

function WhoAmI() {
  const id = me.value;
  const list = people.value;
  return (
    <div class="stack">
      {list.length === 0 ? (
        <p class="field-note">No crew yet. Add people on the Tracker page, then pick yourself here.</p>
      ) : (
        <label class="field">
          <span class="field-label">I am</span>
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
      <Toggle
        label="I ride"
        name="ride"
        value={ride.value}
        onChange={setRide}
        options={[
          { value: 'ski', label: 'Skier' },
          { value: 'board', label: 'Snowboarder' },
        ]}
      />
      <p class="field-note">
        Alta and Deer Valley are skiers-only. Once you pick yourself above, your tracker ski/board setting wins.
      </p>
    </div>
  );
}

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
          { value: 'sun', label: 'Sun (bright light)' },
          { value: 'auto', label: 'Auto' },
        ]}
      />
      <p class="field-note">Auto follows the device's light or dark setting. The TV wall is always dark.</p>
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
          { value: 'auto', label: 'Auto' },
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

function SkiFraction() {
  const f = skiFraction.value;
  return (
    <details class="advanced">
      <summary>Ski-day fraction: {Math.round(f * 100)}%</summary>
      <label class="field">
        <span class="field-label">Share of the remaining trip days you will actually ski</span>
        <span class="field-row">
          <input
            type="number"
            inputMode="decimal"
            min={0.3}
            max={1}
            step={0.05}
            value={f}
            onChange={(e) => {
              const v = Number(e.currentTarget.value);
              setSkiFraction(Number.isFinite(v) && v >= 0.3 && v <= 1 ? v : STRATEGY.skiDayFraction);
            }}
          />
        </span>
      </label>
      <p class="field-note">The pick spends capped days faster when this is high. Default {STRATEGY.skiDayFraction}.</p>
    </details>
  );
}

/** The settings page (#/settings). */
export function Settings() {
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
      <Section testid="settings-wall" index="06" title="Wall defaults">
        <WallDefaults />
      </Section>
      <Section testid="settings-advanced" index="07" title="Advanced">
        <SkiFraction />
      </Section>
      <Section testid="settings-about" index="08" title="About">
        <About />
      </Section>
    </div>
  );
}
