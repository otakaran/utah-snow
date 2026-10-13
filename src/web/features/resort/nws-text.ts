// Browser-side NWS text forecast for one grid (spec §8.7.5): api.weather.gov/gridpoints/{grid}/forecast?units=us.
// Loaded only when the reader opens it; one request per grid per 30 min (5 min after a failure), shared by every
// resort page. A failure keeps the last good periods. The caller passes nowMs (server clock).
import { signal } from '@preact/signals';
import { MIN } from '../../../shared/time.ts';

export interface TextPeriod {
  name: string; // 'Tonight', 'Saturday'
  text: string; // detailedForecast
  isDaytime: boolean;
}

export interface TextForecast {
  periods: TextPeriod[];
  at: number; // last attempt (ms); 0 = never
  okAt: number; // last success (ms); 0 = never
  error: string | null;
  loading: boolean;
}

const TTL_MS = 30 * MIN;
const RETRY_MS = 5 * MIN;

export const nwsText = signal<Record<string, TextForecast>>({});
const inflight = new Set<string>();

/** The periods of a gridpoint forecast body; [] when the shape is unexpected. */
export function parsePeriods(body: unknown): TextPeriod[] {
  const periods = (body as { properties?: { periods?: unknown } } | null)?.properties?.periods;
  if (!Array.isArray(periods)) return [];
  const out: TextPeriod[] = [];
  for (const p of periods as Record<string, unknown>[]) {
    if (typeof p?.name !== 'string' || typeof p.detailedForecast !== 'string') continue;
    out.push({ name: p.name, text: p.detailedForecast, isDaytime: p.isDaytime === true });
  }
  return out;
}

function put(grid: string, f: TextForecast): void {
  nwsText.value = { ...nwsText.value, [grid]: f };
}

export const textUrl = (grid: string): string => `https://api.weather.gov/gridpoints/${grid}/forecast?units=us`;

/** Fetches `grid` ('SLC/108,166') unless a fresh copy or a request is already there. */
export async function loadNwsText(grid: string, nowMs: number): Promise<void> {
  const cur = nwsText.value[grid];
  if (inflight.has(grid)) return;
  if (cur && cur.at > 0 && nowMs - cur.at < (cur.error ? RETRY_MS : TTL_MS)) return;
  inflight.add(grid);
  const periods = cur?.periods ?? [];
  const okAt = cur?.okAt ?? 0;
  put(grid, { periods, at: cur?.at ?? 0, okAt, error: cur?.error ?? null, loading: true });
  try {
    const res = await fetch(textUrl(grid), { credentials: 'omit', headers: { Accept: 'application/geo+json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const next = parsePeriods(await res.json());
    if (next.length === 0) throw new Error('no forecast periods');
    put(grid, { periods: next, at: nowMs, okAt: nowMs, error: null, loading: false });
  } catch (err) {
    const error = err instanceof Error ? err.message : 'unavailable';
    put(grid, { periods, at: nowMs, okAt, error, loading: false });
  } finally {
    inflight.delete(grid);
  }
}
