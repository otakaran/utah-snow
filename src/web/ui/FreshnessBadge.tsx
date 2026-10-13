// Freshness badge (spec §5.8, §8.6): color + glyph + text, never color alone. Presentational only.
import type { Badge } from '../../shared/freshness.ts';
import { ageText } from '../lib/format.ts';

const GLYPH: Record<Badge, string> = { green: '●', amber: '▲', red: '✕', grey: '○' };
const TEXT: Record<Badge, string> = { green: 'OK', amber: 'Stale', red: 'Down', grey: 'Off-season' };

interface Props {
  badge: Badge;
  /** Minutes since the last good fetch; omit to hide the age, null shows 'never'. */
  age?: number | null;
  /** Overrides the default status word ('OK', 'Stale', ...). */
  label?: string;
}

export function FreshnessBadge({ badge, age, label }: Props) {
  const text = label ?? TEXT[badge];
  return (
    <span class={`fresh fresh-${badge}`} data-badge={badge}>
      <span class="fresh-glyph" aria-hidden="true">
        {GLYPH[badge]}
      </span>
      <span class="fresh-text">{age === undefined ? text : `${text} · ${ageText(age)}`}</span>
    </span>
  );
}
