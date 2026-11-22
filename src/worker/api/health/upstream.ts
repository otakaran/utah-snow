// Is a red critical row an upstream outage within grace (/api/health?strict=1 warns instead of failing)? Reads the
// stored `error` (lib/log.ts errorText: '<name>: <message>', no prefix for a plain Error). Only network-class
// failures count: a timeout or abort, a connection/DNS failure, HTTP 5xx or 429 (HttpError or an adapter's own).
// Anything else (ValidationError, BlockedError, HTTP 4xx, 'deferred', unknown text) and a row that never succeeded
// fail strict: when in doubt, fail.
import { UPSTREAM_GRACE_MIN } from '../../../../config/schedule.ts';
import { MIN } from '../../../shared/time.ts';

const NAME_RE = /^([A-Za-z]*Error): /;
const HTTP_RE = /^HTTP (5\d\d|429)\b/;
// Adapters that pass allowStatus throw a plain Error: 'alta: HTTP 503 (…)', 'nws-grid: HTTP 502 <url>', 'HTTP 500 <url>'.
const PLAIN_HTTP_RE = /^(?:[a-z][\w:-]*: )?HTTP (5\d\d|429)\b/;
const NET_RE =
  /^(?:fetch failed|network connection lost|connection (?:reset|refused|closed|lost)|.*\b(?:dns|enotfound|eai_again|econnreset|econnrefused|etimedout|socket hang up)\b)/i;

/** A stored error string -> true when it is a network-class failure of the upstream. */
export function isNetworkError(error: string | null): boolean {
  if (!error) return false;
  const name = NAME_RE.exec(error)?.[1] ?? '';
  const msg = name ? error.slice(name.length + 2) : error;
  if (name === 'TimeoutError' || name === 'AbortError') return true;
  if (name === 'HttpError') return HTTP_RE.test(msg);
  if (name === '' && PLAIN_HTTP_RE.test(msg)) return true;
  return (name === '' || name === 'TypeError') && NET_RE.test(msg);
}

/** An error row whose network-class failure began after a success within UPSTREAM_GRACE_MIN. */
export function inUpstreamGrace(status: string, error: string | null, okAt: number | null, now: number): boolean {
  return status === 'error' && okAt !== null && now - okAt <= UPSTREAM_GRACE_MIN * MIN && isNetworkError(error);
}
