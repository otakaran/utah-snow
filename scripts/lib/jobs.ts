// Every adapter the scripts run: the registry, with the maintenance wrapper replaced by the three sub-jobs it runs
// (sources/maintenance.ts), so each sub is fetched, parsed and benched on its own.
import { DAY, isoLocal } from '../../src/shared/time.ts';
import { hdrelayConfig } from '../../src/worker/sources/hdrelay-config.ts';
import { SOURCES } from '../../src/worker/sources/index.ts';
import { nwsPoints } from '../../src/worker/sources/nws-points.ts';
import type { PrevRows, Source } from '../../src/worker/sources/types.ts';
import { udotCamCheck } from '../../src/worker/sources/udot-cam-check.ts';

export const MAINTENANCE = 'maintenance';
export const MAINT_SUBS: readonly Source[] = [hdrelayConfig, udotCamCheck, nwsPoints];
export const JOBS: readonly Source[] = [...SOURCES.filter((s) => s.id !== MAINTENANCE), ...MAINT_SUBS];

/** prev for script parses: resort rows carry a seasonOpenedAt, so winter payloads parse as a running season. */
export function openedPrev(src: Source, now: number): PrevRows {
  const opened = { seasonOpenedAt: isoLocal(now - 30 * DAY) };
  return Object.fromEntries(src.rows.filter((r) => r.startsWith('resort:')).map((r) => [r, opened]));
}
