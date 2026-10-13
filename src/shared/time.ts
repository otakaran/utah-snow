// The ONLY module that touches time zones, Intl or Date getters (spec §5.7, §8.8; enforced by check-repo).
// Everything is America/Denver (plus the Pacific YouTube quota day, ptDate). Local dates are 'YYYY-MM-DD' strings,
// local times are 'HH:MM' (24 h). Strings passed as instants must carry a zone (ISO with Z/±hh:mm, or an HTTP date);
// zone-less strings are rejected because Date.parse would read them in the machine's zone. Invalid input yields
// '' / null. The body lives in src/shared/time/ (base, zone, days, format, iso); always import from this file.
export { DAY, HOUR, MIN } from './time/base.ts';
export {
  addDays,
  daysBetween,
  daysRemaining,
  isBetweenLocal,
  isTripDay,
  pickMode,
  tripDayNumber,
} from './time/days.ts';
export { type DateStyle, formatClock, formatClockRel, formatLocalDate, hm24, monthNum } from './time/format.ts';
export { httpDateToMs, isoLocal, isoUtc } from './time/iso.ts';
export {
  denverOffsetMin,
  isoToMs,
  type LocalParts,
  localDate,
  localHM,
  localHour,
  localParts,
  localSlots,
  pstToUtc,
  ptDate,
  TZ,
  toMs,
  type When,
  zonedToUtc,
} from './time/zone.ts';
