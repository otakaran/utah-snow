// Briefing chrome (owner decisions): the first-chair countdown under the title, the phone-only jump bar that shows
// once the pick card has scrolled away, the Wall nav item only from WALL_MIN_WIDTH (1280 px), and the avalanche
// stand-in zones when UAC has no ratings (the seed's avalanche row is empty). Runs in every Playwright project.
import { WALL_MIN_WIDTH } from '../config/wall.ts';
import { expect, pinTime, test } from './fixtures.ts';

test('the briefing head counts the days to first chair before the trip', async ({ page }) => {
  await pinTime(page, '2026-10-12T15:00:00Z'); // 9 AM MDT, 76 days before Dec 27
  await page.goto('/');
  await expect(page.getByTestId('header').getByTestId('countdown')).toHaveText('76 days to first chair');
});

test('phones get a jump bar once the pick card has scrolled away; Wall leaves the nav below 1280 px', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('forecast')).toBeVisible();
  const width = page.viewportSize()?.width ?? 0;
  const bar = page.getByTestId('jumpbar');
  await expect(bar).toBeHidden();
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Wall' })).toBeVisible({
    visible: width >= WALL_MIN_WIDTH,
  });
  await page.evaluate('window.scrollBy(0, document.getElementById("pick").getBoundingClientRect().bottom + 10)');
  if (width >= 900) {
    await expect(bar).toBeHidden();
    return;
  }
  await expect(bar).toBeVisible();
  await bar.getByRole('button', { name: 'Roads' }).click();
  await expect(page.getByTestId('roads').locator('.sec-h')).toBeInViewport();
});

test('avalanche shows both UAC zones with the labelled scale and links even without ratings', async ({ page }) => {
  await page.goto('/');
  const zones = page.getByTestId('avalanche').getByTestId('avy-zone');
  await expect(zones).toHaveCount(2);
  await expect(zones.first()).toContainText('Salt Lake');
  await expect(zones.first().getByRole('link', { name: /UAC Salt Lake forecast/ })).toBeVisible();
  await expect(zones.first().locator('.cond-seg')).toHaveCount(5);
});
