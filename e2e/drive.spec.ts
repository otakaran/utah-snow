// Custom base (spec §8.5, §7 GET /api/drive): set through the settings form, the resort cards show the nearest
// preset's minutes as "≈" while /api/drive is pending, then the answer. /api/drive is stubbed with the drive that
// e2e/seed.sql caches for 40.761,-111.891 (alta 48 min), so no OSRM call is made.
import { expect, test } from './fixtures.ts';

const DRIVE = {
  origin: { lat: 40.761, lon: -111.891 },
  results: {
    alta: { min: 48, mi: 31.2 },
    snowbird: { min: 45, mi: 29.9 },
    brighton: { min: 46, mi: 31.0, via: 'bcc-mouth' },
    solitude: { min: 43, mi: 28.6, via: 'bcc-mouth' },
    'deer-valley': { min: 41, mi: 34.5 },
    snowbasin: { min: 52, mi: 47.8 },
  },
  computedAt: '2026-10-13T12:00:00Z',
};
const LINK = 'https://www.google.com/maps/place/Hotel/@40.7601,-111.8952,15z/data=!4m6!3m5!3d40.76084!4d-111.89104';

test('custom base form: bounds error, then ≈ the nearest preset until /api/drive answers', async ({ page }) => {
  const asked: string[] = [];
  let answer = () => {};
  const answered = new Promise<void>((resolve) => {
    answer = resolve;
  });
  await page.route(/\/api\/drive\?/, async (route) => {
    asked.push(new URL(route.request().url()).search);
    await answered;
    await route.fulfill({ json: DRIVE });
  });

  await page.goto('/#/settings');
  const form = page.getByTestId('base-custom');
  await form.getByLabel('Name').fill('E2E Hotel');
  await form.getByLabel('Latitude').fill('40.2');
  await form.getByLabel('Longitude').fill('-111.9');
  await form.getByRole('button', { name: 'Use this base' }).click();
  await expect(page.getByTestId('base-custom-error')).toContainText('Outside the Wasatch area');

  await form.getByLabel('Paste Google Maps link').fill(LINK);
  await expect(form.getByLabel('Latitude')).toHaveValue('40.761');
  await expect(form.getByLabel('Longitude')).toHaveValue('-111.891');
  await form.getByRole('button', { name: 'Use this base' }).click();
  await expect(page.getByTestId('base-custom-active')).toContainText('E2E Hotel (40.761, -111.891)');
  await expect(page.getByTestId('base-chip')).toContainText('E2E Hotel');

  await page.locator('.app-brand').click();
  const alta = page.locator('[data-testid="resort-card"][data-resort="alta"]');
  await expect(alta).toContainText('≈ 46 min'); // downtown-slc, the nearest preset
  answer();
  await expect(alta).toContainText('48 min');
  await expect(alta).not.toContainText('≈');
  expect(asked).toEqual(['?lat=40.761&lon=-111.891']);
  const stored = await page.evaluate(() => localStorage.getItem('utahsnow.driveCustom'));
  expect(JSON.parse(stored ?? 'null')).toMatchObject({ key: '40.761,-111.891', results: { alta: { min: 48 } } });
});
