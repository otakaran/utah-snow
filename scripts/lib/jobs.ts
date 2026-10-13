// Every adapter the scripts run: the registry, with the maintenance wrapper replaced by the sub-jobs it runs
// (sources/maintenance.ts MAINT_SUBS), so each sub is fetched, parsed and benched on its own.
import { DAY, isoLocal } from '../../src/shared/time.ts';
import { SOURCES } from '../../src/worker/sources/index.ts';
import { MAINT_SUBS, maintenance } from '../../src/worker/sources/maintenance.ts';
import type { PrevRows, Source } from '../../src/worker/sources/types.ts';

export { MAINT_SUBS };
export const MAINTENANCE = maintenance.id;
export const JOBS: readonly Source[] = [...SOURCES.filter((s) => s.id !== MAINTENANCE), ...MAINT_SUBS];

/** prev for script parses: resort rows carry a seasonOpenedAt, so winter payloads parse as a running season. */
export function openedPrev(src: Source, now: number): PrevRows {
  const opened = { seasonOpenedAt: isoLocal(now - 30 * DAY) };
  return Object.fromEntries(src.rows.filter((r) => r.startsWith('resort:')).map((r) => [r, opened]));
}
