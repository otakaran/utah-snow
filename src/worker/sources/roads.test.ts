import { describe, expect, it } from 'vitest';
import { localHM } from '../../shared/time.ts';
import type { RoadStatus } from '../../shared/types.ts';
import inseason1205 from './fixtures/roads/20251205-inseason.json?raw';
import inseason0105 from './fixtures/roads/20260105-inseason.json?raw';
import inseason0110 from './fixtures/roads/20260110-inseason.json?raw';
import guardsmanJson from './fixtures/roads/20261012-guardsman.json?raw';
import liveJson from './fixtures/roads/20261012-live.json?raw';
import syntheticJson from './fixtures/roads/roads-synthetic.json?raw';
import type { RoadsRaw } from './roads/raw.ts';
import { roads } from './roads.ts';
import { ValidationError } from './types.ts';

const CC = 'https://cottonwoodcanyons.udot.utah.gov';
const WB = 'https://wasatchback.udot.utah.gov';
const OV = 'https://ogdenvalley.udot.utah.gov';
type Post = { id: number; date_gmt: string };
const ms = (iso: string) => Date.parse(iso);
const live = (): RoadsRaw => JSON.parse(liveJson) as RoadsRaw;
const posts = (json: string): Post[] => (JSON.parse(json) as { posts: Post[] }).posts;
const guardsman = JSON.parse(guardsmanJson) as Post[];
/** A raw with only WP feeds (lists failed), as the parse gate allows. */
const wpOnly = (wp: Partial<Record<string, unknown[]>>): RoadsRaw => ({
  keyed: false,
  wp: { [CC]: [], [WB]: [], [OV]: [], ...wp },
  conditions: null,
  passes: null,
  signs: null,
  traffic: null,
  snowbird: { roads: null, parking: null, alerts: null },
  brighton: null,
  errors: {},
});
const run = (raw: RoadsRaw, nowIso: string, prev: Record<string, unknown> = {}) =>
  roads.parse(raw, { now: ms(nowIso), prev }).rows as Record<string, RoadStatus>;
const upTo = (list: Post[], iso: string) => list.filter((p) => ms(`${p.date_gmt}Z`) <= ms(iso));

describe('roads: live 2026-10-12 (off-season)', () => {
  const rows = run(live(), '2026-10-13T02:10:00Z');

  it('writes the four corridor rows, all open with no traction law', () => {
    expect(Object.keys(rows)).toEqual(['roads:lcc', 'roads:bcc', 'roads:parleys', 'roads:snowbasin']);
    for (const r of Object.values(rows)) expect([r.state, r.tractionLaw]).toEqual(['open', false]);
    expect(rows['roads:lcc']?.headline).toBe('No active UDOT alerts');
    expect(rows['roads:bcc']?.headline).toBe('Last UDOT update 10h ago');
  });

  it('BCC keeps the Guardsman-only post as latestPost (info) and guardsman text', () => {
    const bcc = rows['roads:bcc'];
    expect(bcc?.latestPost).toMatchObject({ id: 13271, state: null, site: 'cottonwoodcanyons.udot.utah.gov' });
    expect(bcc?.guardsman).toMatch(/^Guardsman Pass: .*9:30pm/);
    expect(rows['roads:lcc']?.guardsman).toBeNull();
  });

  it('reads segments, the pass rwisInfo and canyon-keyed travel times', () => {
    const lcc = rows['roads:lcc'];
    expect(lcc?.segments.map((s) => [s.name, s.roadCondition, s.restriction])).toEqual([
      ['SR-210 Mouth of Little Cottonwood to SR-190', 'Dry', 'none'],
      ['SR-210 Upper Little Cottonwood Canyon', 'Dry', 'none'],
    ]);
    expect(lcc?.segments[0]?.at).toBe('2026-10-13T01:47:26.000Z');
    expect(lcc?.pass).toEqual({
      name: 'SR-210 Little Cottonwood Canyon',
      ...{ airF: 34, windMph: 0, gustMph: 4, surfaceF: 37, surface: 'Wet', visMi: 3.51 },
    });
    expect(lcc?.signs.find((s) => s.id === '6019')?.travel).toEqual([
      { dest: 'LITTLE COTTONWOOD CANYON TOP', min: 23 },
    ]);
    expect(rows['roads:bcc']?.signs.find((s) => s.id === '6040')?.travel).toEqual([
      { dest: 'BIG COTTONWOOD CANYON TOP', min: 33 },
    ]);
    const parleys = rows['roads:parleys'];
    expect(parleys?.signs.find((s) => s.id === '6014')?.travel[0]).toEqual({ dest: 'TIME TO PARK CITY', min: 15 });
    expect(parleys?.pass).toMatchObject({ airF: 42, surfaceF: null, surface: null });
  });

  it('Snowbasin: the I-84 Weber Canyon posts are one standing advisory chip, state open', () => {
    const sb = rows['roads:snowbasin'];
    expect(sb?.state).toBe('open');
    expect(sb?.advisories).toHaveLength(1);
    expect(sb?.advisories[0]).toMatchObject({ id: 'wp:12460', text: expect.stringMatching(/Weber Canyon Bridge/) });
  });

  it('records cross-checks; non-full construction events change nothing', () => {
    expect(rows['roads:lcc']?.crossChecks[0]).toEqual({ source: 'Snowbird SR-210', raw: 'open_wet', state: 'open' });
    expect(rows['roads:bcc']?.crossChecks.map((c) => c.source)).toEqual(['Brighton roads']);
    expect(rows['roads:bcc']?.advisories).toEqual([]);
  });

  it('carries signs from the previous row when a tick skips the full sign pull', () => {
    const raw = live();
    raw.signs = raw.signs?.slice(0, 3) ?? null; // the three targeted searches only
    const next = run(raw, '2026-10-13T02:20:00Z', { 'roads:parleys': rows['roads:parleys'] });
    expect(next['roads:parleys']?.signs.map((s) => s.id)).toEqual([
      '6014',
      '6036',
      '6075',
      '5991',
      '6032',
      '3395',
      '3685',
    ]);
    expect(run(raw, '2026-10-13T02:20:00Z')['roads:parleys']?.signs.map((s) => s.id)).toEqual(['6014', '6032']);
  });
});

describe('roads: 20261012-guardsman fixture (§5.6 expectations)', () => {
  const at = (ids: number[]) => wpOnly({ [CC]: guardsman.filter((p) => ids.includes(p.id)) });

  it('16:32:54Z alone -> BCC open with guardsman; with 07:50:41Z -> open', () => {
    const alone = run(at([13271]), '2026-10-12T17:00:00Z')['roads:bcc'];
    expect([alone?.state, alone?.guardsman?.startsWith('Guardsman Pass: ')]).toEqual(['open', true]);
    const both = run(at([13271, 13267]), '2026-10-12T17:00:00Z')['roads:bcc'];
    expect([both?.state, both?.latestPost?.id]).toEqual(['open', 13271]);
  });

  it('10/13 03:33Z "Road Closure Alert" heading of a Guardsman-only closure -> BCC open with the note', () => {
    const bcc = run(at([13276, 13273]), '2026-10-13T21:00:00Z')['roads:bcc'];
    expect([bcc?.state, bcc?.guardsman]).toEqual(['open', expect.stringMatching(/CLOSED Monday \(10\/12\) at 9:30pm/)]);
  });

  it('00:40:16Z alone -> uphill-restricted, eto UNKNOWN, reason weather', () => {
    const bcc = run(at([13255]), '2026-10-12T01:00:00Z')['roads:bcc'];
    expect([bcc?.state, bcc?.eto, bcc?.reason]).toEqual(['uphill-restricted', 'UNKNOWN', 'weather']);
    expect(run(at([13255]), '2026-10-12T01:00:00Z')['roads:lcc']?.state).toBe('open');
  });
});

describe('roads: in-season Wayback feeds', () => {
  it('2025-12-05 storm morning: traction law on both canyons; BCC delay post is overlaid by traction', () => {
    const rows = run(wpOnly({ [CC]: posts(inseason1205) }), '2025-12-05T15:00:00Z');
    expect([rows['roads:lcc']?.state, rows['roads:lcc']?.tractionLaw]).toEqual(['traction', true]);
    expect([rows['roads:bcc']?.state, rows['roads:bcc']?.tractionLaw]).toEqual(['traction', true]);
    expect(rows['roads:lcc']?.latestPost?.id).toBe(posts(inseason1205)[0]?.id);
  });

  it('2026-01-04 Wasatch Back: SR-224 traction law alert -> Parleys traction, gone 12 h later', () => {
    const list = posts(inseason0105);
    const evening = run(wpOnly({ [WB]: upTo(list, '2026-01-05T00:30:00Z') }), '2026-01-05T00:30:00Z');
    expect([evening['roads:parleys']?.state, evening['roads:parleys']?.tractionLaw]).toEqual(['traction', true]);
    const morning = run(wpOnly({ [WB]: list }), '2026-01-05T14:40:00Z')['roads:parleys'];
    expect([morning?.state, morning?.headline]).toEqual(['open', 'Last UDOT update 9m ago']);
  });

  it('2026-01-09 "Traction Law LIFTED" supersedes an earlier traction post', () => {
    const lifted = posts(inseason0110);
    const before = { ...(posts(inseason1205).find((p) => p.id === 11647) as Post), date_gmt: '2026-01-09T13:20:00' };
    const rows = run(wpOnly({ [CC]: [...lifted, before] }), '2026-01-09T15:30:00Z');
    expect([rows['roads:lcc']?.state, rows['roads:lcc']?.tractionLaw]).toEqual(['open', false]);
    expect(rows['roads:bcc']?.latestPost?.state).toBe('open');
  });
});

describe('roads: synthetic keyed storm morning (2026-02-19)', () => {
  const syn = (): RoadsRaw => JSON.parse(syntheticJson) as RoadsRaw;

  it('LCC: scheduled closure passed -> closed (avalanche, eto, closesAt), escalations recorded', () => {
    const lcc = run(syn(), '2026-02-19T16:30:00Z')['roads:lcc'];
    expect([lcc?.state, lcc?.reason, lcc?.eto, lcc?.tractionLaw]).toEqual(['closed', 'avalanche', '8:30AM', true]);
    expect(lcc?.closesAt && localHM(lcc.closesAt)).toBe('00:30');
    expect(lcc?.parkingFull).toEqual(['snowbird']);
    expect(lcc?.crossChecks.filter((c) => c.state === 'closed').map((c) => c.source)).toEqual([
      'UDOT event',
      'UDOT sign 3687',
      'Snowbird SR-210',
    ]);
    expect(lcc?.signs.map((s) => s.id)).toEqual(['6019', '3687']); // keyed: signs without a known Id are skipped
    expect(lcc?.pass).toMatchObject({ airF: 18, gustMph: 31, visMi: 0.4, surface: 'Snow/Ice Warning' });
  });

  it('LCC: likely-interlodge note at night; a Snowbird interlodge alert escalates', () => {
    const night = run(syn(), '2026-02-19T08:00:00Z')['roads:lcc'];
    expect(night?.headline).toMatch(/Interlodge possible – check x\.com\/altacentral$/);
    const raw = syn();
    raw.snowbird.alerts = [{ title: 'Interlodge', message: 'Interlodge in effect at Snowbird until further notice' }];
    expect(run(raw, '2026-02-19T16:30:00Z')['roads:lcc']?.state).toBe('interlodge');
  });

  it('BCC: crash post overlaid by traction; Snowbasin: keyed roadwork closure becomes an advisory', () => {
    const rows = run(syn(), '2026-02-19T16:30:00Z');
    const bcc = rows['roads:bcc'];
    expect([bcc?.state, bcc?.tractionLaw, bcc?.reason, bcc?.latestPost?.state]).toEqual([
      'traction',
      true,
      'crash',
      'delays',
    ]);
    expect(bcc?.parkingFull).toEqual(['solitude']);
    expect(bcc?.signs[0]?.travel).toEqual([{ dest: 'BIG COTTONWOOD CANYON TOP', min: 41 }]);
    expect(rows['roads:snowbasin']?.state).toBe('open');
    expect(rows['roads:snowbasin']?.advisories.map((a) => a.id)).toEqual(['udot-event:40002']);
  });

  it('a failed WP feed keeps the previous state and says so', () => {
    const prev = run(syn(), '2026-02-19T16:30:00Z');
    const raw = syn();
    raw.wp[CC] = null;
    raw.errors['wp:cottonwoodcanyons.udot.utah.gov'] = 'BlockedError: blocked';
    const lcc = run(raw, '2026-02-19T16:40:00Z', { 'roads:lcc': prev['roads:lcc'] })['roads:lcc'];
    expect([lcc?.state, lcc?.eto, lcc?.latestPost?.id]).toEqual(['closed', '8:30AM', 90004]);
    expect(lcc?.headline).toMatch(/\(UDOT feed unavailable\)$/);
    expect(lcc?.crossChecks[0]).toEqual({ source: 'UDOT WP', raw: 'BlockedError: blocked', state: 'unknown' });
    const cold = run(raw, '2026-02-19T16:40:00Z'); // no prev: unknown base, escalation still applies
    expect([cold['roads:lcc']?.state, cold['roads:bcc']?.state, cold['roads:bcc']?.tractionLaw]).toEqual([
      'closed',
      'unknown',
      true,
    ]);
  });
});

describe('roads: validation gate', () => {
  it('throws ValidationError when no WP feed and no UDOT list passes', () => {
    const raw = wpOnly({});
    raw.wp = { [CC]: '<html>Just a moment</html>', [WB]: null, [OV]: { code: 'rest_forbidden' } };
    raw.conditions = [{ recordsTotal: 0, recordsFiltered: 0, data: [] }];
    expect(() => run(raw, '2026-10-12T17:00:00Z')).toThrow(ValidationError);
    expect(() => roads.parse('garbage' as unknown as RoadsRaw, { now: 0, prev: {} })).toThrow(ValidationError);
  });
});
