// Tap targets and text sizes on the resort pages and #/cams (from the 393 px iPhone 15 audit): every link, button,
// summary and select in <main> is at least 44 x 44 px except an inline link inside a sentence (WCAG 2.5.8 inline
// exception), no visible text computes under 12 px, a unit is never larger than its number, and nothing scrolls
// sideways. The e2e seed stores '{}' per resort (dashes only), so /api/snapshot gets an in-season, then a preseason,
// body for every resort: snow tiles, units and booking links render. The shell's header and footer are not measured.
import type { Page } from '@playwright/test';
import type { ResortSnapshot } from '../src/shared/types.ts';
import { expect, test } from './fixtures.ts';

const AT = '2027-01-05T13:30:00Z'; // a trip morning (06:30 MST): the head's parking line carries a booking link
const PAGES = ['#/resort/alta', '#/resort/snowbasin', '#/cams'] as const;
type Season = 'open' | 'preseason';

function resortBody(id: string, season: Season): ResortSnapshot {
  const open = season === 'open';
  const n = (v: number): number | null => (open ? v : null);
  return {
    ...{ id: id as ResortSnapshot['id'], season, seasonOpenedAt: open ? '2026-11-20' : null, operatingToday: open },
    snow: {
      ...{ overnightIn: n(14), new12hIn: n(10), new24hIn: n(18), new48hIn: n(22), new72hIn: n(25), new7dIn: n(30) },
      ...{ stormTotalIn: n(26), seasonTotalIn: n(120), baseDepthIn: n(80), reportAt: open ? AT : null },
      ...{ reportIsToday: open, area: 'primary', summit: { overnightIn: n(16), new24hIn: n(20) } },
      ...{ morningOvernightIn: open ? { date: '2027-01-05', value: 12 } : null, surface: open ? 'Powder' : null },
    },
    weather: {
      ...{ baseTempF: 18, midTempF: 14, summitTempF: 9, summitWindMph: 22, summitGustMph: 35, windDir: 'NW' },
      ...{ sky: 'Snow', obsAt: AT, src: 'e2e' },
    },
    lifts: { open: open ? 7 : 0, hold: 0, scheduled: 0, total: 12, list: [] },
    trails: { open: open ? 80 : 0, total: 118, groomed: null },
    ...{ gates: [], parking: { state: 'unknown', raw: null }, alerts: [] },
  };
}

/** Pins the clock and the API Date header at AT and gives every resort block in /api/snapshot `season` data. */
async function seasonAt(page: Page, season: Season): Promise<void> {
  const ms = Date.parse(AT);
  await page.clock.setFixedTime(ms);
  await page.route('**/api/**', async (route) => {
    const res = await route.fetch();
    const headers: Record<string, string> = { ...res.headers(), date: new Date(ms).toUTCString() };
    if (new URL(route.request().url()).pathname !== '/api/snapshot' || res.status() !== 200) {
      return route.fulfill({ response: res, headers });
    }
    const snap = (await res.json()) as { resorts: Record<string, { data: unknown }> };
    for (const [id, block] of Object.entries(snap.resorts)) block.data = resortBody(id, season);
    delete headers['content-length'];
    delete headers['content-encoding'];
    return route.fulfill({ response: res, headers, body: JSON.stringify(snap) });
  });
}

/** What breaks the rules on the page: small controls, tiny text, units larger than their number; plus overflow. */
const audit = (page: Page) =>
  page.locator('body').evaluate((main) => {
    const TAP = 44;
    const MIN_TEXT = 12;
    const shown = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && !el.closest('.sr-only') && el.checkVisibility({ visibilityProperty: true });
    };
    const px = (el: Element): number => Number.parseFloat(getComputedStyle(el).fontSize);
    const name = (el: Element): string =>
      `${el.tagName.toLowerCase()}.${el.getAttribute('class') ?? ''} "${(el.textContent ?? '').trim().slice(0, 40)}"`;
    const small: string[] = [];
    for (const el of main.querySelectorAll('a, button, [role=button], summary, select')) {
      if (!shown(el)) continue;
      const line = el.closest('p, li');
      const inline = el.tagName === 'A' && getComputedStyle(el).display === 'inline';
      if (inline && line && line.textContent?.trim() !== el.textContent?.trim()) continue; // a link in a sentence
      const r = el.getBoundingClientRect();
      if (r.width < TAP || r.height < TAP) small.push(`${name(el)} ${r.width.toFixed(1)}x${r.height.toFixed(1)}`);
    }
    const tiny: string[] = [];
    const walk = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    for (let node = walk.nextNode(); node; node = walk.nextNode()) {
      const el = node.parentElement;
      if (node.textContent?.trim() && el && shown(el) && px(el) < MIN_TEXT) tiny.push(`${name(el)} ${px(el)} px`);
    }
    const units = [...main.querySelectorAll('.rs-u')].filter(shown);
    const bigUnits = units
      .filter((u) => u.parentElement && px(u) > px(u.parentElement))
      .map((u) => `${name(u.parentElement as Element)} ${px(u)} px`);
    return {
      ...{ small, tiny, bigUnits, units: units.length },
      overflow: document.documentElement.scrollWidth - innerWidth,
    };
  });

/** The page's season-specific content is on screen (so the audit measures the full page). */
async function ready(page: Page, hash: string, season: Season): Promise<void> {
  await expect(page.getByTestId('footer')).toBeVisible();
  if (hash === '#/cams') {
    await expect(page.locator('.cams-sub-link')).toHaveCount(6);
    return;
  }
  const head = page.getByTestId('head');
  if (season === 'open') await expect(head.locator('.rs-big .rs-u')).toBeVisible();
  else await expect(head).toContainText('projected open');
}

for (const season of ['open', 'preseason'] as const) {
  test(`${season}: resort and cams controls are 44 px taps, text is 12 px or more, no sideways scroll`, async ({
    page,
  }) => {
    await seasonAt(page, season);
    for (const hash of PAGES) {
      await page.goto(`/${hash}`);
      await ready(page, hash, season);
      const a = await audit(page);
      expect(a.small, `${hash} controls under 44x44`).toEqual([]);
      expect(a.tiny, `${hash} text under 12 px`).toEqual([]);
      expect(a.bigUnits, `${hash} units larger than their number`).toEqual([]);
      expect(a.overflow, `${hash} horizontal overflow`).toBeLessThanOrEqual(0);
      if (hash !== '#/cams') expect(a.units, `${hash} units measured`).toBeGreaterThan(0);
    }
  });
}
