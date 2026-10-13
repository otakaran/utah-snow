// Alta resort report (spec §5.4 'resort:alta', §5.5, Appendix B 'alta'): the window.Alta JSON embedded in
// /lift-terrain-status. Job and row 'resort:alta'. nginx, no WAF, no headers needed. 404 and redirect pages still
// embed `conditions`, so the gate is HTTP 200 (redirects are not followed) plus liftStatus.lifts[].
// 48h/72h/7d use prev['alta:weather'] (days[] from alta-weather.ts) when the dispatcher supplies it (§5.5 fallback).
import { num, range } from '../../shared/num.ts';
import { localDate, localHM } from '../../shared/time.ts';
import type { ResortSnapshot } from '../../shared/types.ts';
import { readAlerts } from './alta/alerts.ts';
import { altaJson, arr, type Obj, obj, str } from './alta/extract.ts';
import { type Clock, gateList, liftList } from './alta/lifts.ts';
import { historyOf, snowNumbers } from './alta/snow.ts';
import { isoAt, stampIso } from './alta/stamp.ts';
import { type FetchCtx, type Output, type ParseCtx, type Source, ValidationError } from './types.ts';

export const ALTA_URL = 'https://www.alta.com/lift-terrain-status';
const ROW = 'resort:alta';
const WEATHER_ROW = 'alta:weather';
// Lifts running on or after this local date open the season (all summer lift operations have ended by then).
export const SEASON_FROM = '2026-11-01';

const temp = (v: unknown) => range(num(v), -60, 110);

/** Unique runs (they repeat across lifts) flagged groomed. */
function groomedRuns(ls: Obj): number {
  const ids = new Set<string>();
  for (const l of arr(ls.lifts)) {
    for (const r of arr(obj(l)?.runs)) {
      const run = obj(r);
      if (run?.groomed === true) ids.add(String(run.id ?? run.name));
    }
  }
  return ids.size;
}

export function parseAlta(html: string, ctx: ParseCtx): Output {
  const root = altaJson(String(html ?? ''));
  const ls = obj(root.liftStatus);
  const flags = obj(root.seasonal);
  const c = obj(root.conditions);
  if (!ls || !flags || !c) throw new ValidationError('alta: liftStatus, seasonal or conditions missing');
  const winter = flags.is_winter === true;
  const clock: Clock = { hm: localHM(ctx.now), today: localDate(ctx.now), winter };
  const list = liftList(ls, clock);
  if (list.length === 0) throw new ValidationError('alta: liftStatus.lifts[] is empty');

  const prev = obj(ctx.prev[ROW]);
  const count = (s: string) => list.filter((l) => l.state === s).length;
  const lifts = { open: count('open'), hold: count('hold'), scheduled: count('scheduled'), total: list.length, list };
  const running = lifts.open + lifts.hold > 0;
  const openedAt =
    str(prev?.seasonOpenedAt) ?? (winter && running && clock.today >= SEASON_FROM ? isoAt(ctx.now) : null);
  const preseason = !openedAt || !winter;
  const season: ResortSnapshot['season'] = preseason
    ? 'preseason'
    : running || lifts.scheduled > 0
      ? 'open'
      : 'closed-for-day';
  const runs = obj(obj(root.operations)?.runs);
  const al = readAlerts(root.alerts);
  const row: ResortSnapshot = {
    id: 'alta',
    season,
    seasonOpenedAt: openedAt,
    operatingToday: season !== 'preseason',
    snow: snowNumbers(root, ctx.now, prev?.snow, historyOf(ctx.prev[WEATHER_ROW]), preseason),
    weather: {
      baseTempF: temp(c.base_temp), // Base 8,560 ft
      midTempF: temp(c.mid_temp), // Mid Mountain 9,662 ft
      summitTempF: temp(c.top_temp), // Top of Collins 10,443 ft
      summitWindMph: range(num(c.wind_speed), 0, 200),
      summitGustMph: null, // window.Alta has no gust field; gusts come from obs (§5.5 weather resolution)
      windDir: str(c.wind_direction_text),
      sky: str(c.sky_cover),
      obsAt: stampIso(c.dated_at, root.DST),
      src: 'alta',
    },
    lifts,
    trails: {
      open: range(num(runs?.open), 0, 500),
      total: range(num(runs?.total), 0, 500),
      groomed: preseason ? null : groomedRuns(ls), // off-season runs keep April's groomed flags
    },
    gates: gateList(ls, clock),
    parking: al.parking,
    alerts: al.alerts,
  };
  if (al.roadHint) row.roadHint = al.roadHint;
  return { rows: { [ROW]: row } };
}

export const alta: Source<string> = {
  id: ROW,
  staleAfterMin: 40,
  rows: [ROW],
  // One GET; redirects are not followed (follow: false), so the worst case is exactly 1.
  maxSubrequests: () => 1,
  probes: [{ hostId: 'alta', url: ALTA_URL }],
  async fetch(ctx: FetchCtx): Promise<string> {
    // fetchx throws HttpError on >= 400 (a 404 page still embeds conditions) and BlockedError on a challenge.
    const res = await ctx.fetch<string>(ALTA_URL, {
      headers: { Accept: 'text/html' },
      follow: false,
      timeoutMs: 10_000,
    });
    if (res.status !== 200) throw new Error(`alta: HTTP ${res.status} (redirects are not followed)`);
    return res.data;
  },
  parse: parseAlta,
};
