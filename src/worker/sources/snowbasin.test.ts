// Fixtures: live 2026-10-12 (summer page); Wayback id_ snapshots 2025-12-01 (winter page before opening day),
// 2026-02-09 and 2026-03-01 (open). Each is trimmed to the slices parse() reads (header comment in the file).
// hold/scheduled/delayed/expected were never seen live (O10), so those tests edit the Feb 9 markup in place.
import { describe, expect, it } from 'vitest';
import type { ResortSnapshot } from '../../shared/types.ts';
import dec01 from './fixtures/snowbasin/20251201-inseason.html?raw';
import feb09 from './fixtures/snowbasin/20260209-inseason.html?raw';
import mar01 from './fixtures/snowbasin/20260301-inseason.html?raw';
import live from './fixtures/snowbasin/20261012-live.html?raw';
import { HISTORY_KEY } from './snowbasin/season.ts';
import { SNOWBASIN_URL, snowbasin } from './snowbasin.ts';
import { type FetchCtx, type FetchX, type PrevRows, ValidationError } from './types.ts';

const OPENED = { 'resort:snowbasin': { seasonOpenedAt: '2025-11-27T09:00:00-07:00' } };
const at = (iso: string) => Date.parse(iso);
const parse = (raw: string, now: string, prev: PrevRows = OPENED) =>
  snowbasin.parse(raw, { now: at(now), prev }).rows['resort:snowbasin'] as ResortSnapshot;
const FEB09 = '2026-02-09T19:10:06Z';
const lift = (r: ResortSnapshot, name: string) => r.lifts.list.find((l) => l.name === name);

/** Rewrites the status icon class of one row: lifts list a type icon first (nth 2), gate rows do not (nth 1). */
function setStatus(html: string, name: string, cls: string, nth = 2): string {
  let i = html.indexOf(`\n${name}\n`);
  for (let k = 0; k < nth; k++) i = html.indexOf('mc__icon mc__icon-', i + 1);
  i += 'mc__icon mc__icon-'.length;
  return html.slice(0, i) + cls + html.slice(html.indexOf('"', i));
}

describe('snowbasin: live summer page (2026-10-12)', () => {
  const r = parse(live, '2026-10-12T21:00:00Z', {});

  it('is pre-season with every snow number nulled (the dropdown still shows last April)', () => {
    expect(r).toMatchObject({ season: 'preseason', seasonOpenedAt: null, operatingToday: false });
    expect(r.snow).toMatchObject({
      overnightIn: null,
      new24hIn: null,
      new48hIn: null,
      new7dIn: null,
      seasonTotalIn: null,
      baseDepthIn: null,
      reportAt: '2026-04-27T10:00:00-06:00',
      reportIsToday: false,
    });
    expect(r.snow.text).toMatch(/^Fall is here and the mountain/);
  });

  it('reads live Conditions from the main report, not the header dropdown', () => {
    expect(r.weather).toMatchObject({ baseTempF: 39, midTempF: 37, sky: 'Thunderstorms', windDir: 'SE' });
    expect(r.weather.summitWindMph).toBeNull();
  });

  it('has no lift table, no trail tables, no counts, no parking and no alerts', () => {
    expect(r.lifts).toEqual({ open: 0, hold: 0, scheduled: 0, total: 0, list: [] });
    expect(r.trails).toEqual({ open: null, total: null, groomed: null });
    expect(r.gates).toEqual([]);
    expect(r.parking.percentFull).toBeNull();
    expect(r.alerts).toEqual([]);
  });

  it('stays pre-season on the summer page even after the season opened', () => {
    expect(parse(live, '2026-10-12T21:00:00Z').season).toBe('preseason');
  });
});

describe('snowbasin: in season', () => {
  it('2026-02-09: snow report, lifts with hours, counts, gates, weather, parking and the alert bar', () => {
    const r = parse(feb09, FEB09);
    expect(r).toMatchObject({ id: 'snowbasin', season: 'open', operatingToday: true });
    expect(r.snow).toMatchObject({
      overnightIn: 0,
      new24hIn: 0,
      new7dIn: 0,
      baseDepthIn: 39,
      seasonTotalIn: 74,
      stormTotalIn: null,
      reportAt: '2026-02-09T04:19:00-07:00',
      reportIsToday: true,
    });
    expect(r.lifts).toMatchObject({ open: 9, hold: 0, scheduled: 0, total: 13 });
    expect(lift(r, 'Allen Peak Tram')).toMatchObject({
      id: 'allen-peak-tram',
      state: 'closed',
      raw: 'Closed',
      opensAt: '09:00',
      closesAt: '15:30',
    });
    expect(lift(r, 'Needles Gondola')).toMatchObject({ state: 'open', closesAt: '16:00' });
    expect(r.trails).toEqual({ open: 69, total: 115, groomed: 2 }); // groomed: 2 trail rows kept in the fixture
    expect(r.gates).toHaveLength(18);
    expect(r.gates[0]).toEqual({ name: 'Flank Gate', state: 'open', note: null });
    expect(r.gates).toContainEqual({ name: "Lower Sister's Gate", state: 'closed', note: null });
    expect(r.weather).toMatchObject({ baseTempF: 32, midTempF: 26, windDir: 'E' });
    expect(r.weather.sky).toBe('Cloudy with Moderate/Heavy Snowfall');
    expect(r.parking).toMatchObject({ state: 'unknown', percentFull: 40, raw: '40% Full' });
    expect(r.alerts).toEqual([
      'John Paul and Allen Peak Tram Closed: Both the John Paul Lift and Allen Peak Tram will be closed today for maintenance.',
    ]);
    expect(r.snow.text).toMatch(/^Good Morning Riders!/);
  });

  it('2026-03-01: a report from the previous local day is not today', () => {
    const r = parse(mar01, '2026-03-01T07:54:18Z');
    expect(r.snow).toMatchObject({ baseDepthIn: 51, seasonTotalIn: 110, new7dIn: 2, reportIsToday: false });
    expect(r.snow.reportAt).toBe('2026-02-28T05:47:00-07:00');
    expect(r.lifts).toMatchObject({ open: 12, total: 13 });
    expect(lift(r, 'Wildflower Carpet')?.state).toBe('closed');
    expect(r.trails).toMatchObject({ open: 82, total: 115 });
    expect(r.gates.filter((g) => g.state === 'open')).toHaveLength(9);
  });

  it('2025-12-01 winter page before opening: pre-season without seasonOpenedAt, numbers once opened', () => {
    const pre = parse(dec01, '2025-12-01T07:31:12Z', {});
    expect(pre).toMatchObject({ season: 'preseason', operatingToday: false });
    expect(pre.snow.new24hIn).toBeNull();
    expect(pre.lifts).toMatchObject({ open: 0, total: 13 });
    expect(pre.gates.every((g) => g.state === 'closed')).toBe(true);
    expect(pre.trails).toEqual({ open: 0, total: 115, groomed: 0 });
    expect(pre.weather).toMatchObject({ baseTempF: 19, midTempF: 16, sky: 'Mostly Sunny' }); // no Lens card
    const opened = parse(dec01, '2025-12-01T07:31:12Z');
    expect(opened.season).toBe('closed-for-day');
    expect(opened.snow).toMatchObject({ new24hIn: 8, new7dIn: 8, baseDepthIn: 12, seasonTotalIn: 27 });
  });

  it('sets seasonOpenedAt on the first open lift on or after 2026-11-01, never before', () => {
    expect(parse(feb09, FEB09, {}).seasonOpenedAt).toBeNull();
    const r = parse(feb09, '2026-12-28T17:00:00Z', {});
    expect(r).toMatchObject({ season: 'open', seasonOpenedAt: '2026-12-28T10:00:00-07:00' });
  });

  it("infers the report year: 'Feb 09' read in Jan 2027 is Feb 2026", () => {
    expect(parse(feb09, '2027-01-02T12:00:00Z').snow.reportAt).toBe('2026-02-09T04:19:00-07:00');
  });

  it('sums 48/72 h from resort_history daily 24 h values, null without history', () => {
    const row = (date: string, v: number) => ({
      hour: `${date}T13`,
      payload: { snow: { reportAt: `${date}T05:00:00-07:00`, new24hIn: v } },
    });
    const prev = { ...OPENED, [HISTORY_KEY]: [row('2026-02-08', 3), row('2026-02-07', 2)] };
    expect(parse(feb09, FEB09, prev).snow).toMatchObject({ new24hIn: 0, new48hIn: 3, new72hIn: 5 });
    expect(parse(feb09, FEB09).snow).toMatchObject({ new48hIn: null, new72hIn: null });
  });

  it('falls back to the header dropdown when the main Snow Report block is missing', () => {
    const r = parse(feb09.replace('>Snow Report</h2>', '>Snow</h2>'), FEB09);
    expect(r.snow).toMatchObject({ new24hIn: 0, baseDepthIn: 39, seasonTotalIn: 74, reportIsToday: true });
  });
});

describe('snowbasin: legend-based status mapping (O10)', () => {
  it('maps hold, scheduled and delayed lift classes through the Lift Key legend', () => {
    let html = setStatus(feb09, 'Allen Peak Tram', 'hold');
    html = setStatus(html, 'John Paul Express', 'delayed');
    html = setStatus(html, 'Porcupine', 'scheduled');
    const r = parse(html, FEB09);
    expect(lift(r, 'Allen Peak Tram')).toMatchObject({ state: 'hold', raw: 'On Hold' });
    expect(lift(r, 'John Paul Express')).toMatchObject({ state: 'scheduled', raw: 'Delayed' });
    expect(lift(r, 'Porcupine')).toMatchObject({ state: 'scheduled', raw: 'Scheduled' });
    expect(r.lifts).toMatchObject({ open: 9, hold: 1, scheduled: 2, total: 13 });
  });

  it('uses a new legend entry, then the sr-only text, else closed with a note', () => {
    const legend = '<li class="mc__key">\n<span class="mc__icon mc__icon-wind"></span>\nWind Hold\n</li>\n';
    let html = feb09.replace('<li class="mc__key">', `${legend}<li class="mc__key">`);
    html = setStatus(html, 'Allen Peak Tram', 'wind');
    html = setStatus(html, 'Porcupine', 'x').replace('<span class="mc__icon mc__icon-x"></span>', '');
    html = setStatus(html, 'Becker', 'zzz').replace(/(\nBecker\n[\s\S]*?sr-only">)Lift Open/, '$1Unknown');
    const r = parse(html.replace(/(\nPorcupine\n[\s\S]*?sr-only">)Lift Closed/, '$1Lift Open'), FEB09);
    expect(lift(r, 'Allen Peak Tram')).toMatchObject({ state: 'hold', raw: 'Wind Hold', note: null });
    expect(lift(r, 'Porcupine')).toMatchObject({ state: 'open', raw: 'Lift Open' });
    expect(lift(r, 'Becker')).toMatchObject({ state: 'closed', note: "unmapped status 'Unknown'" });
  });

  it('maps expected and delayed gates to scheduled through the Trail Key legend', () => {
    const r = parse(setStatus(setStatus(feb09, 'Flank Gate', 'expected', 1), 'Tram Gate', 'delayed', 1), FEB09);
    expect(r.gates[0]).toEqual({ name: 'Flank Gate', state: 'scheduled', note: 'Expected' });
    expect(r.gates.find((g) => g.name === 'Tram Gate')).toMatchObject({ state: 'scheduled', note: 'Delayed' });
  });
});

describe('snowbasin: validation gate and fetch', () => {
  it('throws ValidationError on garbage, a missing anchor, or a winter page that fails §5.2', () => {
    const bad = (raw: unknown) => () => snowbasin.parse(raw as string, { now: at(FEB09), prev: {} });
    expect(bad('<html><body>Just text</body></html>')).toThrow(ValidationError);
    expect(bad({ not: 'html' })).toThrow(ValidationError);
    const noLabels = feb09.replaceAll('>24 hours<', '>Day<');
    expect(bad(noLabels)).toThrow(/Snow Report labels/);
    const rows = feb09.split('<tr>');
    expect(bad([...rows.slice(0, 6), ...rows.slice(12)].join('<tr>'))).toThrow(/lifts in winter/);
  });

  it('GETs the canonical URL once without following redirects', async () => {
    const calls: unknown[] = [];
    let status = 200;
    const fx = (async (url: string, opts: { follow?: boolean; timeoutMs?: number }) => {
      calls.push({ url, follow: opts.follow, timeoutMs: opts.timeoutMs });
      return { status, url, data: live };
    }) as unknown as FetchX;
    const ctx = { fetch: fx } as FetchCtx;
    await expect(snowbasin.fetch(ctx)).resolves.toBe(live);
    expect(calls).toEqual([{ url: SNOWBASIN_URL, follow: false, timeoutMs: 10_000 }]);
    expect(snowbasin.maxSubrequests(ctx)).toBe(1);
    expect(snowbasin.maxSubrequests(ctx)).toBe(calls.length);
    expect(snowbasin.probes).toEqual([{ hostId: 'snowbasin', url: SNOWBASIN_URL }]);
    status = 301;
    await expect(snowbasin.fetch(ctx)).rejects.toThrow(/HTTP 301/);
  });
});
