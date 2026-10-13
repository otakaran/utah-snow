// #/cams and the resort page's jump row (spec §8.3, §8.7): Deer Valley shows its Ontario stake once when the live
// slot has no stream (/api/cams is patched to say so, as production does today), every resort section leads with
// a stake hero tile, and the jump buttons and resort links go where they say.
import { expect, test } from './fixtures.ts';

const RESORTS = ['alta', 'snowbird', 'brighton', 'solitude', 'deer-valley', 'snowbasin'] as const;
const DV_LIVE = 'deer-valley-ontario-snowstake-live';

test('cams: Deer Valley shows one Ontario stake tile when its live slot has no stream', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/api/cams',
    async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as { cams: { id: string }[] };
      const down = { status: 'offline', online: false, live: null };
      body.cams = body.cams.map((c) => (c.id === DV_LIVE ? { ...c, ...down } : c));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    },
  );
  await page.goto('/#/cams');
  const dv = page.getByTestId('cams-deer-valley');
  await expect(dv.locator('[data-cam^="deer-valley-ontario"]')).toHaveCount(1);
  const ids = await dv.getByTestId('cam-tile').evaluateAll((els) => els.map((el) => el.getAttribute('data-cam')));
  expect(new Set(ids).size).toBe(ids.length);
});

test('cams: every resort section leads with a stake hero tile twice the width of the next', async ({ page }) => {
  await page.goto('/#/cams');
  for (const id of RESORTS) {
    const tiles = page.getByTestId(`cams-${id}`).locator('.cam-gallery > li');
    await expect(tiles.first()).toHaveClass(/cam-hero/);
    const [hero, next] = [await tiles.nth(0).boundingBox(), await tiles.nth(1).boundingBox()];
    expect(hero && next && hero.width > next.width * 1.5, id).toBe(true);
  }
});

test('jump bars scroll to their section; resort chips link to the other resorts', async ({ page }) => {
  await page.goto('/#/cams');
  await page.getByTestId('jumpbar').getByRole('button', { name: 'Roads' }).click();
  await expect(page.locator('#cams-road-lcc-title')).toBeInViewport();

  await page.goto('/#/resort/alta');
  await page.getByTestId('jumpbar').getByRole('button', { name: 'Parking' }).click();
  await expect(page.locator('#info-title')).toBeInViewport();
  await page.getByRole('navigation', { name: 'Resorts' }).getByRole('link', { name: 'Snowbird' }).click();
  await expect(page).toHaveURL(/#\/resort\/snowbird$/);
  await expect(page.getByTestId('head')).toContainText('Snowbird');
});
