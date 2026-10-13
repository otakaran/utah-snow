// Per-person accent (owner decision): the 6 fixed --crew-N tokens, assigned by crew order (index mod 6). Only an
// accent beside the name (stripe or mark), never the only cue. The class sets --crew; tracker.css paints it.
export const CREW_COLORS = 6;

/** 'trk-crew-1' .. 'trk-crew-6' for the person at `index` in the crew list. */
export const crewClass = (index: number): string => `trk-crew-${(Math.abs(Math.trunc(index)) % CREW_COLORS) + 1}`;

/** personId -> crew class, in crew order. */
export const crewClasses = (people: readonly { id: string }[]): Map<string, string> =>
  new Map(people.map((p, i) => [p.id, crewClass(i)]));
