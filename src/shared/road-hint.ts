// Resort free text about the access road -> a RoadState hint (spec §5.4 roadHint, §5.6). The roads job owns road
// state; these hints only feed its crossChecks, so every resort parser shares this one conservative reading,
// worded like roads/classify.ts: a future closure ('will close') or a lifted restriction never reads as closed or
// traction, and anything unclear is 'unknown'. Pure.
import type { RoadState } from './types.ts';

const INTERLODGE_RE = /\binterlodge\b/i;
const LIFTED_RE = /\b(?:interlodge|traction law|restrictions?|closure)\b[^.\n]{0,40}\b(?:lifted|has ended)\b/i;
const SCHEDULED_RE = /\bwill (?:be )?(?:temporarily )?clos(?:e|ed)\b/i;
const CLOSED_RE = /\bclosed\b|\bfull (?:canyon )?closure\b/i;
const NO_TRACTION_RE =
  /\bno (?:traction|chain)|\btraction (?:law |restrictions? )?(?:is |are |has been |have been )?(?:lifted|not)\b/i;
const TRACTION_RE = /traction|chains?\b|4x4|4wd|awd/i;
const OPEN_RE = /\bopen\b/i;

/** 'Interlodge in effect' -> interlodge, 'Closed: avalanche control' -> closed, '4x4 or Chains Req' -> traction. */
export function roadHintState(text: string): RoadState {
  const lifted = LIFTED_RE.test(text);
  if (INTERLODGE_RE.test(text) && !lifted) return 'interlodge';
  if (SCHEDULED_RE.test(text)) return 'unknown';
  if (CLOSED_RE.test(text)) return 'closed';
  if (lifted || NO_TRACTION_RE.test(text)) return 'open';
  if (TRACTION_RE.test(text)) return 'traction';
  return OPEN_RE.test(text) ? 'open' : 'unknown';
}
