// Roads I/O plan (spec §5.3 "Roads", §5.4, Appendix B). Every call uses follow:false, so each counts exactly one
// subrequest. A failed call is recorded in raw.errors and yields null; only BudgetError/DeadlineError abort the job
// (the dispatcher defers it), and the first WP error is rethrown when no WP feed and no UDOT list answered.
// Keyless: UDOT's /List/GetData answers 403 to Worker egress (seen live), so one MountainPasses call goes first and
// a 403 or block skips every other List call (traffic searches included): the rows then come from the WP feeds.
import { CORRIDORS, SIGN_SEARCH } from '../../../../config/roads.ts';
import { BlockedError, BudgetError, DeadlineError, type FetchCtx, type FetchOpts } from '../types.ts';
import { type RoadsRaw, redactKey } from './raw.ts';
import { keyedUrl } from './udot-keyed.ts';
import { asPage, fetchPages, listUrl } from './udot-list.ts';

export const SITES: readonly string[] = [...new Set(Object.values(CORRIDORS).map((d) => d.wpSite))];
export const FULL_SIGN_SLOTS: readonly number[] = [0, 4, 8];
export const TRAFFIC_SLOTS: readonly number[] = [2, 6, 10];
export const TRAFFIC_TERMS = ['SR 190', 'SR 210', 'I-80', 'SR 224', 'I-84', 'SR 167', 'SR 226'] as const;
const SNOWBIRD = 'https://api.snowbird.com/api/v1/dor/drupal';
export const BRIGHTON_ROADS = 'https://www.brightonresort.com/api/reportpal-roads?resortName=br';
const WP_FIELDS = 'id,date_gmt,modified_gmt,link,title,content,categories,tags';
export const wpUrl = (site: string): string =>
  `${site}/wp-json/wp/v2/posts?per_page=50&orderby=date&order=desc&_fields=${WP_FIELDS}`; // fetchx bust adds &_=
type Lists = Pick<RoadsRaw, 'conditions' | 'passes' | 'signs'>;
const JSON_GET: FetchOpts = { headers: { Accept: 'application/json' }, body: 'json', follow: false };

export const isKeyed = (ctx: Pick<FetchCtx, 'keyed' | 'secrets'>): boolean => ctx.keyed.udot && !!ctx.secrets.udot;

/**
 * Worst case per tick. Keyless: WP 3 + RoadConditions 2 + MountainPasses 1 + sign searches 3 + Snowbird 3 +
 * Brighton 1 = 13; +3 full MessageSigns pages in slots 0/4/8 = 16; +7 traffic searches in slots 2/6/10 = 20.
 * Keyed: WP 3 + api 3 + Snowbird 3 + Brighton 1 = 10; slots 2/6/10 add 7 searches + 1 api `event` fallback = 18.
 */
export function roadsBudget(ctx: Pick<FetchCtx, 'slot' | 'keyed' | 'secrets'>): number {
  const keyed = isKeyed(ctx);
  const signs = !keyed && FULL_SIGN_SLOTS.includes(ctx.slot) ? 3 : 0;
  const traffic = TRAFFIC_SLOTS.includes(ctx.slot) ? TRAFFIC_TERMS.length + (keyed ? 1 : 0) : 0;
  return (keyed ? 10 : 13) + signs + traffic;
}

const fatal = (err: unknown): boolean => err instanceof BudgetError || err instanceof DeadlineError;
/** The host refuses us (403 or a challenge): retrying other pages this tick only burns subrequests. */
const refused = (err: unknown): boolean =>
  err instanceof BlockedError || (err instanceof Error && (err as { status?: unknown }).status === 403);

export async function fetchRoads(ctx: FetchCtx): Promise<RoadsRaw> {
  const errors: Record<string, string> = {};
  const failures: unknown[] = [];
  let listRefused = false;
  const get = async (url: string, label: string, opts: FetchOpts = {}): Promise<unknown> => {
    try {
      return (await ctx.fetch(url, { ...JSON_GET, ...opts })).data;
    } catch (err) {
      if (fatal(err)) throw err;
      if (label.startsWith('wp:')) failures.push(err);
      if (label.startsWith('list:') && refused(err)) listRefused = true;
      errors[label] = redactKey(err instanceof Error ? `${err.name}: ${err.message}` : String(err)).slice(0, 200);
      return null;
    }
  };
  const keyed = isKeyed(ctx);
  const key = ctx.secrets.udot ?? '';
  const wpTask = Promise.all(
    SITES.map((s) => get(wpUrl(s), `wp:${s.replace(/^https?:\/\//, '')}`, { bust: true, timeoutMs: 10_000 })),
  );
  // Keyless only: the one List call that decides whether the others are worth making.
  const listProbe = keyed ? Promise.resolve(null) : get(listUrl('MountainPasses', 0), 'list:MountainPasses');
  const udotTask: Promise<Lists> = keyed
    ? Promise.all([
        get(keyedUrl('roadconditions', key), 'api:roadconditions'),
        get(keyedUrl('mountainpasses', key), 'api:mountainpasses'),
        get(keyedUrl('messagesigns', key), 'api:messagesigns'),
      ]).then(([c, p, s]) => ({ conditions: [c], passes: [p], signs: [s] }))
    : listProbe.then((p): Lists | Promise<Lists> =>
        listRefused
          ? { conditions: null, passes: null, signs: null }
          : Promise.all([
              fetchPages(get, 'RoadConditions', '', 2),
              Promise.all(SIGN_SEARCH.map((t) => get(listUrl('MessageSigns', 0, t), `list:MessageSigns:${t}`))),
              FULL_SIGN_SLOTS.includes(ctx.slot) ? fetchPages(get, 'MessageSigns', '', 3) : Promise.resolve([]),
            ]).then(([conditions, search, full]) => ({ conditions, passes: [p], signs: [...search, ...full] })),
      );
  const searchTraffic = () => Promise.all(TRAFFIC_TERMS.map((t) => get(listUrl('traffic', 0, t), `list:traffic:${t}`)));
  const trafficTask = !TRAFFIC_SLOTS.includes(ctx.slot)
    ? Promise.resolve(null)
    : keyed
      ? searchTraffic()
      : listProbe.then(() => (listRefused ? null : searchTraffic()));
  const resortTask = Promise.all([
    get(`${SNOWBIRD}/roads`, 'snowbird:roads'),
    get(`${SNOWBIRD}/parking`, 'snowbird:parking'),
    get(`${SNOWBIRD}/alerts`, 'snowbird:alerts'),
    get(BRIGHTON_ROADS, 'brighton:roads', { timeoutMs: 10_000 }),
  ]);
  const [wpBodies, udot, traffic, [sbRoads, sbParking, sbAlerts, brighton]] = await Promise.all([
    wpTask,
    udotTask,
    trafficTask,
    resortTask,
  ]);
  const events = keyed && traffic?.some((p) => !asPage(p)) ? await get(keyedUrl('event', key), 'api:event') : undefined;
  if (failures.length === SITES.length && (udot.conditions ?? []).every((p) => p === null)) throw failures[0];
  return {
    keyed,
    wp: Object.fromEntries(SITES.map((s, i) => [s, wpBodies[i] ?? null])),
    ...udot,
    traffic,
    ...(events === undefined ? {} : { events }),
    snowbird: { roads: sbRoads, parking: sbParking, alerts: sbAlerts },
    brighton,
    errors,
  };
}
