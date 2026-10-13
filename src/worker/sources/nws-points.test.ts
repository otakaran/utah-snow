import { describe, expect, it } from 'vitest';
import live from './fixtures/nws-points/20261012-live.json?raw';
import {
  NWS_POINTS,
  type NwsPointsRawItem,
  type NwsPointsRow,
  nwsPoints,
  nwsPointsDue,
  pointUrl,
} from './nws-points.ts';
import { type FetchCtx, type FetchOpts, ValidationError } from './types.ts';

const NOW = Date.parse('2026-10-12T12:50:00Z');
const items = () => JSON.parse(live) as NwsPointsRawItem[];
const run = (raw: unknown) => nwsPoints.parse(raw, { now: NOW, prev: {} }).rows['nws:points'] as NwsPointsRow;

describe('nws-points on the live lookups (2026-10-12)', () => {
  const row = run(items());

  it('resolves all 17 points to the configured grids and zones', () => {
    expect(row.points).toHaveLength(17);
    expect(row.failed).toEqual([]);
    expect(row.changes).toEqual([]);
    expect(row.checkedAt).toBe('2026-10-12T12:50:00.000Z');
    expect(row.points.find((p) => p.id === 'deer-valley:base')).toEqual({
      id: 'deer-valley:base',
      grid: 'SLC/114,168',
      zone: 'UTZ108',
      county: 'UTC043',
    });
    expect(row.points.find((p) => p.id === 'base:sandy')?.grid).toBe('SLC/101,166');
  });
  it('reports a moved grid and zone as changes, and a failed lookup as failed', () => {
    const raw = items();
    const alta = raw.find((r) => r.id === 'alta:summit') as { body: { properties: Record<string, unknown> } };
    const props = alta.body.properties;
    props.gridX = 109;
    props.forecastZone = 'https://api.weather.gov/zones/forecast/UTZ108';
    const sb = raw.find((r) => r.id === 'snowbird:base');
    if (sb) Object.assign(sb, { status: 0, body: null, error: 'DeadlineError' });
    const out = run(raw);
    expect(out.changes).toEqual([
      { id: 'alta:summit', field: 'grid', expected: 'SLC/108,166', actual: 'SLC/109,166' },
      { id: 'alta:summit', field: 'zone', expected: 'UTZ111', actual: 'UTZ108' },
    ]);
    expect(out.failed).toEqual(['snowbird:base']);
  });
});

describe('nws-points validation gate', () => {
  it('throws ValidationError on garbage or when most lookups fail', () => {
    expect(() => run({ title: 'Unexpected Problem' })).toThrow(ValidationError);
    expect(() => run(items().map((r) => ({ ...r, status: 500, body: null })))).toThrow(ValidationError);
    expect(() => run(items().slice(0, 8))).toThrow(/9\/17 lookups failed/);
  });
});

describe('nws-points wiring', () => {
  it('counts one subrequest per point (17) and uses 4-decimal coordinates', () => {
    expect(nwsPoints.maxSubrequests({} as FetchCtx)).toBe(17);
    expect(NWS_POINTS).toHaveLength(17);
    expect(pointUrl({ lat: 40.565, lon: -111.891 })).toBe('https://api.weather.gov/points/40.5650,-111.8910');
  });
  it('is due only on Mondays at 12Z', () => {
    expect(nwsPointsDue(Date.parse('2026-10-12T12:50:00Z'))).toBe(true); // Monday
    expect(nwsPointsDue(Date.parse('2026-10-12T11:50:00Z'))).toBe(false);
    expect(nwsPointsDue(Date.parse('2026-10-13T12:50:00Z'))).toBe(false);
  });
  it('fetches every point once without following redirects and records per-point failures', async () => {
    const seen: string[] = [];
    const byUrl = new Map(NWS_POINTS.map((p, i) => [pointUrl(p), items()[i]]));
    const fetch = (async (url: string, opts?: FetchOpts) => {
      seen.push(url);
      expect(opts).toMatchObject({ follow: false, allowStatus: true });
      if (url.includes('40.5611')) throw new Error('timeout');
      const status = url.includes('41.2048') ? 500 : 200;
      return { status, url, headers: new Headers(), data: JSON.stringify(byUrl.get(url)?.body) };
    }) as unknown as FetchCtx['fetch'];
    const raw = await nwsPoints.fetch({ fetch } as FetchCtx);
    expect(seen).toHaveLength(17);
    const out = run(raw);
    expect(out.failed).toEqual(['snowbird:summit', 'snowbasin:summit']);
    expect(out.changes).toEqual([]);
  });
});
