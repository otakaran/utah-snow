// Status vocabulary shared by StatusChip and FreshnessBadge (tokens.css header): every state is a tone (color),
// a glyph shape and a word, never color alone. ok ● circle, warn ▲ triangle, bad ◆ diamond, off ◌ dashed ring.
import type { Badge } from '../../shared/freshness.ts';
import type { LiftState, RoadState } from '../../shared/types.ts';

export type Tone = 'ok' | 'warn' | 'bad' | 'off';

export interface StatusWord {
  tone: Tone;
  word: string;
}

export const BADGE_TONE: Record<Badge, Tone> = { green: 'ok', amber: 'warn', red: 'bad', grey: 'off' };

export const ROAD_STATUS: Record<RoadState, StatusWord> = {
  open: { tone: 'ok', word: 'Open' },
  traction: { tone: 'warn', word: 'Traction law' },
  delays: { tone: 'warn', word: 'Delays' },
  'closure-scheduled': { tone: 'warn', word: 'Closing' },
  'uphill-restricted': { tone: 'warn', word: 'Uphill restricted' },
  closed: { tone: 'bad', word: 'Closed' },
  interlodge: { tone: 'bad', word: 'Interlodge' },
  unknown: { tone: 'off', word: 'Unknown' },
};

export const LIFT_STATUS: Record<LiftState, StatusWord> = {
  open: { tone: 'ok', word: 'Open' },
  hold: { tone: 'warn', word: 'Hold' },
  scheduled: { tone: 'off', word: 'Scheduled' },
  closed: { tone: 'bad', word: 'Closed' },
  unknown: { tone: 'off', word: 'Unknown' },
};

/** The word a stale status shows: 'Last known: Open?' (a stale road never claims a solid OPEN). */
export const lastKnown = (word: string): string => `Last known: ${word}?`;
