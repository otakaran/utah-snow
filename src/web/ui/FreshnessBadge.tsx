// Freshness badge (spec §5.8, §8.6): glyph shape + word + color, never color alone. Presentational only.
import type { Badge } from '../../shared/freshness.ts';
import { ageText } from '../lib/format.ts';
import { Glyph } from './StatusChip.tsx';
import { BADGE_TONE } from './status.ts';

const TEXT: Record<Badge, string> = { green: 'OK', amber: 'Stale', red: 'Down', grey: 'Off-season' };

interface Props {
  badge: Badge;
  /** Minutes since the last good fetch; omit to hide the age, null shows 'never'. */
  age?: number | null;
  /** Overrides the default status word ('OK', 'Stale', ...). */
  label?: string;
  /** Glyph only, the word kept for screen readers (the header dot). */
  compact?: boolean;
}

export function FreshnessBadge({ badge, age, label, compact = false }: Props) {
  const text = label ?? TEXT[badge];
  const full = age === undefined ? text : `${text} · ${ageText(age)}`;
  return (
    <span class={`fresh fresh-${badge}`} data-badge={badge}>
      <Glyph tone={BADGE_TONE[badge]} />
      <span class={compact ? 'sr-only' : 'fresh-text'}>{full}</span>
    </span>
  );
}
