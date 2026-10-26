// Briefing chrome (owner decisions): the first-chair countdown under the title, the phone-only jump bar that shows
// once the pick card has scrolled away (7 chips that fit 375 px, the on-screen section marked), the Wall nav item
// only from WALL_MIN_WIDTH (1280 px), resort cards folded on phones, and the avalanche stand-in zones when UAC has
// no ratings (the seed's avalanche row is empty). Runs in every Playwright project.
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
  const fits = () => bar.evaluate((el) => el.scrollWidth <= el.clientWidth);
  await expect(bar.locator('.jump')).toHaveCount(7);
  await expect(bar.getByRole('link', { name: 'Weather' })).toHaveAttribute('href', '#/weather');
  expect(await fits()).toBe(true);
  const roads = bar.getByRole('button', { name: 'Roads' });
  await roads.click();
  await expect(page.getByTestId('roads').locator('.sec-h')).toBeInViewport();
  await expect(roads).toHaveAttribute('aria-current', 'true');
  await expect(bar.locator('[aria-current]')).toHaveCount(1);
  await page.setViewportSize({ width: 375, height: 667 });
  await expect(bar).toBeVisible();
  expect(await fits()).toBe(true);
});

// Where the list is one column (below 720 px) each card is a <details>: only the pick starts open, and a closed card
// mounts no hero, so its still is first requested when the card is opened. Wider, six plain open articles.
test('resort cards fold on phones: only the pick is open and a closed card requests no hero still', async ({
  page,
}) => {
  const images: string[] = [];
  page.on('request', (r) => {
    if (r.resourceType() === 'image') images.push(r.url());
  });
  await page.goto('/');
  const cards = page.getByTestId('resort-card');
  await expect(cards).toHaveCount(6);
  await expect(page.locator('[data-testid="resort-card"].is-pick')).toHaveCount(1);
  const folded = page.locator('details[data-testid="resort-card"]');
  if ((page.viewportSize()?.width ?? 0) >= 720) {
    await expect(folded).toHaveCount(0);
    await expect(cards.locator('.rc-hero [data-testid="cam-tile"]')).toHaveCount(6);
    for (const card of await cards.all()) await expect(card.locator('.rc-link')).toBeVisible();
    return;
  }
  await expect(folded).toHaveCount(6);
  await expect(page.locator('details.is-pick[data-testid="resort-card"][open]')).toHaveCount(1);
  const closed = page.locator('details[data-testid="resort-card"]:not([open])');
  await expect(closed).toHaveCount(5);
  await expect(closed.locator('img')).toHaveCount(0);
  const id = await closed.first().getAttribute('data-resort');
  const card = page.locator(`[data-testid="resort-card"][data-resort="${id}"]`);
  const summary = card.locator('summary');
  expect((await summary.boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(44);
  const before = [...images];
  await summary.click();
  await expect(card).toHaveJSProperty('open', true);
  const hero = card.locator('.rc-hero img');
  await expect(hero).toHaveAttribute('src', /^https?:/);
  const base = (u: string) => {
    const url = new URL(u);
    return url.origin + url.pathname;
  };
  expect(before.map(base)).not.toContain(base((await hero.getAttribute('src')) ?? ''));
  await expect(card.locator('.rc-link')).toBeVisible();
});

test('avalanche shows both UAC zones with the labelled scale and links even without ratings', async ({ page }) => {
  await page.goto('/');
  const zones = page.getByTestId('avalanche').getByTestId('avy-zone');
  await expect(zones).toHaveCount(2);
  await expect(zones.first()).toContainText('Salt Lake');
  await expect(zones.first().getByRole('link', { name: /UAC Salt Lake forecast/ })).toBeVisible();
  await expect(zones.first().locator('.cond-seg')).toHaveCount(5);
});
