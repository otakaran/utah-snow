import { describe, expect, it } from 'vitest';
import { diffSet, newSite, renderReport, type SiteResult } from './diff.ts';

const AT = '2026-10-13T15:00:00.000Z';

function site(name: string, patch: Partial<SiteResult> = {}): SiteResult {
  return { ...newSite(name, `https://${name.toLowerCase()}.example/`), ...patch };
}

describe('diffSet', () => {
  it('lists both sides, deduplicated and sorted; subset ignores config-only values', () => {
    const c = { what: 'ids', expected: ['a', 'b', 'c'], live: ['c', 'd', 'c', 'a'] };
    expect(diffSet(c)).toEqual({ missing: ['b'], extra: ['d'] });
    expect(diffSet({ ...c, subset: true })).toEqual({ missing: [], extra: ['d'] });
  });
});

describe('renderReport', () => {
  it('is "no drift" when every check matches and an unreachable host never drifts', () => {
    const ok = site('Alta', { checks: [{ what: 'slugs', expected: ['x', 'y'], live: ['y', 'x'] }] });
    const down = site('Brighton', { unreachable: 'HTTP 403, bot challenge', problems: ['ignored'] });
    const { markdown, drift } = renderReport([ok, down], AT);
    expect(drift).toBe(false);
    expect(markdown.split('\n')[0]).toBe('# Cam drift: no drift');
    expect(markdown).toContain('## Alta: ok');
    expect(markdown).toContain('- slugs: 2 of 2 match');
    expect(markdown).toContain('## Brighton: unreachable (HTTP 403, bot challenge)');
    expect(markdown).toContain('Unreachable from this runner (not checked): Brighton.');
  });

  it('reports set diffs with labels and problems as drift', () => {
    const labels = { new1: '"Ontario Snowstake" -> slot dv-stake', old1: 'dv-stake' };
    const dv = site('Deer Valley', {
      checks: [{ what: 'handles', expected: ['old1', 'k'], live: ['k', 'new1'], labels }],
    });
    const hd = site('HDRelay', { problems: ['cam-a: player g1 returns 404'], notes: ['context'] });
    const { markdown, drift } = renderReport([dv, hd], AT);
    expect(drift).toBe(true);
    expect(markdown.split('\n')[0]).toBe('# Cam drift: drift at Deer Valley, HDRelay');
    expect(markdown).toContain('  - on the page, not in config: `new1` ("Ontario Snowstake" -> slot dv-stake)');
    expect(markdown).toContain('  - in config, not on the page: `old1` (dv-stake)');
    expect(markdown).toContain('- **cam-a: player g1 returns 404**');
    expect(markdown).toContain('- note: context');
  });

  it('a subset check drifts only on page values missing from config', () => {
    const udot = (live: string[]) =>
      site('UDOT', { checks: [{ what: 'Cctv ids', expected: ['1', '2', '3'], live, subset: true }] });
    expect(renderReport([udot(['1', '2'])], AT).drift).toBe(false);
    const { markdown, drift } = renderReport([udot(['1', '9'])], AT);
    expect(drift).toBe(true);
    expect(markdown).toContain('- Cctv ids: 2 on the page, 1 of them in config');
  });
});
