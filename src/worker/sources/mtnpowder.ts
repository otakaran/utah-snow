// MtnPowder legacy feed (spec §5.4, Appendix B): one factory, two jobs, 'resort:solitude' (65) and
// 'resort:deer-valley' (49). The parser is src/shared/mtnpowder.ts, shared with the browser fallback (O1).
// Imperva fronts the feed and sets an `incap_ses_*` cookie on every 200, which fetchx's BLOCKED_RE matches,
// so we fetch with allowBlocked and judge blocking from the body: an HTML body means blocked (§5.2).
import { type MtnResort, mtnpowderUrl, parseMtnPowder } from '../../shared/mtnpowder.ts';
import { type FetchCtx, type Output, type Source, ValidationError } from './types.ts';

/**
 * Stand-in until sources/types.ts re-exports fetchx's BlockedError (value imports from lib/ are off-limits here).
 * The dispatcher matches `instanceof BlockedError`, so until then a block lands as status 'error' (still red/amber).
 */
export class MtnPowderBlockedError extends Error {
  override name = 'BlockedError';
}

const BLOCK_RE = /<html|<!doctype|incapsula|request unsuccessful|captcha|access denied|just a moment/i;
const JSON_START_RE = /^\s*[{[]/;

/** Throws on a block page, an HTTP error or a redirect; otherwise returns the body for parse(). */
function checkBody(url: string, status: number, body: string): string {
  const head = body.slice(0, 2048);
  const isJson = JSON_START_RE.test(head);
  if (!isJson && (/^\s*</.test(head) || (status >= 400 && BLOCK_RE.test(head)))) {
    throw new MtnPowderBlockedError(`blocked: HTTP ${status} ${url}`);
  }
  if (status >= 300) throw new Error(`HTTP ${status} ${url}`);
  return body;
}

export function mtnpowderSource(resort: MtnResort): Source<string> {
  const id = `resort:${resort}`;
  const url = mtnpowderUrl(resort);
  return {
    id,
    staleAfterMin: 40,
    rows: [id],
    // One GET; redirects are not followed (a JSON API that redirects is an error, not a hop to pay for).
    maxSubrequests: () => 1,
    probes: [{ hostId: 'mtnpowder', url }],
    async fetch(ctx: FetchCtx): Promise<string> {
      const res = await ctx.fetch<string>(url, {
        headers: { Accept: 'application/json' },
        body: 'text',
        follow: false,
        allowStatus: true,
        allowBlocked: true,
      });
      return checkBody(url, res.status, res.data);
    },
    parse(raw, ctx): Output {
      let json: unknown = raw;
      if (typeof raw === 'string') {
        try {
          json = JSON.parse(raw);
        } catch {
          throw new ValidationError(`${id}: body is not JSON`);
        }
      }
      const out = parseMtnPowder(json, resort, ctx.now, ctx.prev[id] ?? null);
      if (!out.ok) throw new ValidationError(`${id}: ${out.error}`);
      if (out.unmapped.length > 0) console.log(JSON.stringify({ job: id, unmappedLiftStatus: out.unmapped }));
      return { rows: { [id]: out.data } };
    },
  };
}

export const solitude = mtnpowderSource('solitude');
export const deerValley = mtnpowderSource('deer-valley');
/** Both instances, in PRIORITY order (config/schedule.ts). */
export const MTNPOWDER_SOURCES: readonly Source<string>[] = [solitude, deerValley];
