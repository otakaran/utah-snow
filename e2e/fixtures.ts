// Shared Playwright setup for smoke.spec.ts: every test fails on a console error or page error, and nothing leaves
// localhost (Open-Meteo gets a canned 6-location body, cam images a 1x1 GIF), so runs are fast and never count
// against the crew's shared Open-Meteo limit. `pinTime` fakes the browser clock AND the API Date header, because
// the app derives its clock from the server Date (serverNow = Date.now() + skew).
import { test as base, expect, type Page } from '@playwright/test';

const GIF = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
const series = { time: [] as string[] };
const OPEN_METEO = JSON.stringify(Array.from({ length: 6 }, () => ({ daily: series, hourly: series })));
const LOCAL = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//;

/** Records console and page errors of `page` into `errors` and stubs every non-localhost request. */
export async function guardPage(page: Page, errors: string[]): Promise<void> {
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.route(
    (url) => !LOCAL.test(url.href),
    (route) => {
      const req = route.request();
      if (req.url().startsWith('https://api.open-meteo.com/')) {
        return route.fulfill({ contentType: 'application/json', body: OPEN_METEO });
      }
      if (req.resourceType() === 'image') return route.fulfill({ contentType: 'image/gif', body: GIF });
      return route.fulfill({ status: 204, body: '' });
    },
  );
}

/**
 * `consoleErrors` (auto) fails the test on any console error not matched by `allowErrors`; a test that expects a
 * refused write (a 422 shows as "Failed to load resource" in the console) pushes a pattern to `allowErrors`.
 */
export const test = base.extend<{ consoleErrors: string[]; allowErrors: RegExp[] }>({
  // biome-ignore lint/correctness/noEmptyPattern: Playwright reads a fixture's dependencies from this pattern.
  allowErrors: async ({}, use) => {
    await use([]);
  },
  consoleErrors: [
    async ({ page, allowErrors }, use) => {
      const errors: string[] = [];
      await guardPage(page, errors);
      await use(errors);
      expect(
        errors.filter((e) => !allowErrors.some((r) => r.test(e))),
        'console errors',
      ).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Freezes the page clock at `iso` and rewrites every /api Date header to match, so the app's server clock is `iso`. */
export async function pinTime(page: Page, iso: string): Promise<void> {
  const ms = Date.parse(iso);
  await page.clock.setFixedTime(ms);
  await page.route('**/api/**', async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, headers: { ...res.headers(), date: new Date(ms).toUTCString() } });
  });
}

/** Sets localStorage keys (JSON values) before the app boots. */
export async function seedStorage(page: Page, entries: Record<string, unknown>): Promise<void> {
  await page.addInitScript((e) => {
    for (const [k, v] of Object.entries(e)) localStorage.setItem(k, JSON.stringify(v));
  }, entries);
}

/** data-testids in document order, keeping only `wanted` (first occurrence of each). */
export async function testidOrder(page: Page, wanted: readonly string[]): Promise<string[]> {
  const ids = await page.$$eval('[data-testid]', (els) => els.map((el) => el.getAttribute('data-testid') ?? ''));
  return [...new Set(ids.filter((id) => wanted.includes(id)))];
}
