// Segmented control (B "seg" pill): native radios in a fieldset, so arrow keys, labels and forms just work.
// Used for units, theme, crew/as-me and the like. Presentational: the caller owns the value.
import type { ComponentChildren } from 'preact';

export interface ToggleOption<T extends string> {
  value: T;
  label: ComponentChildren;
}

interface Props<T extends string> {
  /** Accessible group name (visually hidden legend). */
  label: string;
  /** Unique radio group name on the page. */
  name: string;
  value: T;
  options: readonly ToggleOption<T>[];
  onChange: (value: T) => void;
  testid?: string;
}

export function Toggle<T extends string>({ label, name, value, options, onChange, testid }: Props<T>) {
  return (
    <fieldset class="seg" data-testid={testid}>
      <legend class="sr-only">{label}</legend>
      {options.map((o) => {
        const id = `${name}-${o.value}`;
        return (
          <span key={o.value} class="seg-item">
            <input
              type="radio"
              id={id}
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
            />
            <label for={id}>{o.label}</label>
          </span>
        );
      })}
    </fieldset>
  );
}
