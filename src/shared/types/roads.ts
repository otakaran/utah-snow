// Road shapes (spec §5.1). Imported through src/shared/types.ts, never directly.
import type { ResortId } from './resort.ts';

export type Corridor = 'lcc' | 'bcc' | 'parleys' | 'snowbasin';
export type RoadState =
  | 'open'
  | 'traction'
  | 'delays'
  | 'closure-scheduled'
  | 'uphill-restricted'
  | 'closed'
  | 'interlodge'
  | 'unknown';

export interface RoadStatus {
  corridor: Corridor;
  state: RoadState;
  tractionLaw: boolean | null;
  eto: string | null;
  closesAt: string | null;
  reason: 'avalanche' | 'crash' | 'weather' | 'construction' | null;
  headline: string;
  latestPost: {
    id: number;
    at: string;
    text: string;
    link: string;
    site: string;
    state: RoadState | null; // null = info only
  } | null;
  guardsman: string | null; // BCC only: latest Guardsman-only text, display only
  advisories: { id: string; text: string; link: string | null; until: string }[]; // standing; never change state
  segments: { name: string; roadCondition: string; weatherCondition: string; restriction: string; at: string | null }[];
  signs: {
    id: string;
    name: string;
    lines: string[];
    travel: { dest: string; min: number }[];
    advisory: string | null;
    at: string | null;
  }[];
  pass: {
    name: string;
    airF: number | null;
    windMph: number | null;
    gustMph: number | null;
    surfaceF: number | null;
    surface: string | null;
    visMi: number | null;
  } | null;
  parkingFull: ResortId[];
  crossChecks: { source: string; raw: string; state: RoadState }[];
}
