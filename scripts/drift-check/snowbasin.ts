// (c) Snowbasin web-cams page: HDRelay.create({ id }) player GUIDs and Prism (luma) cam ids vs config/cams/snowbasin.ts.
import { SNOWBASIN_CAMS } from '../../config/cams/snowbasin.ts';
import type { CamDef } from '../../src/shared/types.ts';
import { newSite, type SiteResult } from './diff.ts';
import { capture, get, pageFailed } from './http.ts';

const PAGE = 'https://www.snowbasin.com/the-mountain/web-cams/';
const GUID_RE = /HDRelay\.create\(\{[^}]*?\bid:\s*["']([0-9a-f-]+)["']/g;
const LUMA_TAG_RE = /<div\b[^>]*\bluma-\d+[^>]*>/g;
const PRISM_RE = /prism-cam-0*(\d+)\//;

export async function checkSnowbasin(): Promise<SiteResult> {
  const r = newSite('Snowbasin', PAGE);
  const page = await get(PAGE);
  if (!page.ok) return pageFailed(r, 'the web-cams page', page);
  const lumaTags = page.text.match(LUMA_TAG_RE) ?? [];
  const prismLive = [...new Set(lumaTags.map((t) => /\bcam=["'](\d+)["']/.exec(t)?.[1] ?? '').filter(Boolean))];

  const cams = SNOWBASIN_CAMS as readonly CamDef[];
  const labels: Record<string, string> = {};
  const guids: string[] = [];
  const prism: string[] = [];
  for (const c of cams) {
    const guid = c.live?.playerGuid;
    if (guid) {
      guids.push(guid);
      labels[guid] = c.id;
    }
    const id = PRISM_RE.exec(c.still.card)?.[1];
    if (id) {
      prism.push(id);
      labels[id] = c.id;
    }
  }
  r.checks.push(
    { what: 'HDRelay player GUIDs', expected: guids, live: capture(page.text, GUID_RE), labels },
    { what: 'Prism cam ids', expected: prism, live: prismLive, labels },
  );
  return r;
}
