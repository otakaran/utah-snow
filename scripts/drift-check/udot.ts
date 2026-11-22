// (e) UDOT: the Cottonwood Canyons road-information page (`Cctv/(\d+)` plus each <img> alt text) vs the 52-entry
// registry in config/cams/udot.ts. The page shows only some LCC/BCC cams, so only ids missing from the registry count;
// a cam whose alt text names another milepost than its registry name is drift too (UDOT re-pointed the id).
// The page lists new ids for the same cameras every week while the old ids keep serving the live image: a page id
// that pairs with a registry cam by road + milepost (or place) whose registry id still serves that camera is an alias.
import { UDOT_CAMS } from '../../config/cams/udot.ts';
import type { CamDef } from '../../src/shared/types.ts';
import { newSite, type SiteResult } from './diff.ts';
import { capture, get, getBytes, pageFailed } from './http.ts';

const PAGE = 'https://cottonwoodcanyons.udot.utah.gov/road-information/';
const CCTV = 'https://www.udottraffic.utah.gov/map/Cctv';
const CCTV_RE = /Cctv\/(\d+)/g;
const IMG_RE = /<img\b[^>]*>/g;
const MP_RE = /\bMP\s*(\d+(?:\.\d+)?)/i;
const RETRY_MS = 12_000;
const ATTEMPTS = 6;
// Words that say nothing about the place ("Rd", "Canyon", the trailing city code is cut off before).
const STOP = new Set(['rd', 'blvd', 'dr', 'canyon', 'mouth', 'rwis', 'mp', 'eb', 'wb', 'nb', 'sb']);

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

/** SR-190 is Big Cottonwood; SR-210/SR-209 are Little Cottonwood. The BCC mouth names SR-210 too, so BCC wins. */
function corridorOf(alt: string): 'lcc' | 'bcc' | null {
  if (/Big Cottonwood|SR-190\b/i.test(alt)) return 'bcc';
  if (/Little Cottonwood|SR-209\b|SR-210\b/i.test(alt)) return 'lcc';
  return null;
}

const words = (s: string): Set<string> =>
  new Set(
    s
      .toLowerCase()
      .replace(/,\s*[a-z]+$/, '') // trailing city code (", SL")
      .split(/[^a-z0-9-]+/)
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );

type Cam = Pick<CamDef, 'id' | 'name' | 'corridor'>;

/**
 * The registry cam a page alt text names, or null. Same corridor and same milepost when the alt text has one
 * (milepost alone collides across LCC and BCC); else the no-milepost cam sharing the most place words (at least 2,
 * no tie).
 */
export function pairAlias<C extends Cam>(alt: string, cams: readonly C[]): C | null {
  const corridor = corridorOf(alt);
  if (!corridor) return null;
  const pool = cams.filter((c) => c.corridor === corridor);
  const mp = MP_RE.exec(alt)?.[1];
  if (mp) {
    const hits = pool.filter((c) => MP_RE.exec(c.name)?.[1] === mp);
    return hits.length === 1 ? (hits[0] ?? null) : null;
  }
  const have = words(alt);
  const scored = pool
    .filter((c) => !MP_RE.test(c.name))
    .map((c) => ({ c, n: [...words(c.name)].filter((w) => have.has(w)).length }))
    .sort((a, b) => b.n - a.n);
  const [best, next] = scored;
  if (!best || best.n < 2 || (next && next.n === best.n)) return null;
  return best.c;
}

/** One moment's pictures: the sha256 of the page id's image and of the registry id's, fetched together. */
export interface Look {
  page: string;
  reg: string;
  regPng: boolean;
}

/**
 * What a run of looks says about a page id and the registry id it pairs with. Both ids serve the camera's current
 * frame, many cams turn out a new one every second or two, and each id answers from its own cache, so two ids of one
 * camera often show neighbouring frames. 'alias': the same bytes at one moment, or the registry id keeps turning out
 * new frames (live), or one id showed a frame the other showed at another look (the same camera, a moment apart).
 * 'placeholder': the registry id is on the PNG offline picture while the page id has another one. 'stuck': the page
 * id's picture moved on and the registry id's never did or matched. 'static': neither picture changed and they
 * differ, which a slow camera behind two caches gives as well (2026-11-22: 4 of 17 pairs in one run, 1 in the next,
 * 0 in the third), so it is a note, not drift. null: one look that differs says nothing yet.
 */
export function aliasVerdict(
  looks: readonly Look[],
  done = false,
): 'alias' | 'placeholder' | 'stuck' | 'static' | null {
  const last = looks[looks.length - 1];
  if (!last) return null;
  if (last.page === last.reg) return 'alias'; // also when both serve the placeholder: the camera itself is down
  if (last.regPng) return 'placeholder';
  const page = new Set(looks.map((l) => l.page));
  const reg = new Set(looks.map((l) => l.reg));
  if (reg.size > 1 || [...reg].some((h) => page.has(h))) return 'alias';
  if (!done) return null;
  return page.size > 1 ? 'stuck' : 'static';
}

/** Looks at both ids until the verdict is clear. `why`: drift; `note`: could not tell (both pictures static). */
async function sameImage(pageId: string, regId: string): Promise<{ why?: string; note?: string }> {
  const looks: Look[] = [];
  const span = `${((ATTEMPTS - 1) * RETRY_MS) / 1000} s`;
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    if (attempt > 0) await new Promise((done) => setTimeout(done, RETRY_MS));
    const t = Date.now(); // one cache buster for both fetches
    const [a, b] = await Promise.all([getBytes(`${CCTV}/${pageId}?t=${t}`), getBytes(`${CCTV}/${regId}?t=${t}`)]);
    if (!b.ok) return { why: `the registry image returns ${b.reason}` };
    if (!a.ok) return { why: `the page image returns ${a.reason}` };
    looks.push({ page: a.sha256, reg: b.sha256, regPng: b.type === 'image/png' });
    const verdict = aliasVerdict(looks, attempt === ATTEMPTS - 1);
    if (verdict === 'alias') return {};
    if (verdict === 'placeholder') return { why: 'the registry image is the PNG offline placeholder' };
    if (verdict === 'stuck')
      return { why: `the registry image never matched the page's and did not change in ${span}` };
    if (verdict === 'static') return { note: `two different pictures, neither changed in ${span}` };
  }
  return {};
}

export async function checkUdot(): Promise<SiteResult> {
  const r = newSite('UDOT Cottonwood Canyons', PAGE);
  const page = await get(PAGE);
  if (!page.ok) return pageFailed(r, 'the road-information page', page);
  const ids = capture(page.text, CCTV_RE);
  if (ids.length === 0) r.problems.push('no Cctv/<id> images found (page layout changed)');
  const alts = altTexts(page.text);

  const cams = (UDOT_CAMS as readonly CamDef[]).filter((c) => c.kind === 'udot');
  const byId = new Map(cams.map((c) => [c.id.replace(/^udot-/, ''), c]));
  const labels: Record<string, string> = {};
  const aliases: string[] = [];
  const live = await Promise.all(
    ids.map(async (id) => {
      const alt = alts.get(id) ?? '(no alt text)';
      labels[id] = `"${alt}"`;
      const cam = byId.get(id);
      if (cam) {
        const want = MP_RE.exec(cam.name)?.[1];
        if (want && want !== MP_RE.exec(alt)?.[1])
          r.problems.push(`${cam.id} "${cam.name}": the page's alt text is "${alt}"`);
        return id;
      }
      const twin = pairAlias(alt, cams);
      if (!twin) return id; // unknown location: the set diff reports it with its alt text
      const regId = twin.id.replace(/^udot-/, '');
      const { why, note } = await sameImage(id, regId);
      if (why) r.problems.push(`\`${id}\` ("${alt}") pairs with ${twin.id} "${twin.name}" but ${why}`);
      else if (note)
        r.notes.push(`\`${id}\` pairs with ${twin.id} by place; its picture could not confirm it (${note})`);
      else aliases.push(`\`${id}\` alias of ${twin.id}`);
      return regId;
    }),
  );
  r.checks.push({ what: 'Cctv ids', expected: [...byId.keys()], live, labels, subset: true });
  if (aliases.length > 0) {
    r.notes.push(
      `${aliases.length} page ids are aliases of registry cams (same place, same live camera): ${aliases.sort().join(', ')}`,
    );
  }
  const unseen = [...byId.keys()].filter((id) => !live.includes(id)).length;
  r.notes.push(`${unseen} of ${byId.size} registry Cctv ids are not on this page (other corridors and approaches)`);
  return r;
}
