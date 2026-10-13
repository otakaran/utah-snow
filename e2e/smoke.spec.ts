// Smoke suite (spec §8.10, §14): runs in every Playwright project (phone, laptop, wall, tz) against `vite preview`
// and the local D1 seed. Every test also fails on any console error (fixtures.ts). No snapshots.
import { expect, pinTime, seedStorage, test, testidOrder } from './fixtures.ts';

const BRIEFING = ['header', 'pick', 'stakes', 'resorts', 'roads', 'avalanche', 'forecast', 'footer'] as const;
const RESORT_PAGE = ['head', 'cams', 'snow', 'lifts', 'weather', 'roads', 'avalanche', 'info'] as const;
const RESORT_NAMES = /^(Alta|Snowbird|Brighton|Solitude|Deer Valley|Snowbasin)$/;

test('shell: title, indexing meta and noindex header', async ({ page, request }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Utah Snow');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
  const res = await request.get('/');
  expect(res.headers()['x-robots-tag']).toContain('noindex');
});

test('/api/health returns JSON with a boolean ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('application/json');
  expect(typeof (await res.json()).ok).toBe('boolean');
});

test('briefing renders the spec 8.2 sections in order, then the status line', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('forecast')).toBeVisible();
  expect(await testidOrder(page, BRIEFING)).toEqual([...BRIEFING]);
  await expect(page.getByTestId('status-build')).toContainText('web ');
  await expect(page.getByTestId('status-snapshot')).not.toContainText('loading');
});

test('pick card previews the trip start with a ranked resort', async ({ page }) => {
  await pinTime(page, '2026-10-12T15:00:00Z');
  await page.goto('/');
  const pick = page.getByTestId('pick');
  await expect(pick).toContainText('Preview (trip starts Dec 27)');
  await expect(pick.locator('#pick-title')).toHaveText(RESORT_NAMES);
  await expect(page.getByTestId('pick-reasons').locator('li').first()).toBeVisible();
  await expect(page.getByTestId('pick-ridge')).toBeVisible();
});

// The tracker store is a placeholder until /api/tracker lands (spec §9.3): with no people, "I am" cannot name a
// tracker person, so the [Crew | As me] toggle stays hidden and the card runs one virtual skier.
test('without tracker people the pick stays crew-only even when "me" is stored', async ({ page }) => {
  await seedStorage(page, { 'utahsnow.me': 'otakar0001', 'utahsnow.pickView': 'me' });
  await page.goto('/');
  const pick = page.getByTestId('pick');
  await expect(pick).toContainText('Add the crew in Tracker');
  await expect(page.getByTestId('pick-view')).toHaveCount(0);
  await expect(page.getByTestId('iam-chip')).toHaveCount(0);
});

test('stake row shows at least 4 stake cams', async ({ page }) => {
  await page.goto('/');
  const tiles = page.getByTestId('stakes').getByTestId('cam-tile');
  await expect(tiles.first()).toBeVisible();
  expect(await tiles.count()).toBeGreaterThanOrEqual(4);
});

test('roads panel shows the 4 corridors with a state and an age', async ({ page }) => {
  await page.goto('/');
  const roads = page.getByTestId('roads');
  await expect(roads.getByTestId('road')).toHaveCount(4);
  for (const c of ['lcc', 'bcc', 'parleys', 'snowbasin']) {
    await expect(roads.locator(`[data-testid="road"][data-corridor="${c}"]`)).not.toHaveAttribute('data-state', 'none');
  }
  await expect(roads.locator('.sec-h')).toContainText(/just now|min ago|h ago|d ago/);
});

test('resort page for alta shows its 8 sections in order and its cams', async ({ page }) => {
  await page.goto('/#/resort/alta');
  await expect(page.getByTestId('head')).toContainText('Alta');
  expect(await testidOrder(page, RESORT_PAGE)).toEqual([...RESORT_PAGE]);
  expect(await page.getByTestId('cams').getByTestId('cam-tile').count()).toBeGreaterThanOrEqual(8);
});

test('an unknown resort id redirects to the briefing', async ({ page }) => {
  await page.goto('/#/resort/nope');
  await expect(page).toHaveURL(/#\/$/);
  await expect(page.getByTestId('pick')).toBeVisible();
});

test('cams page lists every resort and road corridor', async ({ page }) => {
  await page.goto('/#/cams');
  for (const id of ['alta', 'snowbird', 'brighton', 'solitude', 'deer-valley', 'snowbasin']) {
    await expect(page.getByTestId(`cams-${id}`)).toBeVisible();
  }
  await expect(page.locator('[data-testid^="cams-road-"]')).toHaveCount(4);
});

test('settings: the units toggle switches inches to centimetres', async ({ page }) => {
  await page.goto('/#/settings');
  const example = page.getByTestId('units-example');
  await expect(example).not.toContainText('cm');
  await page.getByTestId('settings-units').getByText('Metric').click();
  await expect(example).toContainText('cm');
});

test('the theme toggle flips <html data-theme>', async ({ page }) => {
  await page.goto('/');
  const html = page.locator('html');
  const before = await html.getAttribute('data-theme');
  expect(before === 'dark' || before === 'sun').toBe(true);
  const toggle = page.getByTestId('theme-toggle');
  if (!(await toggle.isVisible())) await page.locator('.hdr-more').click(); // phone: inside the ⋯ menu
  await toggle.click();
  await expect(html).toHaveAttribute('data-theme', before === 'dark' ? 'sun' : 'dark');
});

test('header clock shows Denver time and the pick runs for today on a trip morning', async ({ page }) => {
  await pinTime(page, '2027-01-05T13:30:00Z'); // 06:30 MST; the tz project's browser is in Los Angeles
  await page.goto('/');
  await expect(page.getByTestId('header-clock')).toContainText('6:30');
  await expect(page.getByTestId('header-clock')).toContainText('AM');
  await expect(page.getByTestId('pick')).toContainText("Today's pick");
});

test('no horizontal scroll on any page', async ({ page }) => {
  for (const hash of ['#/', '#/resort/alta', '#/cams', '#/settings']) {
    await page.goto(`/${hash}`);
    await expect(page.getByTestId('footer')).toBeVisible();
    const overflow = Number(await page.evaluate('document.documentElement.scrollWidth - innerWidth'));
    expect(overflow, hash).toBeLessThanOrEqual(0);
  }
});
