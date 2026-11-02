// (a) Alta /weather: window.Alta.weather.mountainCams[] (slug -> image) vs config/cams/alta.ts, and the board-clear
// times in the collins-snow-stake text vs the 04:00/16:00 the stake row assumes (features/cams/StakeRow.tsx).
// Alta lists only the cameras that work that week (East Greeley and Albion Basin were gone on 2026-10-26, High
// Rustler on 2026-11-01), so a config cam missing from the page is a note while its still still answers (cam-status
// marks a frozen one stale); it is drift once the still is gone.
import { ALTA_CAMS } from '../../config/cams/alta.ts';
import { altaJson } from '../../src/shared/alta-page.ts';
import { arr, obj, str } from '../../src/shared/json.ts';
import { newSite, type SiteResult } from './diff.ts';
import { get, pageFailed } from './http.ts';

const PAGE = 'https://www.alta.com/weather';
const STAKE_SLUG = 'collins-snow-stake';
const CLEARS = ['04:00', '16:00'];
const CLOCK_RE = /\b(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\b/gi;

/** 'prism 65' for a Prism cam, else the image URL without its query. */
const image = (url: string): string => {
  const prism = /prism-cam-0*(\d+)\//.exec(url)?.[1];
  return prism ? `prism ${prism}` : url.replace(/\?.*$/, '');
};

/** HEAD of a still template without its query: 2xx means the camera's image is still published. */
async function stillServes(template: string): Promise<boolean> {
  const got = await get(template.split('?')[0] ?? template, { head: true, accept: 'image/*' });
  return got.ok;
}

const plain = (html: string): string =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** 'Cleared daily at 4am and 4pm' -> ['04:00', '16:00']. */
function clockTimes(text: string): string[] {
  const out = [...text.matchAll(CLOCK_RE)].map((m) => {
    const h = (Number(m[1]) % 12) + (m[3]?.toLowerCase() === 'p' ? 12 : 0);
    return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`;
  });
  return [...new Set(out)].sort();
}

export async function checkAlta(): Promise<SiteResult> {
  const r = newSite('Alta', PAGE);
  const page = await get(PAGE);
  if (!page.ok) return pageFailed(r, 'the weather page', page);
  const cams = arr(obj(altaJson(page.text)?.weather)?.mountainCams).map((c) => obj(c) ?? {});
  if (cams.length === 0) r.problems.push('window.Alta.weather.mountainCams not found');

  const live = cams.map((c) => {
    const prism = c.archr_cam_id;
    const img = typeof prism === 'number' ? `prism ${prism}` : image(str(c.url) ?? '(no url)');
    return `${str(c.slug) ?? '(no slug)'} -> ${img}`;
  });
  const expected: string[] = [];
  for (const c of ALTA_CAMS) {
    const key = `${c.isStake ? STAKE_SLUG : c.id.replace(/^alta-/, '')} -> ${image(c.still.card)}`;
    if (live.includes(key) || !(await stillServes(c.still.card))) {
      expected.push(key);
      continue;
    }
    r.notes.push(`${c.id} is not on the page this week, but its still answers (${c.still.card.split('?')[0]})`);
  }
  r.checks.push({ what: 'mountainCams (slug -> image)', expected, live });

  const text = plain(str(cams.find((c) => c.slug === STAKE_SLUG)?.text) ?? '');
  const clears = clockTimes(text);
  r.checks.push({ what: 'Collins stake board-clear times', expected: CLEARS, live: clears });
  if (clears.join() !== CLEARS.join()) r.notes.push(`stake text: "${text}"`);
  return r;
}
