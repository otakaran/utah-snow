// fetchx: every outbound request, from cron or an API route (spec §5.2).
// One instance per invocation: it owns the external-subrequest budget, the connection semaphore and the deadline.
// Never sends Origin or Referer, never forwards browser headers, always `cache: 'no-store'` and `redirect: 'manual'`.
import { BUDGET, MAX_CONN } from '../../../config/schedule.ts';
import { redact } from './log.ts';

export const UA = 'utah-snow/1.0 (+https://utah.otakar.dev; https://github.com/otakaran/utah-snow)';
export const BLOCKED_RE = /cf-mitigated|incap_ses|captcha|Access Denied|Just a moment/i;
const DEFAULT_TIMEOUT_MS = 8_000; // 10_000 for HTML scrapes (callers pass timeoutMs)
const MAX_HOPS = 2;
const SNIFF_BYTES = 2048;

export class BudgetError extends Error {
  override name = 'BudgetError';
}
export class DeadlineError extends Error {
  override name = 'DeadlineError';
}
export class BlockedError extends Error {
  override name = 'BlockedError';
}
export class HttpError extends Error {
  override name = 'HttpError';
  status: number;
  constructor(status: number, url: string) {
    super(`HTTP ${status} ${redact(url)}`);
    this.status = status;
  }
}

export type BodyKind = 'text' | 'json' | 'bytes' | 'none';
export interface FetchOpts {
  method?: 'GET' | 'HEAD';
  headers?: Record<string, string>; // Accept etc.; Origin/Referer/User-Agent are dropped
  timeoutMs?: number;
  body?: BodyKind; // default 'text'; 'none' cancels the body (HEADs, 3xx probes, content-type checks)
  follow?: boolean; // default true: follow up to 2 redirect hops, each counted; false returns the 3xx itself
  bust?: boolean; // append `_={now}` (upstream sends long max-age)
  allowStatus?: boolean; // do not throw HttpError on >= 400
  allowBlocked?: boolean; // do not throw BlockedError (the probe reports it instead)
}
export interface FetchResult<T = unknown> {
  status: number;
  url: string; // final URL after followed hops
  headers: Headers;
  data: T;
  bytes: number;
  blocked: boolean;
  wallMs: number; // permit-to-body time (I/O wait; deployed timers only advance on I/O)
}
export interface FetchX {
  <T = unknown>(url: string, opts?: FetchOpts): Promise<FetchResult<T>>;
  remaining(): number; // external budget left
  used(): number;
}
export interface FetchxOptions {
  budget?: number;
  maxConn?: number;
  deadlineAt?: number; // epoch ms; no permit after it
  fetchImpl?: typeof fetch;
}

function semaphore(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return {
    async acquire(): Promise<void> {
      if (active < max) {
        active++;
        return;
      }
      await new Promise<void>((resolve) => queue.push(resolve)); // the releaser hands its slot over
    },
    release(): void {
      const next = queue.shift();
      if (next) next();
      else active--;
    },
  };
}

function cleanHeaders(h: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = { Accept: '*/*' };
  for (const [k, v] of Object.entries(h)) {
    if (!/^(origin|referer|user-agent|cookie)$/i.test(k)) out[k] = v;
  }
  out['User-Agent'] = UA;
  return out;
}

function headerText(h: Headers): string {
  let s = '';
  for (const [k, v] of h) s += `${k}: ${v}\n`;
  return s;
}

const isRedirect = (s: number) => s === 301 || s === 302 || s === 303 || s === 307 || s === 308;

async function readBody(res: Response, kind: BodyKind): Promise<{ data: unknown; bytes: number; sniff: string }> {
  if (kind === 'none') {
    await res.body?.cancel();
    return { data: null, bytes: 0, sniff: '' };
  }
  if (kind === 'bytes') {
    const buf = await res.arrayBuffer();
    const sniff = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(SNIFF_BYTES, buf.byteLength)));
    return { data: buf, bytes: buf.byteLength, sniff };
  }
  const text = await res.text();
  return { data: text, bytes: text.length, sniff: text.slice(0, SNIFF_BYTES) };
}

export function createFetchx(o: FetchxOptions = {}): FetchX {
  const budget = o.budget ?? BUDGET;
  const deadlineAt = o.deadlineAt ?? Number.POSITIVE_INFINITY;
  const fetchImpl = o.fetchImpl ?? globalThis.fetch.bind(globalThis);
  const sem = semaphore(o.maxConn ?? MAX_CONN);
  let ext = 0;

  async function one(url: string, opts: FetchOpts): Promise<{ res: Response; t0: number }> {
    if (ext >= budget) throw new BudgetError(`external budget ${budget} spent`);
    ext++;
    await sem.acquire();
    if (Date.now() > deadlineAt) {
      sem.release();
      throw new DeadlineError('tick deadline passed');
    }
    const t0 = Date.now();
    try {
      const signal = AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS); // starts only after the permit
      const res = await fetchImpl(url, {
        method: opts.method ?? 'GET',
        headers: cleanHeaders(opts.headers),
        redirect: 'manual',
        cache: 'no-store',
        signal,
      });
      return { res, t0 };
    } finally {
      sem.release(); // headers arrived (or failed): the body is read outside the permit
    }
  }

  const fx = async <T = unknown>(url0: string, opts: FetchOpts = {}): Promise<FetchResult<T>> => {
    let url = url0;
    if (opts.bust) {
      const u = new URL(url);
      u.searchParams.set('_', String(Date.now()));
      url = u.href;
    }
    for (let hop = 0; ; hop++) {
      const { res, t0 } = await one(url, opts);
      const loc = res.headers.get('location');
      if (opts.follow !== false && isRedirect(res.status) && loc && hop < MAX_HOPS) {
        await res.body?.cancel();
        url = new URL(loc, url).href;
        continue;
      }
      const kind = opts.body ?? (opts.method === 'HEAD' ? 'none' : 'text');
      const { data, bytes, sniff } = await readBody(res, kind);
      const blocked = BLOCKED_RE.test(headerText(res.headers)) || BLOCKED_RE.test(sniff);
      if (blocked && !opts.allowBlocked) throw new BlockedError(`blocked: ${redact(url)}`);
      if (res.status >= 400 && !opts.allowStatus) throw new HttpError(res.status, url);
      const parsed = kind === 'json' ? JSON.parse(data as string) : data;
      return {
        status: res.status,
        url,
        headers: res.headers,
        data: parsed as T,
        bytes,
        blocked,
        wallMs: Date.now() - t0,
      };
    }
  };
  return Object.assign(fx, { remaining: () => budget - ext, used: () => ext });
}
