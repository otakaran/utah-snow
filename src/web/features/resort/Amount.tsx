// Number pieces of the resort page: an imperial value in the chosen units with the unit split out for styling
// ('14' + '″', '—' when missing), and a stat tile whose caption sits right under its number (dt after dd visually).
import type { ComponentChildren } from 'preact';
import { fmt, type Kind, type Units } from '../../../shared/units.ts';

interface Props {
  kind: Kind;
  value: number | null | undefined;
  units: Units;
  /** Extra class for a real value (e.g. the glowing rs-snow); a missing value is always the plain dim dash. */
  class?: string;
}

export function Amount({ kind, value, units, class: cls }: Props) {
  const q = fmt(kind, value, units);
  if (q.text === '—') return <span class="rs-num rs-none">—</span>;
  return (
    <span class={`rs-num${cls ? ` ${cls}` : ''}`}>
      {q.value}
      {q.unit ? <span class="rs-u">{q.unit}</span> : null}
    </span>
  );
}

/** A plain count such as '7 / 12'; '—' is the dim dash. */
export const Count = ({ text }: { text: string }) => (
  <span class={text === '—' ? 'rs-num rs-none' : 'rs-num'}>{text}</span>
);

/** One <dl> entry; CSS shows the caption under the number. `card` adds the tile frame. */
export function Tile({ label, card, children }: { label: string; card?: boolean; children: ComponentChildren }) {
  return (
    <div class={card ? 'rs-tile rs-card' : 'rs-tile'}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
