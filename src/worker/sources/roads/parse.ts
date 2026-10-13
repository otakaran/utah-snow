// Roads parse (spec §5.6): normalize the WP feeds and the UDOT lists once, then assemble the four corridor rows.
// Gates (§5.2): a WP body must be a JSON array, a List page needs recordsTotal > 0, a keyed body a non-empty array.
// A failed piece falls back to the previous row's piece; the job fails only when no WP feed and no UDOT list passed.
// Keyless without any List page (UDOT answers 403 to Worker egress) the rows come from the WP feeds and say so.
import { CORRIDORS } from '../../../../config/roads.ts';
import { obj } from '../../../shared/json.ts';
import type { Corridor, RoadStatus } from '../../../shared/types.ts';
import { type Output, type ParseCtx, ValidationError } from '../types.ts';
import { assembleCorridor } from './assemble.ts';
import { classifyFeed, type PostFacts } from './classify.ts';
import { resortSignals } from './cross.ts';
import { type RoadsRaw, type Signal, str } from './raw.ts';
import { type SignRow, signSignal, signView } from './signs.ts';
import { trafficCarry, trafficFor } from './traffic.ts';
import { eventKeyed, keyedRows, passKeyed, segmentKeyed, signKeyed } from './udot-keyed.ts';
import {
  listRows,
  type PassRow,
  passRow,
  type Segment,
  segmentRow,
  signRow,
  type TrafficEvent,
  trafficRow,
} from './udot-list.ts';

export const CORRIDOR_IDS = Object.keys(CORRIDORS) as Corridor[];
export const rowId = (c: Corridor): string => `roads:${c}`;

interface Udot {
  segments: Map<string, Segment> | null;
  passes: PassRow[] | null;
  signs: Map<string, SignRow> | null;
  events: TrafficEvent[] | null; // null = no traffic data this tick
}

// Keyless lists are statewide (a full sign pull is ~220 rows): keep only the rows the corridors read, before any
// per-row work (timestamps cost the most). Same keys as the fixture trim in scripts/refresh-fixtures/trim.ts.
const DEFS = Object.values(CORRIDORS);
const ROADWAYS = new Set<string>(DEFS.flatMap((d) => d.roadways));
const PASSES = new Set<string>(DEFS.flatMap((d) => d.passes.flatMap((p) => [p.name, String(p.rowId)])));
const SIGNS = new Set<string>(DEFS.flatMap((d) => [...d.signs.travel, ...d.signs.advisory]));

function readUdot(raw: RoadsRaw): Udot {
  const k = raw.keyed;
  const seg = k
    ? keyedRows(raw.conditions?.[0])?.map(segmentKeyed)
    : listRows(raw.conditions)
        ?.filter((o) => ROADWAYS.has(str(o.roadway)))
        .map(segmentRow);
  const passes = k
    ? keyedRows(raw.passes?.[0])?.map(passKeyed)
    : listRows(raw.passes)
        ?.filter((o) => PASSES.has(str(o.name)) || PASSES.has(str(o.DT_RowId)))
        .map(passRow);
  const signs = k
    ? keyedRows(raw.signs?.[0])
        ?.map(signKeyed)
        .filter((s): s is SignRow => s !== null)
    : listRows(raw.signs)
        ?.filter((o) => SIGNS.has(str(o.DT_RowId)))
        .map(signRow);
  const searched = raw.traffic === null ? null : listRows(raw.traffic);
  const keyedEvents = keyedRows(raw.events)?.map(eventKeyed) ?? null;
  const events =
    searched === null && keyedEvents === null
      ? null
      : [...new Map([...(searched?.map(trafficRow) ?? []), ...(keyedEvents ?? [])].map((e) => [e.id, e])).values()];
  return {
    segments: seg ? new Map(seg.map((s) => [s.name, s])) : null,
    passes: passes ?? null,
    signs: signs ? new Map(signs.map((s) => [s.id, s])) : null,
    events,
  };
}

/** Keyless and no List page passed (refused or down): one crossChecks note per row; it never changes state. */
function listAbsence(raw: RoadsRaw, u: Udot): Signal[] {
  if (raw.keyed || u.segments !== null || u.passes !== null) return [];
  const err = raw.errors?.['list:MountainPasses'] ?? '';
  const why = /HTTP \d{3}|BlockedError/.exec(err)?.[0] ?? 'no page passed the gate';
  return [{ source: 'UDOT list', raw: `unavailable (${why}); WP posts only`, state: 'unknown' }];
}

function prevRow(ctx: ParseCtx, c: Corridor): RoadStatus | null {
  const p = obj(ctx.prev[rowId(c)]);
  return p && typeof p.state === 'string' && Array.isArray(p.signs) ? (p as unknown as RoadStatus) : null;
}

function corridorPass(c: Corridor, u: Udot, prev: RoadStatus | null): RoadStatus['pass'] {
  if (!u.passes) return prev?.pass ?? null;
  const want = CORRIDORS[c].passes[0];
  const hit = u.passes.find((p) => p.name === want.name || p.rowId === want.rowId || p.apiId === want.apiId);
  return hit?.view ?? null;
}

function corridorSigns(c: Corridor, raw: RoadsRaw, u: Udot, prev: RoadStatus | null): RoadStatus['signs'] {
  const def = CORRIDORS[c].signs;
  const carry = !raw.keyed || u.signs === null; // keyed mode drops signs without a known keyed Id
  const out: RoadStatus['signs'] = [];
  for (const id of [...def.travel, ...def.advisory]) {
    const row = u.signs?.get(id);
    const view = row ? signView(row, c) : carry ? prev?.signs.find((s) => s.id === id) : undefined;
    if (view) out.push(view);
  }
  return out;
}

export function parseRoads(raw: RoadsRaw, ctx: ParseCtx): Output {
  if (!obj(raw) || !obj(raw.wp)) throw new ValidationError('roads: raw payload is not an object');
  const feeds = new Map<string, PostFacts[] | null>();
  for (const c of CORRIDOR_IDS) {
    const site = CORRIDORS[c].wpSite;
    if (!feeds.has(site)) feeds.set(site, classifyFeed(raw.wp[site], site));
  }
  const u = readUdot(raw);
  if ([...feeds.values()].every((f) => f === null) && u.segments === null && u.passes === null) {
    const errs = Object.entries(raw.errors ?? {}).map(([k, v]) => `${k}: ${v}`);
    throw new ValidationError(
      `roads: no WP feed and no UDOT list passed the gate${errs.length ? ` (${errs.join('; ')})` : ''}`.slice(0, 400),
    );
  }
  const rows: Record<string, RoadStatus> = {};
  const absent = listAbsence(raw, u);
  for (const c of CORRIDOR_IDS) {
    const def = CORRIDORS[c];
    const prev = prevRow(ctx, c);
    const feed = feeds.get(def.wpSite) ?? null;
    const signs = corridorSigns(c, raw, u, prev);
    const traffic = u.events ? trafficFor(c, u.events, ctx.now) : trafficCarry(prev, ctx.now);
    const signals: Signal[] = [
      ...absent,
      ...traffic.signals,
      ...signs.map((s) => signSignal(s, c)).filter((s): s is Signal => s !== null),
      ...resortSignals(c, raw, ctx.prev),
    ];
    const segments = u.segments
      ? def.roadways.flatMap((r) => {
          const s = u.segments?.get(r);
          return s ? [s] : [];
        })
      : (prev?.segments ?? []);
    rows[rowId(c)] = assembleCorridor({
      corridor: c,
      now: ctx.now,
      posts: feed ? feed.filter((p) => p.corridors.includes(c)) : null,
      wpError: raw.errors?.[`wp:${def.wpSite.replace(/^https?:\/\//, '')}`] ?? null,
      segments,
      signs,
      pass: corridorPass(c, u, prev),
      signals,
      advisories: traffic.advisories,
      prev,
    });
  }
  return { rows };
}
