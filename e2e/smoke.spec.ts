// Smoke suite (spec §8.10, §14): runs in every Playwright project (phone, laptop, wall, tz) against `vite preview`
// and the local D1 seed. Every test also fails on any console error (fixtures.ts). No snapshots.
import { expect, guardPage, pinTime, test, testidOrder } from './fixtures.ts';
import { cell, freshPerson, planDay, removePerson, trackerApi, useIp } from './tracker-api.ts';

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

// "I am" names a tracker person (seeded crew of 4): the [Crew | As me] toggle appears and switches the card's heading.
test('"as me": choosing a crew member switches the pick between the crew and that person', async ({ page }) => {
  await pinTime(page, '2027-01-05T13:30:00Z');
  await page.goto('/');
  const pick = page.getByTestId('pick');
  await expect(pick).toContainText(/Crew pick · \d+ going/);
  await page.getByTestId('iam-chip').locator('select').selectOption('otakar0001');
  await expect(page.getByTestId('iam-chip')).toHaveCount(0);
  await page.getByTestId('pick-view').getByText('As me').click();
  await expect(pick).toContainText('My pick');
  await expect(pick.locator('.pick-who')).toHaveText('As me: Otakar');
  await page.getByTestId('pick-view').getByText('Crew').click();
  await expect(pick).toContainText("Today's pick");
  await expect(pick).toContainText(/Crew pick · \d+ going/);
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
  for (const hash of ['#/', '#/resort/alta', '#/cams', '#/tracker', '#/settings']) {
    await page.goto(`/${hash}`);
    await expect(page.getByTestId('footer')).toBeVisible();
    const overflow = Number(await page.evaluate('document.documentElement.scrollWidth - innerWidth'));
    expect(overflow, hash).toBeLessThanOrEqual(0);
  }
});

// The tracker tests run before the trip, so every trip date is upcoming: on the phone's day list none is collapsed
// under "Past days", and the same cell() reaches the grid cell or the list chip.
const BEFORE_TRIP = '2026-12-20T17:00:00Z';

// Spec §9.6 / §13: two browsers share one tracker, and undo restores the previous value.
test('tracker: a day set in one browser shows in another, and undo restores it', async ({
  page,
  browser,
  request,
  baseURL,
}, info) => {
  const api = trackerApi(request, baseURL ?? '');
  const who = await freshPerson(api, info.project.name);
  const errors: string[] = [];
  const other = await browser.newContext({ baseURL, viewport: page.viewportSize() });
  try {
    const pageB = await other.newPage();
    await guardPage(pageB, errors);
    await pinTime(page, BEFORE_TRIP);
    await pinTime(pageB, BEFORE_TRIP);
    await useIp(page, api);
    await useIp(pageB, api);
    await page.goto('/#/tracker');
    await pageB.goto('/#/tracker');
    await expect(cell(pageB, who, '2026-12-28')).toHaveAttribute('aria-label', /no day recorded/);

    await cell(page, who, '2026-12-28').click();
    await page.getByTestId('tracker-picker').locator('[data-resort="brighton"]').click();
    await expect(cell(page, who, '2026-12-28')).toContainText('Brighton');
    await expect(page.getByTestId('tracker-sync')).toContainText('Synced');

    await pageB.reload();
    await expect(cell(pageB, who, '2026-12-28')).toContainText('Brighton');
    const list = pageB.getByTestId('tracker-audit-list');
    const id = await list
      .locator('li', { hasText: `${who.name} · ` })
      .first()
      .getAttribute('data-audit');
    const row = list.locator(`li[data-audit="${id}"]`); // pinned: the undo adds a newer row above it
    await row.getByRole('button', { name: 'Undo' }).click();
    await expect(cell(pageB, who, '2026-12-28')).toHaveAttribute('aria-label', /no day recorded/);
    await expect(row).toContainText('Undone');

    await page.reload();
    await expect(cell(page, who, '2026-12-28')).toHaveAttribute('aria-label', /no day recorded/);
    expect(errors, 'second browser console errors').toEqual([]);
  } finally {
    await other.close();
    await removePerson(api, who);
  }
});

// Spec §9.2-9.3 / §13: Alta + Snowbird share 7 days; an 8th is refused with 422 cap-exceeded (API and UI).
test('tracker: an 8th Alta/Snowbird day is refused with 422 cap-exceeded and the UI says so', async ({
  page,
  request,
  baseURL,
  allowErrors,
}, info) => {
  allowErrors.push(/status of 422/); // the refused POST is logged by the browser as a failed resource
  const api = trackerApi(request, baseURL ?? '');
  const who = await freshPerson(api, info.project.name);
  try {
    await pinTime(page, BEFORE_TRIP);
    await useIp(page, api);
    await page.goto('/#/tracker');
    await expect(cell(page, who, '2027-01-03')).toBeVisible();
    // Seven days behind the page's back: its copy still shows all 7 left, so the UI sends the 8th.
    const dates = ['2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02'];
    for (const [i, d] of dates.entries()) {
      expect((await planDay(api, who, d, i % 2 ? 'snowbird' : 'alta')).status).toBe(200);
    }
    const eighth = await planDay(api, who, '2027-01-04', 'alta');
    expect(eighth.status).toBe(422);
    expect(eighth.body).toMatchObject({ error: 'validation', code: 'cap-exceeded', group: 'alta-snowbird' });

    await cell(page, who, '2027-01-03').click();
    await page.getByTestId('tracker-picker').locator('[data-resort="snowbird"]').click();
    await expect(page.getByTestId('tracker-notice')).toContainText('has used all 7');
    await expect(cell(page, who, '2027-01-03')).toHaveAttribute('aria-label', /no day recorded/);

    await page.reload(); // with fresh data the picker offers no 8th Alta/Snowbird day
    const thresholds = page.getByTestId('tracker-threshold-table'); // §9.5: crew row, then one row per person
    await expect(thresholds.locator('tr[data-person="crew"]')).toBeVisible();
    await expect(thresholds.locator(`tr[data-person="${who.id}"] th`)).toHaveText(who.name);
    await cell(page, who, '2027-01-03').click();
    await expect(page.getByTestId('tracker-picker').locator('[data-resort="alta"]')).toBeDisabled();
  } finally {
    await removePerson(api, who);
  }
});
