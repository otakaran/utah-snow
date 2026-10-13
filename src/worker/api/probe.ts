// GET /api/debug/probe?src=all|<hostId> (spec §7, §11). Gate: X-Probe-Key must equal secret PROBE_KEY
// (constant-time); otherwise, or when the secret is unset, the same 404 as an unknown route.
// One cheap real GET per allowlisted host through fetchx (redirects not followed, short timeout, MAX_CONN at a time).
import { PROBE_TIMEOUT_MS } from '../../../config/schedule.ts';
import { isoUtc } from '../../shared/time.ts';
import { apiError, json, notFound } from '../http.ts';
import { createFetchx, type FetchX, looksBlocked } from '../lib/fetchx.ts';
import { safeEqual } from '../lib/hash.ts';
import { errorText, redact } from '../lib/log.ts';
import { probeList } from '../sources/index.ts';

export interface ProbeRow {
  hostId: string;
  host: string;
  url: string;
  status: number | null;
  wallMs: number;
  contentType: string | null;
  server: string | null;
  cfRay: string | null;
  location: string | null;
  bytes: number;
  first200: string;
  blockedHint: boolean;
  error?: string;
}

const TEXTUAL = /^(text\/|application\/(?:json|geo\+json|ld\+json|xml|javascript))/i;

async function probeOne(fx: FetchX, hostId: string, url: string): Promise<ProbeRow> {
  const row: ProbeRow = {
    hostId,
    host: new URL(url).host,
    url: redact(url),
    status: null,
    wallMs: 0,
    contentType: null,
    server: null,
    cfRay: null,
    location: null,
    bytes: 0,
    first200: '',
    blockedHint: false,
  };
  const t0 = Date.now();
  try {
    const res = await fx<ArrayBuffer>(url, {
      body: 'bytes',
      follow: false,
      allowStatus: true,
      allowBlocked: true,
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    const ct = res.headers.get('content-type');
    const sniff = new TextDecoder().decode(new Uint8Array(res.data, 0, Math.min(2048, res.data.byteLength)));
    Object.assign(row, {
      status: res.status,
      wallMs: res.wallMs,
      contentType: ct,
      server: res.headers.get('server'),
      cfRay: res.headers.get('cf-ray'),
      location: res.headers.get('location') ? redact(res.headers.get('location') ?? '') : null,
      bytes: res.bytes,
      first200: ct && TEXTUAL.test(ct) ? redact(sniff.slice(0, 200)) : '',
      blockedHint: looksBlocked(res.headers, sniff),
    });
  } catch (err) {
    row.wallMs = Date.now() - t0;
    row.error = errorText(err);
  }
  return row;
}

export async function probe(req: Request, env: Env, _ctx: ExecutionContext, url: URL): Promise<Response> {
  if (!safeEqual(req.headers.get('X-Probe-Key'), env.PROBE_KEY)) return notFound();
  const src = url.searchParams.get('src') ?? 'all';
  const list = probeList();
  const targets = src === 'all' ? list : list.filter((p) => p.hostId === src);
  if (!targets.length) {
    return apiError(400, 'bad-input', {
      code: 'unknown-host',
      message: `hosts: ${list.map((p) => p.hostId).join(', ')}`,
    });
  }
  const fx = createFetchx();
  const rows = await Promise.all(targets.map((t) => probeOne(fx, t.hostId, t.url)));
  return json({
    generatedAt: isoUtc(Date.now()),
    count: rows.length,
    blocked: rows.filter((r) => r.blockedHint).length,
    rows,
  });
}
