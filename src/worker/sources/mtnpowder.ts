// MtnPowder legacy feed (spec §5.4, Appendix B): one factory, two jobs, 'resort:solitude' (65) and
// 'resort:deer-valley' (49). The parser is src/shared/mtnpowder.ts, shared with the browser fallback (O1).
// Imperva fronts the feed and challenges Worker egress (seen live): the job then ends 'blocked' and the browser
// fallback takes over. We fetch with allowBlocked and judge blocking from the body ourselves, so any HTML body
// counts as blocked (§5.2), also one without the Incapsula markers fetchx's looksBlocked() knows.
import { type MtnResort, mtnpowderUrl, parseMtnPowder } from '../../shared/mtnpowder.ts';
import type { ResortSnapshot } from '../../shared/types.ts';
import { BlockedError, type FetchCtx, type Output, type Source, ValidationError } from './types.ts';

/** The row: a ResortSnapshot plus, when present, lift statuses that fell through to 'closed' (§5.5 "log them"). */
export type MtnPowderRow = ResortSnapshot & { unmapped?: string[] };

const BLOCK_RE = /<html|<!doctype|incapsula|request unsuccessful|captcha|access denied|just a moment/i;
const JSON_START_RE = /^\s*[{[]/;

/** Throws on a block page, an HTTP error or a redirect; otherwise returns the body for parse(). */
function checkBody(url: string, status: number, body: string): string {
  const head = body.slice(0, 2048);
  const isJson = JSON_START_RE.test(head);
  if (!isJson && (/^\s*</.test(head) || (status >= 400 && BLOCK_RE.test(head)))) {
    throw new BlockedError(`blocked: HTTP ${status} ${url}`);
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
      const row: MtnPowderRow = out.unmapped.length > 0 ? { ...out.data, unmapped: out.unmapped } : out.data;
      return { rows: { [id]: row } };
    },
  };
}

export const solitude = mtnpowderSource('solitude');
export const deerValley = mtnpowderSource('deer-valley');
/** Both instances, in PRIORITY order (config/schedule.ts). */
export const MTNPOWDER_SOURCES: readonly Source<string>[] = [solitude, deerValley];
