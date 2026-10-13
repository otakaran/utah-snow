// Fixtures: live 2026-10-12; in-season from NAC's own history (map-layer/UAC?day=YYYY-MM-DD; Wayback has none).
import { describe, expect, it } from 'vitest';
import type { AvalancheZone } from '../../shared/types.ts';
import { AVY_URL, avalanche, parseAvalanche } from './avalanche.ts';
import jan15 from './fixtures/avalanche/20260115-inseason.json?raw';
import feb27 from './fixtures/avalanche/20260227-inseason.json?raw';
import live from './fixtures/avalanche/20261012-live.json?raw';
import { type FetchCtx, type FetchX, ValidationError } from './types.ts';

const NOW = Date.UTC(2026, 9, 12, 20);
const zones = (raw: string) => avalanche.parse(raw, { now: NOW, prev: {} }).rows['avy:uac'] as AvalancheZone[];
const byId = (zs: AvalancheZone[], id: number) => zs.find((z) => z.zoneId === id);

describe('avalanche (NAC map layer, UAC)', () => {
  it('keeps only the configured zones, Ogden 1737 and Salt Lake 1738', () => {
    expect(zones(live).map((z) => z.zoneId)).toEqual([1737, 1738]);
  });

  it('pre-season (live 2026-10-12): no rating, grey, no product dates, counted as off-season', () => {
    const sl = byId(zones(live), 1738);
    expect(sl).toMatchObject({
      name: 'Salt Lake',
      danger: 'no rating',
      level: -1,
      color: '#888888',
      fontColor: '#ffffff',
      link: 'https://utahavalanchecenter.org/forecast/salt-lake',
      validFrom: null,
      validTo: null,
      offSeason: true, // NAC sends off_season false here; no rating + no product = off-season
    });
    expect(sl?.travelAdvice).toMatch(/^Watch for signs of unstable snow/);
  });

  it('in season (2026-01-15): Salt Lake moderate, Ogden low, UTC dates with Z appended', () => {
    const zs = zones(jan15);
    expect(byId(zs, 1738)).toMatchObject({
      danger: 'moderate',
      level: 2,
      color: '#f4e500',
      fontColor: '#141B21',
      validFrom: '2026-01-15T13:42:00Z',
      validTo: '2026-01-16T13:42:00Z',
      offSeason: false,
    });
    expect(byId(zs, 1737)).toMatchObject({ name: 'Ogden', danger: 'low', level: 1, color: '#55b64f' });
    expect(Date.parse(byId(zs, 1738)?.validFrom ?? '')).toBe(Date.UTC(2026, 0, 15, 13, 42));
  });

  it('in season (2026-02-27): both zones considerable; Uintas (high) is not kept', () => {
    const zs = zones(feb27);
    expect(zs).toHaveLength(2);
    for (const z of zs)
      expect(z).toMatchObject({ danger: 'considerable', level: 3, color: '#ff9933', offSeason: false });
    expect(byId(zs, 1737)?.travelAdvice).toMatch(/^Dangerous avalanche conditions/);
  });

  it('falls back to NAC colors for a bad color and treats junk levels as no rating', () => {
    const doc = JSON.parse(jan15) as { features: { id: number; properties: Record<string, unknown> }[] };
    const sl = doc.features.find((f) => f.id === 1738);
    if (sl) Object.assign(sl.properties, { color: 'yellow', danger_level: 7 });
    const z = byId(parseAvalanche(doc), 1738);
    expect(z).toMatchObject({ level: -1, color: '#888888', danger: 'moderate', offSeason: false });
  });

  it('validation gate: garbage, an empty layer or a missing zone throw ValidationError', () => {
    expect(() => zones('<html>Service Unavailable</html>')).toThrow(ValidationError);
    expect(() => zones('{"type":"FeatureCollection","features":[]}')).toThrow(ValidationError);
    const doc = JSON.parse(live) as { features: { id: number }[] };
    doc.features = doc.features.filter((f) => f.id !== 1737);
    expect(() => zones(JSON.stringify(doc))).toThrow(/zone 1737 missing/);
  });

  it('fetch: one GET of the path-form URL, redirects not followed; maxSubrequests matches', async () => {
    const calls: { url: string; follow?: boolean }[] = [];
    let status = 200;
    const fx = (async (url: string, opts?: { follow?: boolean }) => {
      calls.push({ url, follow: opts?.follow });
      return { status, url, headers: new Headers(), data: live, bytes: live.length, blocked: false, wallMs: 1 };
    }) as unknown as FetchX;
    const ctx = { fetch: fx } as FetchCtx;
    await expect(avalanche.fetch(ctx)).resolves.toBe(live);
    expect(calls).toEqual([{ url: AVY_URL, follow: false }]);
    expect(avalanche.maxSubrequests(ctx)).toBe(1);
    expect(avalanche.maxSubrequests(ctx)).toBe(calls.length);
    expect(AVY_URL).not.toContain('center_id');
    status = 301;
    await expect(avalanche.fetch(ctx)).rejects.toThrow(/HTTP 301/);
  });
});
