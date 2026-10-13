// "N DAYS TO FIRST CHAIR" until the trip's first day (config/ikon.ts TRIP.start); nothing on or after it.
// Presentational: the caller passes today's Denver date. Sized below the page title (tokens.css type ladder).
import { TRIP } from '../../../config/ikon.ts';
import { daysUntil } from '../../shared/time.ts';
import './countdown.css';

export function Countdown({ today }: { today: string }) {
  const n = daysUntil(today, TRIP.start);
  if (n <= 0) return null;
  return (
    <p class="countdown" data-testid="countdown">
      <span class="countdown-num num">{n}</span>{' '}
      <span class="countdown-word">{n === 1 ? 'day' : 'days'} to first chair</span>
    </p>
  );
}
