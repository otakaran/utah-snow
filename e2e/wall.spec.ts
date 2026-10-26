// TV wall (spec §8.4, §8.10) at 1920x1080 in every project (narrower screens get the launcher). Every test also
// fails on any console error (fixtures.ts). The page clock is installed (not fixed) so rotation can be fast-forwarded,
// and every /api Date header is pinned to the same instant, because the app's clock is the server's
// (serverNow = Date.now() + skew).
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';
import { richOpenMeteo, richSnapshot } from './wall-data.ts';

test.use({ viewport: { width: 1920, height: 1080 } });

const DAY = '2027-01-05T19:00:00Z'; // 12:00 MST, a Tuesday
const NIGHT = '2027-01-06T02:00:00Z'; // 19:00 MST
const DAWN = '2027-01-05T13:30:00Z'; // 06:30 MST: 05:30 in the tz project's Los Angeles browser (spec §8.10)
const SAFE_BOTTOM = 1080 - 24; // --wall-safe

interface WallAt {
  /** Stamps /api/snapshot X-Build. */
  build?: string;
  /** Rewrites the /api/snapshot body (one handler for the Date pin and the body: the last registered one wins). */
  snapshot?: (body: { forecast: Record<string, { data: unknown }> }) => void;
}

/** Installs the page clock at `iso`, pins the API Date header to it and optionally patches /api/snapshot. */
async function wallAt(page: Page, iso: string, opts: WallAt = {}): Promise<void> {
  const ms = Date.parse(iso);
  await page.clock.install({ time: ms });
  await page.route('**/api/**', async (route) => {
    const res = await route.fetch();
    const headers: Record<string, string> = { ...res.headers(), date: new Date(ms).toUTCString() };
    const snap = new URL(route.request().url()).pathname === '/api/snapshot';
    if (opts.build && snap) headers['x-build'] = opts.build;
    if (!opts.snapshot || !snap || res.status() !== 200) return route.fulfill({ response: res, headers });
    const body = await res.json();
    opts.snapshot(body);
    delete headers['content-length'];
    delete headers['content-encoding'];
    await route.fulfill({ response: res, headers, body: JSON.stringify(body) });
  });
}

const camsOf = (page: Page, slot: string) =>
  page
    .locator(`[data-testid="wall-tile"][data-slot="${slot}"] [data-cam]`)
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-cam')));

/** Visible elements under `testId` whose box ends below the --wall-safe margin (clipped content included). */
const belowSafe = (page: Page, testId: string) =>
  page.getByTestId(testId).evaluate((root, max) => {
    const out: string[] = [];
    for (const el of [root, ...root.querySelectorAll('*')]) {
      const r = el.getBoundingClientRect();
      if (el.closest('.sr-only') || r.height === 0) continue;
      if (r.bottom > max + 0.5) out.push(`${el.tagName.toLowerCase()}.${el.getAttribute('class')} ${r.bottom}`);
    }
    return out;
  }, SAFE_BOTTOM);

test('by day: 9 tiles without the app shell, cells 1-5 page after 20 s with a turn bar', async ({ page }) => {
  await wallAt(page, DAY);
  await page.goto('/#/wall?rotate=20&yt=180&set=all&hls=2&wx=0');
  const wall = page.getByTestId('wall');
  await expect(wall).toHaveAttribute('data-night', 'false');
  await expect(page.getByTestId('wall-tile')).toHaveCount(9);
  await expect(page.getByTestId('header-clock')).toHaveCount(0);
  await expect(page.getByTestId('footer')).toHaveCount(0);
  await expect(page.getByTestId('wall-clock')).toContainText('12:');
  await expect(page.getByTestId('pick-compact')).toBeVisible();

  const before = await camsOf(page, 'rotating');
  expect(before).toHaveLength(5);
  await expect(page.locator('[data-slot="rotating"] [data-testid="wall-turn"]')).toHaveCount(5);
  await page.clock.fastForward(20_000);
  await expect.poll(() => camsOf(page, 'rotating')).not.toEqual(before);
  await expect(page.getByTestId('wall-tile')).toHaveCount(9);
});

test('the strip under the grid shows 7 days for every resort', async ({ page }) => {
  await wallAt(page, DAY);
  await page.goto('/#/wall?wx=0');
  const cols = page.getByTestId('wall-week-col');
  await expect(cols).toHaveCount(6);
  const days = page.locator('[data-testid="wall-week-col"] [data-date]');
  await expect(days).toHaveCount(42);
  await expect(days.first()).toHaveText('T'); // Tuesday
  await expect(days.first()).toHaveAttribute('data-date', '2027-01-05');
  await expect(cols.first()).toContainText('—'); // the seed's '{}' NWS payloads
  expect(await belowSafe(page, 'wall-snow')).toEqual([]);
});

test('weather page every wx pages: the cams stay mounted, then come back on the next page', async ({ page }) => {
  await wallAt(page, DAY);
  await page.goto('/#/wall?rotate=20&wx=1&hls=0&set=all');
  await expect(page.getByTestId('wall-tile')).toHaveCount(9);
  await expect(page.getByTestId('wall-weather')).toHaveCount(0);
  const before = await camsOf(page, 'rotating');
  await expect(page.getByTestId('wall-count')).toContainText('page 1/');

  await page.clock.fastForward(20_000);
  await expect(page.getByTestId('wall-weather')).toBeVisible();
  await expect(page.getByTestId('wall-grid')).toBeHidden();
  await expect(page.getByTestId('wall-count')).toContainText('· weather');
  await expect(page.getByTestId('wall-tile')).toHaveCount(9);
  await expect(page.getByTestId('wall-wx-storm')).toHaveText('No NWS forecast'); // the seed's '{}' NWS payloads
  await expect(page.getByTestId('wall-hourly')).toHaveAttribute('data-mode', 'nws'); // fixtures' empty Open-Meteo
  await expect(page.getByTestId('wall-hourly')).toContainText('showing NWS day/night totals');
  await expect(page.locator('[data-testid="wall-weather"] > [data-testid="wall-turn"]')).toHaveCount(1);
  expect(await belowSafe(page, 'wall-weather')).toEqual([]);

  await page.clock.fastForward(20_000);
  await expect(page.getByTestId('wall-weather')).toHaveCount(0);
  await expect(page.getByTestId('wall-grid')).toBeVisible();
  await expect(page.getByTestId('wall-count')).toContainText('page 2/'); // the next cam page, none skipped
  expect(await camsOf(page, 'rotating')).not.toEqual(before);
});

test('with a week of NWS and hourly models: storm day in the strip, storm headline and hourly lanes', async ({
  page,
}) => {
  await wallAt(page, DAY, { snapshot: richSnapshot });
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: richOpenMeteo() }),
  );
  await page.goto('/#/wall?rotate=20&wx=1&hls=0');
  const storm = page.locator('[data-testid="wall-week-col"] [data-storm="true"]');
  await expect(storm).toHaveCount(6);
  await expect(storm.first()).toHaveAttribute('data-date', '2027-01-07');
  await expect(page.getByTestId('wall-week-col').first()).toContainText('14–23″'); // Alta's week, base–summit

  await page.clock.fastForward(20_000);
  await expect(page.getByTestId('wall-wx-storm')).toHaveText('Thu 8–14″ · Alta');
  await expect(page.locator('[data-testid="wall-wx-week"] tbody tr')).toHaveCount(6);
  await expect(page.getByTestId('wall-hourly')).toHaveAttribute('data-mode', 'models');
  await expect(page.locator('.wall-hr-svg')).toHaveCount(6);
  await expect(page.getByTestId('wall-hourly')).toContainText('NBM via Open-Meteo');
  expect(await belowSafe(page, 'wall-weather')).toEqual([]);
});

test('a live stake slot with no stream never doubles its -still twin (set=stakes)', async ({ page }) => {
  await wallAt(page, DAY);
  await page.route(
    (url) => url.pathname === '/api/cams', // as cams.spec.ts: the DV live slot has no stream
    async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as { cams: { id: string }[] };
      const down = { status: 'offline', online: false, live: null };
      body.cams = body.cams.map((c) => (c.id === 'deer-valley-ontario-snowstake-live' ? { ...c, ...down } : c));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    },
  );
  await page.goto('/#/wall?set=stakes');
  await expect(page.getByTestId('wall')).toHaveAttribute('data-set', 'stakes');
  await expect.poll(() => camsOf(page, 'rotating')).toContain('deer-valley-ontario-snowstake-still');
  expect(await camsOf(page, 'rotating')).not.toContain('deer-valley-ontario-snowstake-live');
});

test('at 19:00 local: night mode, stake stills only and no video', async ({ page }) => {
  await wallAt(page, NIGHT);
  await page.goto('/#/wall');
  await expect(page.getByTestId('wall')).toHaveAttribute('data-night', 'true');
  await expect(page.getByTestId('wall-roads')).toBeVisible();
  await expect(page.getByTestId('wall-snow')).toBeVisible();
  await expect(page.getByTestId('wall-weather')).toHaveCount(0);
  await expect(page.getByTestId('pick-compact')).toHaveCount(0);
  await expect(page.locator('[data-testid="wall-tile"][data-slot="stake"]').first()).toBeVisible();
  await expect(page.locator('video')).toHaveCount(0);
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('at 06:30 Denver time night mode is off, whatever the browser time zone', async ({ page }) => {
  await wallAt(page, DAWN);
  await page.goto('/#/wall');
  await expect(page.getByTestId('wall-clock')).toContainText('6:30');
  await expect(page.getByTestId('wall')).toHaveAttribute('data-night', 'false');
});

test('a new X-Build on /api/snapshot reloads the wall exactly once', async ({ page }) => {
  await wallAt(page, DAY, { build: 'other' });
  let loads = 0; // document requests: a reload can land before the first page's load event
  let snapshots = 0;
  page.on('request', (req) => {
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) loads += 1;
  });
  page.on('response', (res) => {
    if (new URL(res.url()).pathname === '/api/snapshot') snapshots += 1;
  });
  // hls=0: a reload while a live HLS player is still loading its playlist surfaces as an unhandled
  // "access control checks" page error on Linux WebKit (CI's phone project), which is noise for this test.
  await page.goto('/#/wall?hls=0');
  // The reloaded page sees the same foreign build too; the 10-min guard keeps it from reloading again.
  await expect.poll(() => [loads, snapshots >= 2]).toEqual([2, true]);
  await expect(page.getByTestId('wall-tile')).toHaveCount(9);
  await page.waitForTimeout(1500);
  expect(loads).toBe(2);
});
