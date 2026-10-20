// Pure cron slot rules (spec §5.3), shared by the dispatcher and the Node scripts (bench, fixtures): the slot of a
// tick, the Denver morning window, the maintenance ticks and the job ids a slot schedules (config/schedule.ts).
import { MAINT, MORNING_HOURS, SLOTS } from '../../../config/schedule.ts';
import { DAY, HOUR, localHour, MIN } from '../../shared/time.ts';

/** 0-11 = UTC minute / 5. */
export const slotOf = (ms: number): number => Math.floor((ms % HOUR) / (5 * MIN));
export const isMorning = (ms: number): boolean => {
  const h = localHour(ms);
  return h >= MORNING_HOURS.from && h <= MORNING_HOURS.to;
};
/** MAINT.slot (9) at 08-11Z, plus Mondays at 12Z. */
export function isMaintenance(ms: number): boolean {
  if (slotOf(ms) !== MAINT.slot) return false;
  const h = Math.floor(ms / HOUR) % 24;
  const monday = (Math.floor(ms / DAY) + 4) % 7 === 1; // 1970-01-01 was a Thursday
  return (MAINT.utcHours as readonly number[]).includes(h) || (monday && h === MAINT.mondayUtcHour);
}

/** The daily D1 prune rides on the first maintenance hour (08Z, with hdrelay-config). */
export const isPruneTick = (ms: number): boolean =>
  isMaintenance(ms) && Math.floor(ms / HOUR) % 24 === MAINT.utcHours[0];

/** Job ids scheduled in a slot (config/schedule.ts), registered or not. */
export function slotJobIds(slot: number, morning: boolean, maintenance: boolean): string[] {
  const def = SLOTS[slot] ?? { always: [], morning: [] };
  return [...new Set([...def.always, ...(morning ? def.morning : [])])].filter(
    (id) => id !== 'maintenance' || maintenance,
  );
}
