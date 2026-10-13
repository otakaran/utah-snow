// NWS Area Forecast Discussion (SLC) and active alerts (spec §5.4 'nws-text', Appendix B nws-afd/nws-alerts).
// Job id 'nws-text', rows 'nws:afd' and 'nws:alerts'. Two GETs; either failing fails the job (rows keep last-good).
import { text } from '../../shared/num.ts';
import { isoToMs } from '../../shared/time.ts';
import type { Afd, NwsAlert } from '../../shared/types.ts';
import { type FetchCtx, type Output, type ParseCtx, type Source, ValidationError } from './types.ts';

export const AFD_URL = 'https://api.weather.gov/products/types/AFD/locations/SLC/latest';
// UTZ105 Salt Lake Valley (base presets), UTZ108 Wasatch Back (DV base), UTZ110 Snowbasin, UTZ111 Cottonwoods.
export const ALERT_ZONES = ['UTZ105', 'UTZ108', 'UTZ110', 'UTZ111'] as const;
export const ALERTS_URL = `https://api.weather.gov/alerts/active?zone=${ALERT_ZONES.join(',')}`;
export const AFD_LINK = 'https://forecast.weather.gov/product.php?site=SLC&issuedby=SLC&product=AFD';
const HEADERS = { Accept: 'application/geo+json' }; // fetchx adds the UA (NWS answers 403 without one)
const MAX_KEY_MESSAGES = 1200;
const SECTION_RE = /^\.([A-Z /]+)\.\.\./m;
const SPLIT_RE = /^[ \t]*&&[ \t]*$/m;
const BULLET_RE = /\n(?=[ \t]*(?:[-*•]|\d+\.)[ \t])/g;
const ZONE_RE = /([A-Z]{2}[CZ]\d{3})\/?$/;

/** Per-row staleAfterMin from §5.4 (the Source carries one number; integration may map these per row). */
export const STALE_BY_ROW = { 'nws:afd': 720, 'nws:alerts': 60 } as const;

export interface NwsTextRaw {
  afd: unknown; // /products/types/AFD/locations/SLC/latest body
  alerts: unknown; // /alerts/active?zone=... body
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : null);
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

function isoZ(v: unknown): string | null {
  const ms = isoToMs(typeof v === 'string' ? v : null);
  return ms === null ? null : new Date(ms).toISOString();
}

/** Body of the '.NAME...' section: blocks are split on '&&' lines and named by their first header. */
export function afdSection(productText: string, name: string): string | null {
  for (const block of productText.replace(/\r\n?/g, '\n').split(SPLIT_RE)) {
    const m = SECTION_RE.exec(block);
    if (m?.[1]?.trim() === name) return block.slice(m.index + m[0].length);
  }
  return null;
}

/** Unwraps the 70-column lines: one line per bullet/paragraph, capped at 1,200 chars. */
export function tidyKeyMessages(body: string): string | null {
  const paras = body
    .replace(BULLET_RE, '\n\n')
    .split(/\n[ \t]*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const t = paras.join('\n');
  if (!t) return null;
  return t.length > MAX_KEY_MESSAGES ? `${t.slice(0, MAX_KEY_MESSAGES - 1).trimEnd()}…` : t;
}

/** Pure: the latest-AFD body -> Afd. Gate: an AFD product with an id, a zoned issuance time and text. */
export function parseAfd(body: unknown): Afd {
  const p = obj(body);
  const id = str(p?.id);
  const issuedAt = isoZ(p?.issuanceTime);
  const productText = typeof p?.productText === 'string' ? p.productText : '';
  const isAfd = p?.productCode === 'AFD' || /Area Forecast Discussion/.test(productText);
  if (!p || !id || !issuedAt || !isAfd || !productText.trim()) {
    throw new ValidationError('nws-text: AFD body is not an Area Forecast Discussion');
  }
  const km = afdSection(productText, 'KEY MESSAGES');
  return { id, issuedAt, keyMessages: km === null ? null : tidyKeyMessages(km), url: AFD_LINK };
}

function zonesOf(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  const ours = new Set<string>(ALERT_ZONES);
  const ids = v.map((u) => (typeof u === 'string' ? ZONE_RE.exec(u)?.[1] : undefined));
  return [...new Set(ids.filter((z): z is string => !!z && ours.has(z)))];
}

/** Pure: the /alerts/active body -> NwsAlert[] (actual, non-cancel messages). Gate: a features[] array. */
export function parseAlerts(body: unknown): NwsAlert[] {
  const features = obj(body)?.features;
  if (!Array.isArray(features)) throw new ValidationError('nws-text: alerts body has no features[]');
  const out: NwsAlert[] = [];
  for (const f of features) {
    const p = obj(obj(f)?.properties);
    const event = text(p?.event, 120);
    if (!p || !event) continue;
    if ((p.status !== undefined && p.status !== 'Actual') || p.messageType === 'Cancel') continue;
    out.push({
      event,
      severity: str(p.severity) ?? 'Unknown',
      headline: text(p.headline, 300) ?? event,
      onset: isoZ(p.onset),
      ends: isoZ(p.ends),
      zones: zonesOf(p.affectedZones),
    });
  }
  return out;
}

async function getJson(ctx: FetchCtx, url: string, label: string): Promise<unknown> {
  const res = await ctx.fetch<string>(url, { headers: HEADERS, follow: false });
  if (res.status !== 200) throw new Error(`nws-text: ${label} HTTP ${res.status} (redirects are not followed)`);
  try {
    return JSON.parse(res.data);
  } catch {
    throw new ValidationError(`nws-text: ${label} body is not JSON`);
  }
}

export const nwsText: Source<NwsTextRaw> = {
  id: 'nws-text',
  staleAfterMin: STALE_BY_ROW['nws:alerts'], // the stricter of the two rows; both are written together
  rows: ['nws:afd', 'nws:alerts'],
  maxSubrequests: () => 2, // AFD + alerts; redirects are not followed
  probes: [
    { hostId: 'nws', url: ALERTS_URL },
    { hostId: 'nws-afd', url: AFD_URL },
  ],
  async fetch(ctx: FetchCtx): Promise<NwsTextRaw> {
    const [afd, alerts] = await Promise.all([getJson(ctx, AFD_URL, 'AFD'), getJson(ctx, ALERTS_URL, 'alerts')]);
    return { afd, alerts };
  },
  parse(raw: NwsTextRaw, _ctx: ParseCtx): Output {
    const r = obj(raw);
    return { rows: { 'nws:afd': parseAfd(r?.afd), 'nws:alerts': parseAlerts(r?.alerts) } };
  },
};
