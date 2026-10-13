// The source adapter contract (spec §3.2, §5.2). Adapters import only this file, src/shared/, config/ and their
// own helper folder; `import type` from src/worker/lib is allowed, value imports are not.
import type { FetchX } from '../lib/fetchx.ts';

export type { FetchOpts, FetchResult, FetchX } from '../lib/fetchx.ts';

/** Last-good payloads by source_state id. */
export type PrevRows = Record<string, unknown>;

export interface Source<Raw = unknown> {
  id: string; // job id used in config/schedule.ts, e.g. 'resort:alta', 'roads', 'nws-grid:alta:summit'
  staleAfterMin: number; // default for the rows it writes (§5.4)
  rows: string[]; // source_state ids this job writes (usually [id])
  maxSubrequests(ctx: FetchCtx): number; // worst case incl. redirects; the dispatcher admits jobs against the budget of 45
  probes: { hostId: string; url: string }[]; // what /api/debug/probe GETs for this source (the allowlist is the union)
  fetch(ctx: FetchCtx): Promise<Raw>; // all I/O via ctx.fetch (fetchx); never D1/KV
  parse(raw: Raw, ctx: ParseCtx): Output; // pure; throws ValidationError → rows keep last-good payload
}
export interface FetchCtx {
  fetch: FetchX;
  now: number;
  slot: number;
  morning: boolean;
  keyed: { yt: boolean; udot: boolean };
  secrets: { yt?: string; udot?: string };
  prev: PrevRows;
}
export interface ParseCtx {
  now: number;
  prev: PrevRows;
}
export interface Output {
  rows: Record<string /* source_id */, unknown>;
  frames?: { key: string; t: number; bytes: ArrayBuffer }[];
}

/** Thrown by parse() when a validation gate fails (§5.2 table): the job counts as an error, payloads are kept. */
export class ValidationError extends Error {
  override name = 'ValidationError';
}
