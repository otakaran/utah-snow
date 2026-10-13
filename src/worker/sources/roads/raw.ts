// Roads raw payload (what fetch() returns and the fixtures hold) and the small value readers the helpers share.
import type { RoadState } from '../../../shared/types.ts';

/**
 * Every field is the parsed JSON body as received, or null when that call failed or did not run this tick.
 * Keyless lists hold one entry per DataTables page; keyed lists hold the one api/v2 body.
 */
export interface RoadsRaw {
  keyed: boolean;
  wp: Record<string, unknown>; // by CorridorDef.wpSite: the posts array
  conditions: unknown[] | null; // RoadConditions pages | [api roadconditions]
  passes: unknown[] | null; // MountainPasses page | [api mountainpasses]
  signs: unknown[] | null; // MessageSigns search + full pages | [api messagesigns]
  traffic: unknown[] | null; // traffic search pages; null = not a traffic slot
  events?: unknown; // api event body (keyed fallback when a traffic search failed)
  snowbird: { roads: unknown; parking: unknown; alerts: unknown };
  brighton: unknown; // reportpal-roads array
  errors: Record<string, string>; // call label -> error text, key= redacted
}

/** One crossChecks entry. `state` is what that input implies; 'unknown' = no opinion (recorded only). */
export interface Signal {
  source: string;
  raw: string;
  state: RoadState;
}

export const HOUR = 3_600_000;

export type Obj = Record<string, unknown>;
export const obj = (v: unknown): Obj | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null;
export const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
export const iso = (ms: number): string => new Date(ms).toISOString();
export const redactKey = (s: string): string => s.replace(/key=[^&\s"']*/gi, 'key=***');

/** Severity order used by overlays and escalation (higher wins). */
const RANK: Record<RoadState, number> = {
  unknown: -1,
  open: 0,
  delays: 1,
  traction: 2,
  'closure-scheduled': 3,
  'uphill-restricted': 4,
  closed: 5,
  interlodge: 6,
};
export const worse = (a: RoadState, b: RoadState): boolean => RANK[a] > RANK[b];
