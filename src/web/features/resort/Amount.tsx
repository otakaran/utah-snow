// Number pieces of the resort page: an imperial value in the chosen units with the unit split out for styling
// ('14' + '″', '—' when missing), and a stat tile whose caption sits right under its number (dt after dd visually).
import type { ComponentChildren } from 'preact';
import { fmt, type Kind, type Units } from '../../../shared/units.ts';

interface Props {
  kind: Kind;
  value: number | null | undefined;
  units: Units;
  class?: string;
}

export function Amount({ kind, value, units, class: cls }: Props) {
  const q = fmt(kind, value, units);
  return (
    <span class={`rs-num${cls ? ` ${cls}` : ''}`}>
      {q.value}
      {q.unit ? <span class="rs-u">{q.unit}</span> : null}
    </span>
  );
}

/** One <dl> entry; CSS shows the caption under the number. `card` adds the tile frame. */
export function Tile({ label, card, children }: { label: string; card?: boolean; children: ComponentChildren }) {
  return (
    <div class={card ? 'rs-tile rs-card' : 'rs-tile'}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
