// (e) UDOT: the Cottonwood Canyons road-information page (`Cctv/(\d+)` plus each <img> alt text) vs the 52-entry
// registry in config/cams/udot.ts. The page shows only some LCC/BCC cams, so only ids missing from the registry count;
// a cam whose alt text names another milepost than its registry name is drift too (UDOT re-pointed the id).
import { UDOT_CAMS } from '../../config/cams/udot.ts';
import type { CamDef } from '../../src/shared/types.ts';
import { newSite, type SiteResult } from './diff.ts';
import { capture, get, pageFailed } from './http.ts';

const PAGE = 'https://cottonwoodcanyons.udot.utah.gov/road-information/';
const CCTV_RE = /Cctv\/(\d+)/g;
const IMG_RE = /<img\b[^>]*>/g;
const MP_RE = /\bMP\s*(\d+(?:\.\d+)?)/i;

const decode = (s: string): string =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&#0?39;|&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();

/** Cctv id -> alt text of the <img> that shows it. */
function altTexts(html: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const tag of html.match(IMG_RE) ?? []) {
    const id = /Cctv\/(\d+)/.exec(tag)?.[1];
    const alt = /\balt="([^"]*)"/.exec(tag)?.[1];
    if (id && alt && !out.has(id)) out.set(id, decode(alt));
  }
  return out;
}

export async function checkUdot(): Promise<SiteResult> {
  const r = newSite('UDOT Cottonwood Canyons', PAGE);
  const page = await get(PAGE);
  if (!page.ok) return pageFailed(r, 'the road-information page', page);
  const live = capture(page.text, CCTV_RE);
  if (live.length === 0) r.problems.push('no Cctv/<id> images found (page layout changed)');
  const alts = altTexts(page.text);

  const cams = (UDOT_CAMS as readonly CamDef[]).filter((c) => c.kind === 'udot');
  const byId = new Map(cams.map((c) => [c.id.replace(/^udot-/, ''), c]));
  const labels: Record<string, string> = {};
  for (const id of live) {
    const alt = alts.get(id) ?? '(no alt text)';
    labels[id] = `"${alt}"`;
    const cam = byId.get(id);
    const want = cam ? MP_RE.exec(cam.name)?.[1] : undefined;
    const got = MP_RE.exec(alt)?.[1];
    if (cam && want && want !== got) r.problems.push(`${cam.id} "${cam.name}": the page's alt text is "${alt}"`);
  }
  r.checks.push({ what: 'Cctv ids', expected: [...byId.keys()], live, labels, subset: true });
  const unseen = [...byId.keys()].filter((id) => !live.includes(id)).length;
  r.notes.push(`${unseen} of ${byId.size} registry Cctv ids are not on this page (other corridors and approaches)`);
  return r;
}
