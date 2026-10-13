// Snowbasin resort report: one server-rendered HTML page, regex-scraped (spec §5.4 'resort:snowbasin', §5.5).
// Job and row id 'resort:snowbasin'. 397 KB off-season, ~700 KB in season; every regex runs on a pre-sliced scope.
import { range } from '../../shared/num.ts';
import type { LiftStatus, ParkingNow, ResortSnapshot, SnowNumbers, WeatherNow } from '../../shared/types.ts';
import { readLifts, readTrails } from './snowbasin/lifts.ts';
import {
  type CondRow,
  type Page,
  readAlerts,
  readConditions,
  readCount,
  readNarrative,
  readParking,
  readSnow,
  type SnowRead,
  scope,
} from './snowbasin/scan.ts';
import { HISTORY_KEY, isoLocal, isToday, multiDay, seasonOf, stampMs } from './snowbasin/season.ts';
import { type FetchCtx, type Output, type ParseCtx, type Source, ValidationError } from './types.ts';

export const SNOWBASIN_URL = 'https://www.snowbasin.com/the-mountain/mountain-report/'; // keep the trailing slash
const ID = 'resort:snowbasin';
const LIFTS_EXPECTED = 13; // 2025/26 lift count; the gate allows ± 2 (§5.2)
const LIFTS_SLACK = 2;
const NEW_MAX = 80; // inches; plausibility gates for the snow numbers
const DEPTH_MAX = 400;
const SEASON_MAX = 1000;

function validate(page: Page, snow: SnowRead, lifts: LiftStatus[]): void {
  if (page.season !== 'winter') return;
  if (!('24 hours' in snow.values) || !('Base' in snow.values)) {
    throw new ValidationError('snowbasin: Snow Report labels missing in winter');
  }
  if (Math.abs(lifts.length - LIFTS_EXPECTED) > LIFTS_SLACK) {
    throw new ValidationError(
      `snowbasin: ${lifts.length} lifts in winter (expected ${LIFTS_EXPECTED} ± ${LIFTS_SLACK})`,
    );
  }
}

function snowNumbers(
  snow: SnowRead,
  preseason: boolean,
  reportMs: number | null,
  ctx: ParseCtx,
  textLine: string | null,
): SnowNumbers {
  const v = (label: keyof SnowRead['values'], max: number) => (preseason ? null : range(snow.values[label], 0, max));
  const new24hIn = v('24 hours', NEW_MAX);
  const multi = preseason ? { new48hIn: null, new72hIn: null } : multiDay(new24hIn, reportMs, ctx.prev[HISTORY_KEY]);
  return {
    overnightIn: v('Overnight', NEW_MAX),
    new12hIn: null,
    new24hIn,
    ...multi,
    new7dIn: v('7 days', NEW_MAX * 4),
    stormTotalIn: null,
    seasonTotalIn: v('Season', SEASON_MAX),
    baseDepthIn: v('Base', DEPTH_MAX),
    reportAt: reportMs === null ? null : isoLocal(reportMs),
    reportIsToday: isToday(reportMs, ctx.now),
    area: 'primary',
    surface: null,
    text: textLine,
  };
}

function weatherNow(cond: Record<string, CondRow>): WeatherNow {
  const base = cond.Base;
  const mid = cond['Mid Mountain'];
  return {
    baseTempF: base?.tempF ?? null,
    midTempF: mid?.tempF ?? null,
    summitTempF: null, // no summit sensor; summit wind and gust come from obs (§5.5 weather resolution)
    summitWindMph: null,
    summitGustMph: null,
    windDir: mid?.windDir ?? base?.windDir ?? null,
    sky: base?.sky ?? mid?.sky ?? null,
    obsAt: null, // the Conditions temperatures carry no timestamp
    src: 'snowbasin',
  };
}

function parking(main: string, preseason: boolean): ParkingNow {
  const pct = preseason ? null : readParking(main);
  return {
    state: 'unknown', // gauge semantics unverified (research open issue 3)
    raw: pct === null ? null : `${pct}% Full`,
    percentFull: pct,
    note: pct === null ? null : 'Snowbasin updates parking on winter weekends and holidays only',
  };
}

export function parseSnowbasin(raw: unknown, ctx: ParseCtx): Output {
  if (typeof raw !== 'string') throw new ValidationError('snowbasin: body is not text');
  const page = scope(raw);
  if (!page) throw new ValidationError('snowbasin: season flag or main report anchor missing');
  const snow = readSnow(page);
  const list = readLifts(page.main) ?? [];
  validate(page, snow, list);

  const prev = ctx.prev[ID] as Partial<ResortSnapshot> | undefined;
  const state = seasonOf(page.season, list, prev, ctx.now);
  const preseason = state.season === 'preseason';
  const reportMs = stampMs(snow.stamp, ctx.now);
  const trails = readTrails(page.main);
  const trailCount = readCount(page.main, 'Trails');
  const count = (s: LiftStatus['state']) => list.filter((l) => l.state === s).length;

  const row: ResortSnapshot = {
    id: 'snowbasin',
    ...state,
    snow: snowNumbers(snow, preseason, reportMs, ctx, readNarrative(page.head)),
    weather: weatherNow(readConditions(page.main)),
    lifts: { open: count('open'), hold: count('hold'), scheduled: count('scheduled'), total: list.length, list },
    trails: {
      open: trailCount && trailCount.total > 0 ? trailCount.open : null, // the summary, never the row tally (§5.5)
      total: trailCount && trailCount.total > 0 ? trailCount.total : null,
      groomed: trails.groomed,
    },
    gates: trails.gates,
    parking: parking(page.main, preseason),
    alerts: readAlerts(page.head),
  };
  return { rows: { [ID]: row } };
}

export const snowbasin: Source<string> = {
  id: ID,
  staleAfterMin: 40,
  rows: [ID],
  // The canonical URL answers 200 directly; redirects are not followed, so the worst case is one request.
  maxSubrequests: () => 1,
  probes: [{ hostId: 'snowbasin', url: SNOWBASIN_URL }],
  async fetch(ctx: FetchCtx): Promise<string> {
    const res = await ctx.fetch<string>(SNOWBASIN_URL, {
      headers: { Accept: 'text/html' },
      timeoutMs: 10_000,
      follow: false,
    });
    if (res.status !== 200) throw new Error(`snowbasin: HTTP ${res.status} (redirects are not followed)`);
    return res.data;
  },
  parse: parseSnowbasin,
};
