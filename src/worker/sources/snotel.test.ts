// Fixtures: live 2026-10-12; in-season = AWDB absolute range 2026-02-15 09:00..02-18 08:00 PST (Wayback has none).
import { describe, expect, it } from 'vitest';
import type { SnotelSeries } from '../../shared/types.ts';
import feb18 from './fixtures/snotel/20260218-inseason.json?raw';
import live from './fixtures/snotel/20261012-live.json?raw';
import { deriveDepth, median, SNOTEL_URL, snotel } from './snotel.ts';
import { type FetchCtx, type FetchX, ValidationError } from './types.ts';

const NOW = Date.UTC(2026, 9, 12, 20);
const parse = (raw: string) => snotel.parse(raw, { now: NOW, prev: {} }).rows.snotel as Record<string, SnotelSeries>;
const H = 3_600_000;
const T0 = Date.UTC(2026, 0, 10, 23); // 16:00 MST = 15:00 PST, an anchor hour

describe('snotel (NRCS AWDB hourly)', () => {
  it('requests the 7 C.3 stations with SNWD, WTEQ, TOBS for the last 72 h', () => {
    expect(SNOTEL_URL).toBe(
      'https://wcc.sc.egov.usda.gov/awdbRestApi/services/v1/data?stationTriplets=1308:UT:SNTL,766:UT:SNTL,' +
        '366:UT:SNTL,628:UT:SNTL,814:UT:SNTL,332:UT:SNTL,1300:UT:SNTL&elements=SNWD,WTEQ,TOBS&duration=HOURLY' +
        '&beginDate=-72&endDate=0',
    );
  });

  it('pre-season (live 2026-10-12): all 7 stations, ~0-1 in depth, absent WTEQ -> null, PST stamps -> UTC', () => {
    const s = parse(live);
    expect(Object.keys(s)).toHaveLength(7);
    expect(s['1308:UT:SNTL']).toEqual({
      triplet: '1308:UT:SNTL',
      name: 'Atwater',
      elevFt: 8750,
      snwdIn: 1,
      sweIn: 0,
      tempF: 32.9,
      snwdChange24In: 0,
      snwdSince16In: 0,
      at: '2026-10-13T01:00:00.000Z', // '2026-10-12 17:00' PST
    });
    expect(s['628:UT:SNTL']?.sweIn).toBeNull(); // WTEQ filtered as suspect off-season
    expect(s['1300:UT:SNTL']).toMatchObject({ sweIn: null, snwdIn: 0, snwdChange24In: -1, tempF: 36 });
    expect(s['766:UT:SNTL']).toMatchObject({ snwdIn: 0, sweIn: 0.9, snwdSince16In: 0 }); // series has hour gaps
    for (const v of Object.values(s)) expect(v.snwdIn).toBeLessThanOrEqual(1);
  });

  it('in season (storm night ending 2026-02-18 08:00 PST): medians since 16:00 MST and over 24 h', () => {
    const s = parse(feb18);
    expect(s['1308:UT:SNTL']).toMatchObject({
      snwdIn: 61,
      sweIn: 19.6,
      tempF: 19.8,
      snwdSince16In: 7,
      snwdChange24In: 10,
      at: '2026-02-18T16:00:00.000Z',
    });
    expect(s['766:UT:SNTL']).toMatchObject({ name: 'Snowbird', snwdIn: 57, snwdSince16In: 7, snwdChange24In: 12 });
    expect(s['366:UT:SNTL']).toMatchObject({ snwdIn: 47, snwdSince16In: 7, snwdChange24In: 12, sweIn: 13.2 });
    expect(s['628:UT:SNTL']).toMatchObject({ snwdIn: 32, snwdSince16In: 4, snwdChange24In: 6 });
    expect(s['814:UT:SNTL']).toMatchObject({ snwdIn: 52, snwdSince16In: 8, snwdChange24In: 12 });
    expect(s['332:UT:SNTL']).toMatchObject({ elevFt: 7690, snwdIn: 39, snwdSince16In: 1, snwdChange24In: 5 });
    expect(s['1300:UT:SNTL']).toMatchObject({ snwdIn: 45, snwdSince16In: 3, snwdChange24In: 7 });
  });

  it('derivations index by timestamp, use medians and go null with < 2 values on a side', () => {
    expect(median([5, 1, 3])).toBe(3);
    expect(median([2, 3])).toBe(2.5);
    // 'h:v h:v ...' = SNWD v inches at T0 + h hours
    const pts = (s: string) =>
      s.split(' ').map((hv) => ({ t: T0 + Number(hv.split(':')[0]) * H, v: Number(hv.split(':')[1]) }));
    // anchor window 14:00-16:00 PST = h -1..1; newest at h 15 (06:00 PST next day)
    const full = pts('-1:40 0:40 1:41 13:50 14:47 15:52');
    expect(deriveDepth(full)).toEqual({ now: 50, since16: 10, change24: null });
    const gap = pts('-1:40 1:42 13:50 14:51 15:52'); // 15:00 PST missing
    expect(deriveDepth(gap).since16).toBe(10);
    const thin = pts('0:40 13:50 14:51 15:52'); // one anchor value
    expect(deriveDepth(thin).since16).toBeNull();
    // newest exactly 1 h after an anchor: that anchor counts (at least 1 h older)
    expect(deriveDepth(pts('-1:10 0:11 1:12')).since16).toBe(0);
    const day = pts('-24:30 -23:30 -22:31 -1:40 0:41 1:41');
    expect(deriveDepth(day)).toMatchObject({ now: 41, change24: 11 });
    expect(deriveDepth([])).toEqual({ now: null, since16: null, change24: null });
  });

  it('drops -7999 sentinels and implausible values', () => {
    const raw = JSON.stringify([
      {
        stationTriplet: '766:UT:SNTL',
        data: [
          {
            stationElement: { elementCode: 'SNWD' },
            values: [
              { date: '2026-01-10 05:00', value: 60 },
              { date: '2026-01-10 06:00', value: -7999 },
              { date: '2026-01-10 07:00', value: 999 },
            ],
          },
        ],
      },
    ]);
    expect(parse(raw)['766:UT:SNTL']).toMatchObject({ snwdIn: 60, at: '2026-01-10T13:00:00.000Z', sweIn: null });
  });

  it('validation gate: garbage, an empty array or no SNWD anywhere throw ValidationError', () => {
    expect(() => parse('<html>503</html>')).toThrow(ValidationError);
    expect(() => parse('[]')).toThrow(ValidationError);
    expect(() => parse('{"error":"x"}')).toThrow(ValidationError);
    const noSnwd = [{ stationTriplet: '766:UT:SNTL', data: [{ stationElement: { elementCode: 'TOBS' }, values: [] }] }];
    expect(() => parse(JSON.stringify(noSnwd))).toThrow(/no station has SNWD/);
  });

  it('fetch: one GET, redirects not followed; maxSubrequests matches', async () => {
    const calls: { url: string; follow?: boolean }[] = [];
    let status = 200;
    const fx = (async (url: string, opts?: { follow?: boolean }) => {
      calls.push({ url, follow: opts?.follow });
      return { status, url, headers: new Headers(), data: live, bytes: live.length, blocked: false, wallMs: 1 };
    }) as unknown as FetchX;
    const ctx = { fetch: fx } as FetchCtx;
    await expect(snotel.fetch(ctx)).resolves.toBe(live);
    expect(calls).toEqual([{ url: SNOTEL_URL, follow: false }]);
    expect(snotel.maxSubrequests(ctx)).toBe(1);
    expect(snotel.maxSubrequests(ctx)).toBe(calls.length);
    status = 302;
    await expect(snotel.fetch(ctx)).rejects.toThrow(/HTTP 302/);
  });
});
