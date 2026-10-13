// Plain fetch for the drift check. It runs on the GitHub runner with no secrets: an honest UA, never a Referer
// (manage.hdrelay.com answers 403 to a foreign one), 30 s per request. Bot walls (Cloudflare Bot Fight Mode on
// brightonresort.com, Imperva on the Alterra sites) come back as failures that mark the site unreachable.
import type { SiteResult } from './diff.ts';

const UA = 'utah-snow-drift/1.0 (+https://utah.otakar.dev; https://github.com/otakaran/utah-snow)';
const TIMEOUT_MS = 30_000;
// Block and challenge pages only; normal Imperva pages also load /_Incapsula_Resource, so that alone is not a block.
const BLOCK_RE =
  /<title>Just a moment\.\.\.<\/title>|window\._cf_chl_opt|Incapsula incident ID|_Incapsula_Resource\?SWUDNSAI/;

export type Got =
  | { ok: true; status: number; text: string; location: string | null }
  | { ok: false; status: number; reason: string };
type Failed = Extract<Got, { ok: false }>;

interface Opts {
  accept?: string;
  head?: boolean;
  /** Return 3xx as is (CamStreamer embeds answer 302 to the YouTube embed). */
  manual?: boolean;
}

export async function get(url: string, opts: Opts = {}): Promise<Got> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: opts.head ? 'HEAD' : 'GET',
      redirect: opts.manual ? 'manual' : 'follow',
      headers: { 'User-Agent': UA, Accept: opts.accept ?? 'text/html,application/json;q=0.9,*/*;q=0.8' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const code = err instanceof Error ? ((err.cause as { code?: string } | undefined)?.code ?? err.name) : 'Error';
    return { ok: false, status: 0, reason: `network error ${code}` };
  }
  const text = opts.head ? '' : await res.text().catch(() => '');
  if (res.headers.get('cf-mitigated') === 'challenge' || BLOCK_RE.test(text)) {
    return { ok: false, status: res.status, reason: `HTTP ${res.status}, bot challenge` };
  }
  const redirect = opts.manual === true && res.status >= 300 && res.status < 400;
  if (res.ok || redirect) return { ok: true, status: res.status, text, location: res.headers.get('location') };
  return { ok: false, status: res.status, reason: `HTTP ${res.status}` };
}

/** 404/410: the page itself is gone, which is drift. Anything else means the host did not serve this runner. */
export const isGone = (status: number): boolean => status === 404 || status === 410;

/** Records a failed page fetch: a gone page is a problem, any other failure marks the site unreachable. */
export function pageFailed(r: SiteResult, what: string, got: Failed): SiteResult {
  if (isGone(got.status)) r.problems.push(`${what} returns ${got.reason}`);
  else r.unreachable = `${what}: ${got.reason}`;
  return r;
}

/** Every first capture group of `re` in `text`, deduplicated, in page order. */
export function capture(text: string, re: RegExp): string[] {
  return [...new Set([...text.matchAll(re)].map((m) => m[1] ?? '').filter(Boolean))];
}
