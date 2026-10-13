// TV wall (spec §8.4, §8.10) at 1920x1080 in every project (narrower screens get the launcher). Every test also
// fails on any console error (fixtures.ts). The page clock is installed (not fixed) so rotation can be fast-forwarded,
// and every /api Date header is pinned to the same instant, because the app's clock is the server's
// (serverNow = Date.now() + skew).
import type { Page } from '@playwright/test';
import { expect, test } from './fixtures.ts';

test.use({ viewport: { width: 1920, height: 1080 } });

const DAY = '2027-01-05T19:00:00Z'; // 12:00 MST
const NIGHT = '2027-01-06T02:00:00Z'; // 19:00 MST
const DAWN = '2027-01-05T13:30:00Z'; // 06:30 MST: 05:30 in the tz project's Los Angeles browser (spec §8.10)

/** Installs the page clock at `iso`, pins the API Date header to it and optionally stamps /api/snapshot X-Build. */
async function wallAt(page: Page, iso: string, build?: string): Promise<void> {
  const ms = Date.parse(iso);
  await page.clock.install({ time: ms });
  await page.route('**/api/**', async (route) => {
    const res = await route.fetch();
    const headers: Record<string, string> = { ...res.headers(), date: new Date(ms).toUTCString() };
    if (build && new URL(route.request().url()).pathname === '/api/snapshot') headers['x-build'] = build;
    await route.fulfill({ response: res, headers });
  });
}

const camsOf = (page: Page, slot: string) =>
  page
    .locator(`[data-testid="wall-tile"][data-slot="${slot}"] [data-cam]`)
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-cam')));

test('by day: 9 tiles without the app shell, cells 1-5 page after 20 s with a turn bar', async ({ page }) => {
  await wallAt(page, DAY);
  await page.goto('/#/wall?rotate=20&yt=180&set=all&hls=2');
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

test('at 19:00 local: night mode, stake stills only and no video', async ({ page }) => {
  await wallAt(page, NIGHT);
  await page.goto('/#/wall');
  await expect(page.getByTestId('wall')).toHaveAttribute('data-night', 'true');
  await expect(page.getByTestId('wall-roads')).toBeVisible();
  await expect(page.getByTestId('wall-snow')).toBeVisible();
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
  await wallAt(page, DAY, 'other');
  let loads = 0; // document requests: a reload can land before the first page's load event
  let snapshots = 0;
  page.on('request', (req) => {
    if (req.isNavigationRequest() && req.frame() === page.mainFrame()) loads += 1;
  });
  page.on('response', (res) => {
    if (new URL(res.url()).pathname === '/api/snapshot') snapshots += 1;
  });
  await page.goto('/#/wall');
  // The reloaded page sees the same foreign build too; the 10-min guard keeps it from reloading again.
  await expect.poll(() => [loads, snapshots >= 2]).toEqual([2, true]);
  await expect(page.getByTestId('wall-tile')).toHaveCount(9);
  await page.waitForTimeout(1500);
  expect(loads).toBe(2);
});
