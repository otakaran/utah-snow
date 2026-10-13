// Pure view logic for RoadsPanel (spec §8.2, §5.6): road state -> status word and tone (ui/status.ts vocabulary),
// the LAST KNOWN rule for stale rows, canyon-top travel minutes, the UDOT post snippet, the headline and the
// standing-advisory chips. No DOM, no signals.
import { RESORT_IDS, RESORTS } from '../../../../config/resorts.ts';
import { ageMin, badge } from '../../../shared/freshness.ts';
import type { Block, Corridor, RoadStatus } from '../../../shared/types.ts';
import { clockRel } from '../../lib/format.ts';
import { ROAD_STATUS, type StatusWord } from '../../ui/status.ts';

export const CORRIDOR_ORDER = ['lcc', 'bcc', 'parleys', 'snowbasin'] as const satisfies readonly Corridor[];

export const CORRIDOR_NAME: Record<Corridor, { code: string; route: string; travelTo: string }> = {
  lcc: { code: 'LCC', route: 'SR-210 Little Cottonwood', travelTo: 'to canyon top' },
  bcc: { code: 'BCC', route: 'SR-190 Big Cottonwood', travelTo: 'to canyon top' },
  parleys: { code: 'Parleys', route: 'I-80 · SR-224 Park City', travelTo: 'to Park City' },
  snowbasin: { code: 'Snowbasin', route: 'I-84 · SR-167 · SR-226', travelTo: 'to Snowbasin' },
};

// Sign destinations that mean "the resort end of this corridor" (UDOT VMS travel times, config/roads.ts signs).
const TRAVEL_RE: Record<Corridor, RegExp> = {
  lcc: /LITTLE COTTONWOOD/,
  bcc: /BIG COTTONWOOD/,
  parleys: /PARK CITY/,
  snowbasin: /SNOWBASIN|HUNTSVILLE|MOUNTAIN GREEN/,
};

/** Full names of the resorts this corridor serves, in canonical order ('Alta, Snowbird'). */
export const corridorResorts = (c: Corridor): string =>
  RESORT_IDS.filter((r) => RESORTS[r].corridor === c)
    .map((r) => RESORTS[r].name)
    .join(', ');

/** A corridor row, or null for a missing or placeholder payload (the e2e seed may store '{}'). */
export const roadData = (block: Block<RoadStatus> | null | undefined): RoadStatus | null =>
  block?.data && typeof block.data.state === 'string' ? block.data : null;

/** The live status of a road; a scheduled closure names its time ('Closing 4:00 PM'). */
export function stateChip(r: Pick<RoadStatus, 'state' | 'closesAt'>, nowMs: number): StatusWord {
  const base = ROAD_STATUS[r.state] ?? ROAD_STATUS.unknown;
  if (r.state === 'closure-scheduled' && r.closesAt)
    return { ...base, word: `${base.word} ${clockRel(r.closesAt, nowMs)}` };
  return base;
}

export interface RoadView {
  chip: StatusWord;
  /** Older than staleAfterMin (or failing twice): StatusChip `stale` shows 'Last known: Open?' on the dashed plate. */
  stale: boolean;
  ageMin: number | null;
}

/** Status and staleness of one corridor block. A missing row is a plain off 'No data' (nothing is last known). */
export function roadView(block: Block<RoadStatus> | null | undefined, nowMs: number): RoadView {
  const r = roadData(block);
  if (!block || !r) return { chip: { tone: 'off', word: 'No data' }, stale: false, ageMin: null };
  const age = ageMin(block.meta, nowMs);
  const stale = age === null || age > block.meta.staleAfterMin || badge(block.meta, nowMs) === 'red';
  return { chip: stateChip(r, nowMs), stale, ageMin: age };
}

/** Travel minutes to the resort end of the corridor from the first UDOT sign that shows them; null if none. */
export function travelMin(c: Corridor, signs: RoadStatus['signs'] | null | undefined): number | null {
  for (const s of signs ?? []) {
    for (const t of s.travel) {
      if (Number.isFinite(t.min) && TRAVEL_RE[c].test(t.dest.toUpperCase())) return t.min;
    }
  }
  return null;
}

/** A UDOT post as one line: lines joined with ' · ', whitespace collapsed, cut at a word with '…'. */
export function postSnippet(text: string, max = 200): string {
  const one = text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' · ');
  if (one.length <= max) return one;
  const cut = one.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s·,;:.-]+$/, '')}…`;
}

// The no-alert headline. Rows written before the age moved to render time carry it baked in ('… 59m ago').
const GENERIC = /\b(?:Last|Latest) UDOT update(?: \S+ ago)?/;

/** The row's headline, or null when it only announces the latest post (RoadRow shows that post with a live age). */
export function roadHeadline(r: { headline?: string | null; latestPost: RoadStatus['latestPost'] }): string | null {
  const h = (r.headline ?? '').replace(GENERIC, 'Latest UDOT update').trim();
  return h === '' || (h === 'Latest UDOT update' && r.latestPost) ? null : h;
}

/** BCC's Guardsman note without a doubled 'Guardsman Pass: Guardsman Pass …' prefix. */
export const guardsmanText = (g: string): string => g.replace(/^Guardsman Pass:\s*(?=Guardsman Pass\b)/i, '');

/** A UDOT event ('{location}: {type}, {details}') as '{type} · {location}'; other texts as a snippet. */
export function advisoryText(text: string, max = 90): string {
  const i = text.indexOf(': ');
  const type = i > 0 ? /^([^,.;:!?\n]{3,40})[,.;\n]/.exec(text.slice(i + 2).trim())?.[1]?.trim() : undefined;
  return postSnippet(type ? `${type} · ${text.slice(0, i).trim()}` : text, max);
}

export type AdvisoryView = RoadStatus['advisories'][number];

/** Standing advisories as chips, minus any that repeat BCC's Guardsman note (it has its own line). */
export function advisoryViews(r: Pick<RoadStatus, 'advisories' | 'guardsman'>): AdvisoryView[] {
  return (r.advisories ?? [])
    .filter((a) => !(r.guardsman && /guardsman/i.test(a.text)))
    .map((a) => ({ ...a, text: advisoryText(a.text) }));
}

/** ETO is shown only while the road is not plainly open. */
export const showEto = (r: Pick<RoadStatus, 'state' | 'eto'>): boolean => Boolean(r.eto) && r.state !== 'open';
