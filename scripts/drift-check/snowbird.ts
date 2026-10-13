// (b) Snowbird: the view-all-webcams page-data contentBlocks[] (page slugs, Roundshot hashes), then each block's
// buttonLink page-data for paragraph__webcam.webcamGuid (HDRelay player GUIDs) vs config/cams/snowbird.ts.
// The header tile (paragraph__dor_web_cam a0de9878…, an Eastern-time cam) is not ours and is ignored.
import { SNOWBIRD_CAMS } from '../../config/cams/snowbird.ts';
import { arr, obj, str, tryJson } from '../../src/shared/json.ts';
import type { CamDef } from '../../src/shared/types.ts';
import { newSite, type SiteResult } from './diff.ts';
import { capture, get, pageFailed } from './http.ts';

const ORIGIN = 'https://www.snowbird.com';
const LIST = `${ORIGIN}/page-data/the-mountain/webcams/view-all-webcams/page-data.json`;
const HEADER_CAM = 'a0de9878-d7b7-4906-9e83-536fde35c8a9';
const GUID_RE = /"webcamGuid":"([^"]+)"/g;
const ROUNDSHOT_RE = /roundshot\.com\/cams\/([0-9a-f]{32})\//;
const BLOCKS_PATH = [
  ...['result', 'data', 'pageContent', 'nodes', 0, 'relationships', 'pageContent', 0, 'relationships'],
  ...['children', 1, 'relationships', 'contentBlocks'],
];

const dig = (v: unknown, path: readonly (string | number)[]): unknown =>
  path.reduce<unknown>((o, k) => (typeof k === 'number' ? arr(o)[k] : obj(o)?.[k]), v);
const slug = (path: string): string => path.replace(/\/+$/, '').split('/').pop() ?? path;
const hashOf = (url: string): string | undefined => ROUNDSHOT_RE.exec(url)?.[1];

export async function checkSnowbird(): Promise<SiteResult> {
  const r = newSite('Snowbird', LIST);
  const page = await get(LIST, { accept: 'application/json' });
  if (!page.ok) return pageFailed(r, 'the webcam list page-data', page);
  const blocks = arr(dig(tryJson(page.text), BLOCKS_PATH)).map((b) => obj(b) ?? {});
  if (blocks.length === 0) r.problems.push('contentBlocks not found at the spec path (page-data layout changed)');

  // Page values are labelled with the block title, config values with the cam id.
  const labels: Record<string, string> = {};
  const live = { pages: [] as string[], guids: [] as string[], hashes: [] as string[] };
  for (const b of blocks) {
    const title = str(b.title) ?? '(untitled)';
    const hash = hashOf(str(obj(b.staticImageUrl)?.uri) ?? '');
    if (hash) {
      live.hashes.push(hash);
      labels[hash] = title;
    }
    const link = str(b.buttonLink);
    if (!link) continue;
    live.pages.push(slug(link));
    labels[slug(link)] = title;
    const sub = await get(`${ORIGIN}/page-data${link.replace(/\/+$/, '')}/page-data.json`, {
      accept: 'application/json',
    });
    if (!sub.ok) return pageFailed(r, `${link} page-data`, sub);
    for (const g of capture(sub.text, GUID_RE).filter((g) => g !== HEADER_CAM)) {
      live.guids.push(g);
      labels[g] = title;
    }
  }

  const cams = SNOWBIRD_CAMS as readonly CamDef[];
  const expected = { pages: [] as string[], guids: [] as string[], hashes: [] as string[] };
  for (const c of cams) {
    expected.pages.push(slug(c.pageUrl));
    labels[slug(c.pageUrl)] = c.id;
    const guid = c.live?.playerGuid;
    if (guid) {
      expected.guids.push(guid);
      labels[guid] = c.id;
    }
    const hash = hashOf(c.still.card);
    if (hash) {
      expected.hashes.push(hash);
      labels[hash] = c.id;
    }
  }
  r.checks.push(
    { what: 'webcam pages', expected: expected.pages, live: live.pages, labels },
    { what: 'HDRelay player GUIDs', expected: expected.guids, live: live.guids, labels },
    { what: 'Roundshot hashes', expected: expected.hashes, live: live.hashes, labels },
  );
  return r;
}
