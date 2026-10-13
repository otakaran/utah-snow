import { describe, expect, it } from 'vitest';
import { isoUtc, MIN } from '../../shared/time.ts';
import type { Block, Meta, ResortSnapshot, Snapshot } from '../../shared/types.ts';
import { type BrowserRows, overlayBrowser, wantsBrowser } from './mtnpowder.ts';

const NOW = Date.parse('2027-01-05T13:30:00Z');
const ago = (min: number): string => isoUtc(NOW - min * MIN);

const meta = (source: string, m: Partial<Meta> = {}): Meta => ({
  source,
  fetchedAt: ago(5),
  okAt: ago(5),
  asOf: null,
  status: 'ok',
  failCount: 0,
  staleAfterMin: 40,
  ...m,
});
const resort = (season: ResortSnapshot['season'], reportAt: string): ResortSnapshot =>
  ({ season, snow: { reportAt } }) as ResortSnapshot;
const block = (m: Partial<Meta>): Block<ResortSnapshot> => ({ data: null, meta: meta('resort:solitude', m) });

function snap(sol: Partial<Meta>): Snapshot {
  const solitude = block(sol);
  const alta = { data: null, meta: meta('resort:alta') };
  return {
    resorts: { solitude, alta, 'deer-valley': { data: null, meta: meta('resort:deer-valley') } },
    sources: [alta.meta, solitude.meta],
  } as unknown as Snapshot;
}

describe('mtnpowder browser fallback', () => {
  it('fetches only when the Worker row is blocked, missing or red', () => {
    expect(wantsBrowser(block({ status: 'blocked', failCount: 1 }), NOW)).toBe(true);
    expect(wantsBrowser(undefined, NOW)).toBe(true);
    expect(wantsBrowser(block({ okAt: null, status: 'error' }), NOW)).toBe(true);
    expect(wantsBrowser(block({ okAt: ago(81) }), NOW)).toBe(true); // > 2 x staleAfter: red
    expect(wantsBrowser(block({}), NOW)).toBe(false);
    expect(wantsBrowser(block({ okAt: ago(60) }), NOW)).toBe(false); // amber: the Worker still delivers
    expect(wantsBrowser(block({ okAt: null, status: 'offseason' }), NOW)).toBe(false);
  });

  it('overlays a browser row newer than the Worker row, block and sources alike', () => {
    const base = snap({ okAt: ago(300), status: 'blocked', failCount: 9, error: 'blocked: HTTP 403' });
    const data = resort('open', ago(90));
    const rows: BrowserRows = { solitude: { okAt: ago(2), data } };
    const out = overlayBrowser(base, rows);
    const want: Meta = {
      source: 'resort:solitude',
      fetchedAt: ago(2),
      okAt: ago(2),
      asOf: ago(90),
      status: 'ok',
      failCount: 0,
      staleAfterMin: 40,
      via: 'browser',
    };
    expect(out?.resorts.solitude).toEqual({ data, meta: want });
    expect(out?.sources).toEqual([base.sources[0], want]);
    expect(out?.resorts['deer-valley']).toBe(base.resorts['deer-valley']);
    const pre = overlayBrowser(base, { solitude: { okAt: ago(2), data: resort('preseason', ago(90)) } });
    expect(pre?.resorts.solitude.meta.status).toBe('offseason'); // grey, like the Worker's preseason rows
  });

  it('lets a Worker row that is as new or newer win, and returns the same object when nothing changes', () => {
    const base = snap({ okAt: ago(2) });
    expect(overlayBrowser(base, { solitude: { okAt: ago(30), data: resort('open', ago(30)) } })).toBe(base);
    expect(overlayBrowser(base, {})).toBe(base);
    expect(overlayBrowser(null, { solitude: { okAt: ago(1), data: resort('open', ago(1)) } })).toBeNull();
  });
});
