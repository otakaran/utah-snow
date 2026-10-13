// Narrowing helpers for untrusted JSON (feeds, last-good rows). Pure; parsers import these instead of local copies.

export type Obj = Record<string, unknown>;

/** A plain object (not null, not an array). */
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** The value as a plain object, else null (`obj(v) ?? {}` for a total read). */
export const obj = (v: unknown): Obj | null => (isObj(v) ? v : null);

/** The value as an array, else []. */
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** A trimmed non-empty string, else null. */
export const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** JSON.parse that returns undefined instead of throwing (and for non-strings). */
export function tryJson(text: unknown): unknown {
  if (typeof text !== 'string') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}
