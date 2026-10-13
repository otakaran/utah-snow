// Constants and Date primitives shared by src/shared/time/*. Import through src/shared/time.ts.

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const pad = (n: number): string => String(n).padStart(2, '0');

/** UTC fields of `d` as 'YYYY-MM-DD' (callers shift `d` by a zone offset first). */
export const ymd = (d: Date): string => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

/** A local date 'YYYY-MM-DD' as UTC midnight ms, for calendar arithmetic only. */
export const dateMs = (date: string): number => Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10));

/** '+HH:MM' / '-HH:MM' for an offset in minutes. */
export function offsetText(min: number): string {
  const abs = Math.abs(min);
  return `${min < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
