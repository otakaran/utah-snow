// "N DAYS TO FIRST CHAIR" until the trip's first day (config/ikon.ts TRIP.start), or "N DAYS TO OPENING" with
// `to` + `word`; nothing on or after that date. Presentational: the caller passes today's Denver date. Sized below
// the page title (tokens.css type ladder).
import { TRIP } from '../../../config/ikon.ts';
import { daysUntil } from '../../shared/time.ts';
import './countdown.css';

interface Props {
  today: string;
  /** The 'YYYY-MM-DD' date counted to. Default: the trip's first day. */
  to?: string;
  /** What the days lead to. Default 'to first chair'. */
  word?: string;
}

export function Countdown({ today, to = TRIP.start, word = 'to first chair' }: Props) {
  const n = daysUntil(today, to);
  if (n <= 0) return null;
  return (
    <p class="countdown" data-testid="countdown">
      <span class="countdown-num num">{n}</span>{' '}
      <span class="countdown-word">
        {n === 1 ? 'day' : 'days'} {word}
      </span>
    </p>
  );
}
