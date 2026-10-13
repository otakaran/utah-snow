// Registry integrity (spec §4 intro): every cross-reference between config/ files resolves, and the tracker
// migration repeats TRIP literally. Pure: reads config/ and migrations/0002_tracker.sql only.
import { describe, expect, it } from 'vitest';
import * as bases from '../../config/bases.ts';
import * as cams from '../../config/cams/index.ts';
import * as ikon from '../../config/ikon.ts';
import * as parking from '../../config/parking.ts';
import * as resorts from '../../config/resorts.ts';
import * as roads from '../../config/roads.ts';
import * as schedule from '../../config/schedule.ts';
import * as site from '../../config/site.ts';
import * as strategy from '../../config/strategy.ts';
import * as youtube from '../../config/youtube.ts';
import trackerSql from '../../migrations/0002_tracker.sql?raw';
import { daysBetween } from './time.ts';
import type { CamDef, ResortId } from './types.ts';

const { RESORTS, RESORT_IDS, SNOTEL, UAC_ZONES } = resorts;
const { CORRIDORS, RESORT_ROAD_CAMS } = roads;
const CAMS: readonly CamDef[] = cams.CAMS;
const camIds = new Set(CAMS.map((c) => c.id));

/** Every string inside a value (RegExp sources included), walking arrays and object values. */
function strings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (v instanceof RegExp) out.push(v.source);
  else if (Array.isArray(v)) for (const x of v) strings(x, out);
  else if (v !== null && typeof v === 'object') for (const x of Object.values(v)) strings(x, out);
  return out;
}

const missing = (ids: Iterable<string>, known: Set<string>) => [...ids].filter((id) => !known.has(id));
const udotIds = new Set(cams.UDOT_CAMS.map((c) => c.id)); // config/cams UDOT CamDefs (A.7)

describe('resorts', () => {
  it('RESORT_IDS is the RESORTS key order (Open-Meteo index)', () => {
    expect(Object.keys(RESORTS)).toEqual([...RESORT_IDS]);
  });

  it.each(RESORT_IDS)('%s has cams, NWS grids, UAC zone, parking, cap group and corridor', (id: ResortId) => {
    const r = RESORTS[id];
    expect(CAMS.some((c) => c.resort === id)).toBe(true);
    for (const p of [r.nws.base, r.nws.summit]) {
      expect(p.grid).toMatch(/^SLC\/\d+,\d+$/);
      expect(p.zone).toMatch(/^UTZ\d{3}$/);
    }
    expect(UAC_ZONES).toHaveProperty(String(r.uacZone));
    expect(parking.PARKING[id]).toBeDefined();
    expect((ikon.CAP_GROUPS[r.capGroup].resorts as readonly string[]).includes(id)).toBe(true);
    expect(r.skiersOnly).toBe((ikon.SKIERS_ONLY as readonly string[]).includes(id));
    expect(CORRIDORS[r.corridor]).toBeDefined();
    expect(RESORT_ROAD_CAMS[id].length).toBeGreaterThan(0);
    expect(strategy.POWDER_MULT[id]).toBeGreaterThan(0);
    for (const t of [r.snotel.primary, r.exceedanceStation, ...('secondary' in r.snotel ? [r.snotel.secondary] : [])]) {
      expect(SNOTEL).toHaveProperty([t]);
    }
    for (const b of Object.keys(bases.BASES) as (keyof typeof bases.BASES)[]) {
      expect(bases.DRIVE[b][id].min).toBeGreaterThan(0);
    }
  });

  it('cap groups cover each resort exactly once', () => {
    const covered = Object.values(ikon.CAP_GROUPS).flatMap((g) => [...g.resorts]);
    expect(covered.sort()).toEqual([...RESORT_IDS].sort());
  });
});

describe('cams', () => {
  it('ids are unique and every UDOT cam is in CAMS', () => {
    expect(camIds.size).toBe(CAMS.length);
    expect(missing(udotIds, camIds)).toEqual([]);
  });

  it('each resort has exactly one hero', () => {
    for (const id of RESORT_IDS) expect(CAMS.filter((c) => c.resort === id && c.hero)).toHaveLength(1);
  });

  it('fallback and timelapse.source reference existing cams', () => {
    const refs = CAMS.flatMap((c) => [...(c.fallback ?? []), ...(c.timelapse.source ? [c.timelapse.source] : [])]);
    expect(missing(refs, camIds)).toEqual([]);
  });
});

describe('youtube', () => {
  const slots = Object.values(youtube.SLOTS).flat();

  it('slot regexes compile and every slot cam exists once', () => {
    for (const s of slots) expect(() => new RegExp(s.re.source, s.re.flags)).not.toThrow();
    const ids = slots.map((s) => s.cam);
    expect(new Set(ids).size).toBe(ids.length);
    expect(missing(ids, camIds)).toEqual([]);
  });
});

describe('roads', () => {
  it('briefingCams, vmsCams and RESORT_ROAD_CAMS exist among the UDOT CamDefs', () => {
    const refs = [
      ...Object.values(CORRIDORS).flatMap((c) => [...c.briefingCams, ...('vmsCams' in c ? c.vmsCams : [])]),
      ...Object.values(RESORT_ROAD_CAMS).flat(),
    ];
    expect(missing(refs, udotIds)).toEqual([]);
  });

  it('RESORT_ROAD_CAMS lists every UDOT cam', () => {
    expect(new Set(Object.values(RESORT_ROAD_CAMS).flat())).toEqual(udotIds);
  });

  it('sign rule and baselines use travel signs of their corridor', () => {
    const { cottonwood } = bases.SIGN_RULE;
    for (const s of [cottonwood.north, cottonwood.south]) {
      expect(CORRIDORS.lcc.signs.travel).toContain(s);
      expect(CORRIDORS.bcc.signs.travel).toContain(s);
    }
    expect(CORRIDORS.parleys.signs.travel).toContain(bases.SIGN_RULE['deer-valley']);
    for (const b of bases.SIGN_BASELINES) expect(CORRIDORS[b.corridor].signs.travel).toContain(b.sign);
  });
});

describe('strategy', () => {
  it('exceedance rows match the ladder and never increase', () => {
    for (const row of [...Object.values(strategy.STRATEGY.exceedance), strategy.EXCEEDANCE_DISPLAY.solitude]) {
      expect(row).toHaveLength(strategy.STRATEGY.ladder.length);
      for (let i = 1; i < row.length; i++) expect(row[i]).toBeLessThanOrEqual(row[i - 1] ?? 1);
    }
  });
});

describe('trip', () => {
  it('TRIP.days matches the date range', () => {
    expect(daysBetween(ikon.TRIP.start, ikon.TRIP.end) + 1).toBe(ikon.TRIP.days);
  });

  it('migrations/0002_tracker.sql repeats the TRIP dates literally', () => {
    expect(trackerSql).toContain(`'${ikon.TRIP.start}'`);
    expect(trackerSql).toContain(`'${ikon.TRIP.end}'`);
  });
});

it('no config string carries an API key parameter', () => {
  const all = [bases, cams, ikon, parking, resorts, roads, schedule, site, strategy, youtube].flatMap((m) =>
    strings(m),
  );
  expect(all.length).toBeGreaterThan(500);
  expect(all.filter((s) => /[?&]key=/.test(s))).toEqual([]);
});
