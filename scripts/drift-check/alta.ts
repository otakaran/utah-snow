// (a) Alta /weather: window.Alta.weather.mountainCams[] (slug -> image) vs config/cams/alta.ts, and the board-clear
// times in the collins-snow-stake text vs the 04:00/16:00 the stake row assumes (features/cams/StakeRow.tsx).
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

  const expected = ALTA_CAMS.map(
    (c) => `${c.isStake ? STAKE_SLUG : c.id.replace(/^alta-/, '')} -> ${image(c.still.card)}`,
  );
  const live = cams.map((c) => {
    const prism = c.archr_cam_id;
    const img = typeof prism === 'number' ? `prism ${prism}` : image(str(c.url) ?? '(no url)');
    return `${str(c.slug) ?? '(no slug)'} -> ${img}`;
  });
  r.checks.push({ what: 'mountainCams (slug -> image)', expected, live });

  const text = plain(str(cams.find((c) => c.slug === STAKE_SLUG)?.text) ?? '');
  const clears = clockTimes(text);
  r.checks.push({ what: 'Collins stake board-clear times', expected: CLEARS, live: clears });
  if (clears.join() !== CLEARS.join()) r.notes.push(`stake text: "${text}"`);
  return r;
}
