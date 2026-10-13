// (d) YouTube iframe ids and CamStreamer handles on the Solitude, Brighton and Deer Valley webcam pages vs the seeds
// and handles in config/youtube.ts (the Deer Valley cams of config/cams/deer-valley.ts are reached only through
// CamStreamer, so its seeds need not be on the page). Values only on the page get their YouTube title (keyless
// oEmbed) and the slot whose title regex matches; a video YouTube no longer serves is a note, not drift.
import { SLOTS, type YtSlot } from '../../config/youtube.ts';
import { obj, str, tryJson } from '../../src/shared/json.ts';
import { newSite, type SiteResult } from './diff.ts';
import { capture, get, pageFailed } from './http.ts';

type Resort = keyof typeof SLOTS;
const PAGES: Record<Resort, { site: string; url: string }> = {
  solitude: { site: 'Solitude', url: 'https://www.solitudemountain.com/mountain-and-village/webcams' },
  brighton: { site: 'Brighton', url: 'https://www.brightonresort.com/conditions' },
  'deer-valley': { site: 'Deer Valley', url: 'https://www.deervalley.com/explore-the-mountain/webcams' },
};
const YT_RE = /youtube(?:-nocookie)?\.com\/embed\/([A-Za-z0-9_-]{11})/g;
const CS_RE = /camstreamer\.com\/embed\/([A-Za-z0-9]{20,})/g;
const YT_ID_RE = new RegExp(YT_RE.source); // first match only
const GONE = new Set([400, 401, 404]); // oEmbed for a removed, private or malformed video

interface Video {
  title: string | null;
  gone: boolean;
}

async function video(id: string): Promise<Video> {
  const watch = encodeURIComponent(`https://www.youtube.com/watch?v=${id}`);
  const got = await get(`https://www.youtube.com/oembed?format=json&url=${watch}`, { accept: 'application/json' });
  if (got.ok) return { title: str(obj(tryJson(got.text))?.title), gone: false };
  return { title: null, gone: GONE.has(got.status) };
}

/** The YouTube id a CamStreamer handle redirects to (HEAD, redirect manual, as the Worker does). */
async function resolveHandle(handle: string): Promise<string | null> {
  const got = await get(`https://camstreamer.com/embed/${handle}`, { head: true, manual: true });
  return got.ok ? (YT_ID_RE.exec(got.location ?? '')?.[1] ?? null) : null;
}

/** '"Ontario Snowstake" -> slot deer-valley-ontario-snowstake-live': the first slot whose title regex matches. */
function videoLabel(slots: readonly YtSlot[], { title }: Video): string {
  if (title === null) return 'title unknown';
  const cam = slots.find((s) => s.re.test(title))?.cam;
  return `"${title}"${cam ? ` -> slot ${cam}` : ', no slot matches'}`;
}

export async function checkYoutube(resort: Resort): Promise<SiteResult> {
  const { site, url } = PAGES[resort];
  const r = newSite(site, url);
  const page = await get(url);
  if (!page.ok) return pageFailed(r, 'the webcam page', page);
  const slots: readonly YtSlot[] = SLOTS[resort];
  const labels: Record<string, string> = {};
  for (const s of slots) {
    if (s.seed) labels[s.seed] = s.cam;
    if (s.camstreamer) labels[s.camstreamer] = s.cam;
  }
  const seeds = slots.flatMap((s) => (s.seed ? [s.seed] : []));
  const handles = slots.flatMap((s) => (s.camstreamer ? [s.camstreamer] : []));

  const ids: string[] = [];
  for (const id of capture(page.text, YT_RE)) {
    if (seeds.includes(id)) {
      ids.push(id);
      continue;
    }
    const v = await video(id);
    if (v.gone) r.notes.push(`the page embeds ${id}, which YouTube no longer serves; ignored`);
    else ids.push(id);
    labels[id] = videoLabel(slots, v);
  }
  const live = capture(page.text, CS_RE);
  for (const h of live.filter((h) => !handles.includes(h))) {
    const id = await resolveHandle(h);
    labels[h] = id ? `${id} ${videoLabel(slots, await video(id))}` : 'does not resolve to a YouTube id';
  }
  // Deer Valley shows only CamStreamer iframes: its seeds are runtime hints, so only unknown page ids count there.
  r.checks.push(
    { what: 'YouTube iframe ids vs seeds', expected: seeds, live: ids, labels, subset: handles.length > 0 },
    { what: 'CamStreamer handles', expected: handles, live, labels },
  );
  return r;
}
