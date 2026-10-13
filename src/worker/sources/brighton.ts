// Brighton resort report from the Boyne FeedService (spec §5.4 'resort:brighton', §5.5, Appendix B 'brighton').
// Job and row 'resort:brighton'. The Azure APIM host needs no key, UA or Origin. A Cloudflare/Imperva challenge
// (headers or first 2 KB match fetchx BLOCKED_RE) makes fetchx throw BlockedError, so the row turns 'blocked' (O2).
// The feed has no temperature or wind: the client resolves Brighton weather from obs UTBTN/BRW (§5.5).
import { inches, num, range } from '../../shared/num.ts';
import { roadHintState } from '../../shared/road-hint.ts';
import { prevOpenedAt, reportIsToday, seasonState } from '../../shared/season.ts';
import { isoToMs } from '../../shared/time.ts';
import type { ResortSnapshot, SnowNumbers } from '../../shared/types.ts';
import { type BrightonFeed, comments, type FeedLocation, gates, lifts, parking } from './brighton/feed.ts';
import { BlockedError, type FetchCtx, type Output, type ParseCtx, type Source, ValidationError } from './types.ts';

export const BRIGHTON_URL = 'https://apim-marketing-001.azure-api.net/FeedService/v1/Feed?resortName=br';
const ROW = 'resort:brighton';

/** The row is a ResortSnapshot plus the raw `operations.resortStatus` (O21: watch it at 05:00-08:00, Nov 20-22). */
export type BrightonRow = ResortSnapshot & { resortStatus: string | null };

/** JSON body -> feed; BlockedError for HTML, else ValidationError (gate §5.2: name 'Brighton' plus the two trees). */
function feedOf(raw: unknown): BrightonFeed {
  let d: unknown = raw;
  if (typeof raw === 'string') {
    // An HTML body is a front-end page (challenge, WAF or error) even when fetchx's markers miss it (§5.2).
    if (/^\s*</.test(raw)) throw new BlockedError('brighton: HTML body instead of feed JSON');
    try {
      d = JSON.parse(raw);
    } catch {
      throw new ValidationError('brighton: body is not JSON');
    }
  }
  const feed = (d && typeof d === 'object' ? d : {}) as BrightonFeed;
  if (feed.name !== 'Brighton') throw new ValidationError('brighton: name is not Brighton');
  const loc = feed.currentConditions?.resortLocations?.location?.[0];
  if (!loc || typeof loc !== 'object') throw new ValidationError('brighton: no resortLocations.location[0]');
  if (!Array.isArray(feed.facilities?.areas?.area)) throw new ValidationError('brighton: no facilities.areas.area[]');
  return feed;
}

const locInches = (loc: FeedLocation, key: string, max: number): number | null => {
  const v = loc[key];
  return inches(v && typeof v === 'object' ? v.inches : v, max);
};

function snow(loc: FeedLocation, updated: string | null, report: string | null, live: boolean, now: number) {
  const n = (key: string, max: number) => (live ? locInches(loc, key, max) : null); // preseason: last season's numbers
  const surface = [loc.primarySurface, loc.secondarySurface]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);
  const out: SnowNumbers = {
    overnightIn: n('snowOverNight', 60),
    new12hIn: n('snow12Hours', 60),
    new24hIn: n('snow24Hours', 80),
    new48hIn: n('snow48Hours', 120),
    new72hIn: n('snow72Hours', 150),
    new7dIn: n('snow7Days', 250),
    stormTotalIn: null,
    seasonTotalIn: n('snowSeasonTotal', 1000),
    baseDepthIn: n('base', 400),
    reportAt: updated,
    reportIsToday: reportIsToday(updated, now),
    area: 'primary',
    surface: surface.length ? surface.join(' / ') : null,
    text: report,
  };
  return out;
}

export function parseBrighton(raw: unknown, ctx: ParseCtx): Output {
  const feed = feedOf(raw);
  const loc = feed.currentConditions?.resortLocations?.location?.[0] as FeedLocation;
  const rw = feed.currentConditions?.resortwide ?? {};
  const status = typeof feed.operations?.resortStatus === 'string' ? feed.operations.resortStatus : null;
  const open = status === 'Open'; // resortwide counts are leftovers otherwise (23 trails "open" in October)
  const updated = typeof feed.updated === 'string' && isoToMs(feed.updated) !== null ? feed.updated : null;
  const list = lifts(feed);
  const states = list.map((l) => l.state);
  const season = seasonState(states, prevOpenedAt(ctx.prev[ROW]), ctx.now);
  const c = comments(feed);
  const count = (s: string) => (open ? states.filter((x) => x === s).length : 0);
  const row: BrightonRow = {
    id: 'brighton',
    ...season,
    snow: snow(loc, updated, c.report, season.season !== 'preseason', ctx.now),
    weather: {
      baseTempF: null,
      midTempF: null,
      summitTempF: null,
      summitWindMph: null,
      summitGustMph: null,
      windDir: null,
      sky: null,
      obsAt: null,
      src: 'none',
    },
    lifts: {
      open: count('open'),
      hold: count('hold'),
      scheduled: count('scheduled'),
      total: list.length || (range(num(rw.numLiftsTotal), 0, 50) ?? 0),
      list,
    },
    trails: {
      open: open ? range(num(rw.numTrailsOpen), 0, 300) : 0,
      total: range(num(rw.numTrailsTotal), 0, 300),
      groomed: open ? range(num(rw.numTrailsGroomed), 0, 300) : 0,
    },
    gates: gates(feed),
    parking: parking(feed),
    alerts: c.alerts,
    resortStatus: status,
  };
  if (c.road) row.roadHint = { raw: c.road, state: roadHintState(c.road) }; // a hint: the roads job owns BCC
  return { rows: { [ROW]: row } };
}

export const brighton: Source<string> = {
  id: ROW,
  staleAfterMin: 40,
  rows: [ROW],
  // One GET; redirects are not followed (follow: false), so the worst case is exactly 1.
  maxSubrequests: () => 1,
  probes: [{ hostId: 'brighton', url: BRIGHTON_URL }],
  async fetch(ctx: FetchCtx): Promise<string> {
    // fetchx throws BlockedError on a challenge page and HttpError on >= 400.
    const res = await ctx.fetch<string>(BRIGHTON_URL, { headers: { Accept: 'application/json' }, follow: false });
    if (res.status !== 200) throw new Error(`brighton: HTTP ${res.status} (redirects are not followed)`);
    return res.data;
  },
  parse: parseBrighton,
};
