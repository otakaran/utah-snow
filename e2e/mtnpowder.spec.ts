// MtnPowder browser fallback (src/web/data/mtnpowder.ts). The clock is pinned months past the local seed, so every
// Worker row is red and the browser fetches both feeds itself. The stub answers Solitude (65) with an in-season
// fixture and Deer Valley (49) with the live preseason one; their rows replace the seed's and say "via browser".
import { readFileSync } from 'node:fs';
import { expect, pinTime, test } from './fixtures.ts';

const FIXTURES = 'src/worker/sources/fixtures/mtnpowder';
const FEEDS: Record<string, string> = {
  '65': readFileSync(`${FIXTURES}/20220314-inseason-solitude.json`, 'utf8'),
  '49': readFileSync(`${FIXTURES}/20261012-live-deer-valley.json`, 'utf8'),
};

test('red MtnPowder rows are fetched by the browser and shown via browser', async ({ page }) => {
  const asked: URL[] = [];
  await page.route('https://mtnpowder.com/**', (route) => {
    const url = new URL(route.request().url());
    asked.push(url);
    return route.fulfill({ contentType: 'application/json', body: FEEDS[url.searchParams.get('resortId') ?? ''] });
  });
  await pinTime(page, '2027-01-05T13:30:00Z');
  await page.goto('/#/resort/solitude');
  await expect(page.getByTestId('head')).toContainText('8 / 8'); // lifts open, from the browser-fetched feed
  await expect.poll(() => asked.length).toBe(2);
  expect(asked.map((u) => u.searchParams.get('resortId')).sort()).toEqual(['49', '65']);
  expect(asked.every((u) => /^\d+$/.test(u.searchParams.get('_') ?? ''))).toBe(true);

  await page.goto('/');
  await page.locator('.brief-sources summary').click();
  const row = (id: string) => page.locator('.brief-sources .src-row', { hasText: id });
  await expect(row('resort:solitude')).toContainText('via browser');
  await expect(row('resort:solitude')).toContainText('OK');
  await expect(row('resort:deer-valley')).toContainText('via browser');
  await expect(row('resort:deer-valley')).toContainText('Off-season');
  expect(asked).toHaveLength(2); // the reload reads the shared cache instead of fetching again
});
