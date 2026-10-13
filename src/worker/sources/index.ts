// Source registry: the only file that imports adapters (spec §5.2). Add an adapter here, then place its job in
// config/schedule.ts; index.test.ts keeps SLOTS and SOURCES one-to-one. maintenance.ts wraps hdrelay-config,
// udot-cam-check and nws-points, so those three are never registered directly.
import { alta } from './alta.ts';
import { altaWeather } from './alta-weather.ts';
import { avalanche } from './avalanche.ts';
import { brighton } from './brighton.ts';
import { camStatus } from './cam-status.ts';
import { maintenance } from './maintenance.ts';
import { MTNPOWDER_SOURCES } from './mtnpowder.ts';
import { NWS_GRID_SOURCES } from './nws-grid.ts';
import { nwsObs } from './nws-obs.ts';
import { nwsText } from './nws-text.ts';
import { PROBE_SEED } from './probe-seed.ts';
import { roads } from './roads.ts';
import { snotel } from './snotel.ts';
import { snowbasin } from './snowbasin.ts';
import { snowbird } from './snowbird.ts';
import { stakeAlta } from './stake-alta.ts';
import { stakeSkiutah } from './stake-skiutah.ts';
import type { Source } from './types.ts';
import { youtube } from './youtube.ts';

export const SOURCES: readonly Source[] = [
  stakeAlta,
  stakeSkiutah,
  roads,
  snowbasin,
  alta,
  snowbird,
  brighton,
  ...MTNPOWDER_SOURCES,
  ...NWS_GRID_SOURCES,
  nwsObs,
  avalanche,
  nwsText,
  youtube,
  snotel,
  altaWeather,
  camStatus,
  maintenance,
];

const DEFAULT_STALE_MIN = 60; // rows no registered source writes (legacy or hand-seeded)

/** The registered source that writes this row, if any. */
export function sourceOfRow(rowId: string, sources: readonly Source[] = SOURCES): Source | undefined {
  return sources.find((s) => s.rows.includes(rowId));
}

/** §5.4: the writer's per-row override, else its default. */
export function staleAfterMin(rowId: string, sources: readonly Source[] = SOURCES): number {
  const src = sourceOfRow(rowId, sources);
  if (!src) return DEFAULT_STALE_MIN;
  return src.staleByRow?.[rowId] ?? src.staleAfterMin;
}

/** Probe allowlist: adapters' probes plus the seed, unique by hostId (adapter entries first). */
export function probeList(sources: readonly Source[] = SOURCES): { hostId: string; url: string }[] {
  const seen = new Map<string, string>();
  for (const p of [...sources.flatMap((s) => s.probes), ...PROBE_SEED]) {
    if (!seen.has(p.hostId)) seen.set(p.hostId, p.url);
  }
  return [...seen].map(([hostId, url]) => ({ hostId, url }));
}
