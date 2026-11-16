import { describe, expect, it } from 'vitest';
import { isoUtc, MIN } from '../../../shared/time.ts';
import type { Meta } from '../../../shared/types.ts';
import { partialWord, worstMeta } from './panel-meta.ts';

const NOW = Date.parse('2026-11-15T23:48:00Z');
const meta = (source: string, over: Partial<Meta> = {}): Meta => ({
  source,
  fetchedAt: isoUtc(NOW),
  okAt: isoUtc(NOW - 5 * MIN),
  asOf: null,
  status: 'ok',
  failCount: 0,
  staleAfterMin: 40,
  ...over,
});

describe('worstMeta and partialWord', () => {
  it('2026-11-15: one resort report timing out twice is "1 of 6 down", not every report down', () => {
    const reports = ['alta', 'snowbird', 'brighton', 'solitude', 'deer-valley'].map((r) =>
      meta(`resort:${r}`, { status: 'offseason' }),
    );
    const snowbasin = meta('resort:snowbasin', { status: 'error', failCount: 2, okAt: isoUtc(NOW - 43 * MIN) });
    const fresh = worstMeta([...reports, snowbasin, null, undefined], NOW);
    expect(fresh).toMatchObject({ badge: 'red', bad: 1, total: 6 });
    expect(fresh?.age).toBeCloseTo(43, 6);
    expect(fresh && partialWord(fresh)).toBe('1 of 6 down');
  });

  it('counts the rows on the worst badge and keeps the oldest of their ages', () => {
    const rows = [
      meta('nws:a', { okAt: isoUtc(NOW - 50 * MIN) }),
      meta('nws:b', { okAt: isoUtc(NOW - 70 * MIN) }),
      meta('nws:c'),
    ];
    const fresh = worstMeta(rows, NOW);
    expect(fresh).toMatchObject({ badge: 'amber', bad: 2, total: 3 });
    expect(fresh?.age).toBeCloseTo(70, 6);
    expect(fresh && partialWord(fresh)).toBe('2 of 3 stale');
  });

  it('one word covers a panel whose rows all agree, a single row, or a healthy one', () => {
    const down = { status: 'error', failCount: 3 } as const;
    const all = worstMeta([meta('roads:lcc', down), meta('roads:bcc', down)], NOW);
    expect(all && partialWord(all)).toBeNull();
    const one = worstMeta([meta('avy:uac', down)], NOW);
    expect(one && partialWord(one)).toBeNull();
    const ok = worstMeta([meta('roads:lcc'), meta('roads:bcc')], NOW);
    expect(ok).toMatchObject({ badge: 'green', bad: 2, total: 2 });
    expect(ok && partialWord(ok)).toBeNull();
    expect(worstMeta([null], NOW)).toBeNull();
  });
});
