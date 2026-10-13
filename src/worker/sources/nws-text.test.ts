import { describe, expect, it } from 'vitest';
import type { Afd, NwsAlert } from '../../shared/types.ts';
import live from './fixtures/nws-text/20261012-live.json?raw';
import synthetic from './fixtures/nws-text/nws-text-synthetic.json?raw';
import { AFD_LINK, ALERTS_URL, afdSection, nwsText, parseAfd, tidyKeyMessages } from './nws-text.ts';
import { type FetchCtx, ValidationError } from './types.ts';

const NOW = Date.parse('2026-10-13T02:00:00Z');
const run = (raw: unknown) => {
  const rows = nwsText.parse(raw as never, { now: NOW, prev: {} }).rows;
  return { afd: rows['nws:afd'] as Afd, alerts: rows['nws:alerts'] as NwsAlert[] };
};

describe('nws-text (SLC AFD + active alerts)', () => {
  it('two GETs, alerts for the four zones', () => {
    expect(nwsText.maxSubrequests({} as FetchCtx)).toBe(2);
    expect(nwsText.rows).toEqual(['nws:afd', 'nws:alerts']);
    expect(ALERTS_URL).toBe('https://api.weather.gov/alerts/active?zone=UTZ105,UTZ108,UTZ110,UTZ111');
  });

  it('live 2026-10-12: AFD key messages unwrapped, one Winter Weather Advisory for UTZ111 (no season gate)', () => {
    const { afd, alerts } = run(JSON.parse(live));
    expect(afd).toMatchObject({
      id: 'c107fce0-47b6-406b-94a8-2d1da681ff87',
      issuedAt: '2026-10-12T20:44:00.000Z',
      url: AFD_LINK,
    });
    const lines = afd.keyMessages?.split('\n') ?? [];
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^- A Pacific Northwest low will be the dominant weather feature over the region/);
    expect(lines[2]).toMatch(/warming trend in temperatures through the weekend\.$/);
    expect(alerts).toEqual([
      {
        event: 'Winter Weather Advisory',
        severity: 'Moderate',
        headline:
          'Winter Weather Advisory issued October 12 at 1:51PM MDT until October 14 at 6:00AM MDT by NWS Salt Lake City UT',
        onset: '2026-10-13T12:00:00.000Z',
        ends: '2026-10-14T12:00:00.000Z',
        zones: ['UTZ111'],
      },
    ]);
  });

  it('in-season (synthetic, real 2026-02-16 AFD text): storm key messages, warning + advisory, zones filtered', () => {
    const { afd, alerts } = run(JSON.parse(synthetic));
    expect(afd.issuedAt).toBe('2026-02-16T23:17:00.000Z');
    expect(afd.keyMessages).toContain('- Expect broadly 1-2 feet of mountain snow through Wednesday');
    expect(afd.keyMessages?.split('\n')).toHaveLength(3);
    expect(alerts.map((a) => [a.event, a.zones])).toEqual([
      ['Winter Storm Warning', ['UTZ108', 'UTZ110', 'UTZ111']],
      ['Wind Advisory', ['UTZ105']],
    ]);
    expect(alerts[0]).toMatchObject({ onset: '2026-02-17T00:00:00.000Z', ends: '2026-02-19T12:00:00.000Z' });
  });

  it('AFD without KEY MESSAGES gives null; long key messages are capped at 1,200 chars', () => {
    const text = 'Area Forecast Discussion\n\n.SYNOPSIS...Dry.\n\n&&\n\n.SHORT TERM...Warm.\n&&\n';
    expect(
      parseAfd({ id: 'x', issuanceTime: '2026-10-12T20:44:00+00:00', productCode: 'AFD', productText: text }),
    ).toMatchObject({ keyMessages: null });
    expect(afdSection(text, 'SHORT TERM')?.trim()).toBe('Warm.');
    const long = tidyKeyMessages(`- ${'snow '.repeat(400)}\n- second`);
    expect(long).toHaveLength(1200);
    expect(long?.endsWith('…')).toBe(true);
  });

  it('validation gate: a non-AFD body or alerts without features[] throw ValidationError', () => {
    const good = JSON.parse(live) as { afd: unknown; alerts: unknown };
    expect(() => run({ afd: { id: 'x', productText: '<html>' }, alerts: good.alerts })).toThrow(ValidationError);
    expect(() => run({ afd: good.afd, alerts: { title: 'oops' } })).toThrow(ValidationError);
    expect(() => run('garbage')).toThrow(ValidationError);
  });
});
