// The #/weather page (concept B "Storm Timeline") in every Playwright project, against a seeded storm
// (weather-fixture.ts: Alta's NWS rows, a Winter Storm Warning, AFD key messages, 7 days of Open-Meteo hours).
// Every test also fails on any console error (fixtures.ts).
import type { Page } from '@playwright/test';
import { expect, test, testidOrder } from './fixtures.ts';
import { weatherAt } from './weather-fixture.ts';

const SECTIONS = ['weather-alerts', 'week', 'outlook', 'hourly', 'discussion'] as const;
const title = (page: Page, id: string) => page.getByTestId(id).locator('.sec-title');

test('sections in order, the nav tab, the alert strip and a resort switch from the jump row', async ({ page }) => {
  await weatherAt(page);
  await page.goto('/#/weather?r=alta');
  await expect(title(page, 'outlook')).toHaveText('Alta · 8-day outlook');
  expect(await testidOrder(page, SECTIONS)).toEqual([...SECTIONS]);
  const nav = page.getByRole('navigation', { name: 'Main' });
  await expect(nav.getByRole('link', { name: 'Weather' })).toHaveAttribute('aria-current', 'page');

  const alert = page.getByTestId('weather-alerts').getByTestId('weather-alert');
  await expect(alert).toHaveCount(1);
  await expect(alert).toContainText('Winter Storm Warning');
  await expect(alert.locator('.chip')).toHaveAttribute('data-tone', 'bad');
  await expect(alert.locator('.chip-word')).toHaveText('Warning');
  await expect(alert).toContainText('Alta · Snowbird · Brighton · Solitude · Deer Valley');

  await expect(page.getByTestId('week').locator('.wx-lead')).toContainText('Most snow: Alta');
  await expect(page.getByTestId('week').locator('.wx-lane[data-resort]')).toHaveCount(6);
  await expect(page.getByTestId('outlook').locator('.wx-col')).toHaveCount(8);

  await page.getByTestId('jumpbar').getByRole('link', { name: 'Snowbird' }).click();
  await expect(page).toHaveURL(/#\/weather\?r=snowbird$/);
  await expect(title(page, 'outlook')).toHaveText('Snowbird · 8-day outlook');
  await expect(page.getByTestId('outlook')).toContainText('No NWS forecast for Snowbird yet.');
  await expect(title(page, 'hourly')).toHaveText('Snowbird · next 48 hours');
});

test('a lane name opens that resort and scrolls to its outlook', async ({ page }) => {
  await weatherAt(page);
  await page.goto('/#/weather?r=alta');
  await page.getByTestId('week').locator('.wx-lane[data-resort="brighton"] a').click();
  await expect(page).toHaveURL(/#\/weather\?r=brighton$/);
  await expect(title(page, 'outlook')).toHaveText('Brighton · 8-day outlook');
  await expect(title(page, 'outlook')).toBeInViewport();
});

test('hourly: three lanes in one labelled figure, the HRRR | GFS seam and the every-3-hours table', async ({
  page,
}) => {
  await weatherAt(page);
  await page.goto('/#/weather?r=alta');
  const hourly = page.getByTestId('hourly');
  const figure = hourly.getByRole('img');
  await expect(figure).toHaveAttribute('aria-label', /^Alta, next 48 hours: .+ of snow, heaviest around /);
  await expect(figure.locator('svg')).toHaveCount(3);
  await expect(hourly.locator('.wx-seam')).toHaveText('HRRR | GFS');
  await hourly.getByText('Every 3 hours').click();
  await expect(hourly.getByTestId('hourly-row')).toHaveCount(16);
  await expect(hourly.getByTestId('hourly-row').first().locator('th')).toHaveText('Tue 1 PM');
});

test('bare #/weather shows the crew pick (★ in the jump row), else the first resort', async ({ page }) => {
  await weatherAt(page);
  await page.goto('/#/weather');
  await expect(page.getByTestId('week').locator('.wx-lead')).toBeVisible();
  const star = page.getByTestId('jumpbar').locator('a:has(.jump-star)');
  const shown = async () => `#/weather?r=${await page.getByTestId('weather').getAttribute('data-resort')}`;
  const wanted = async () => ((await star.count()) ? await star.getAttribute('href') : '#/weather?r=alta');
  await expect.poll(async () => (await shown()) === (await wanted())).toBe(true); // the pick may land a beat later
  await expect(page.getByTestId('jumpbar').locator('a[aria-current="page"]')).toHaveAttribute('href', await shown());
});

test('the briefing forecast is a compact teaser linking to #/weather; the resort page links too', async ({ page }) => {
  await weatherAt(page);
  await page.goto('/');
  const fc = page.getByTestId('forecast');
  await expect(fc.getByTestId('forecast-row')).toHaveCount(6);
  await expect(fc.locator('thead th')).toHaveText(['Resort', 'Today', 'Tonight', 'Wed', 'Models']);
  await expect(fc.locator('.cond-fc-lead')).toContainText('Most snow: Alta');
  await fc.getByRole('link', { name: 'Full weather →' }).click();
  await expect(page).toHaveURL(/#\/weather$/);
  await expect(page.getByTestId('weather')).toBeVisible();

  await page.goto('/#/resort/snowbasin');
  const link = page.getByTestId('weather').getByRole('link', { name: 'Full weather →' });
  await expect(link).toHaveAttribute('href', '#/weather?r=snowbasin');
});

test('the empty canned Open-Meteo body shows a plain-text hourly state; NWS sections still render', async ({
  page,
}) => {
  await weatherAt(page, { om: false }); // the fixture guard answers Open-Meteo with `time: []`
  await page.goto('/#/weather?r=alta');
  const hourly = page.getByTestId('hourly');
  await expect(hourly.locator('.wx-empty')).toHaveText('Hourly models unavailable.');
  await expect(hourly.locator('svg')).toHaveCount(0);
  await expect(page.getByTestId('outlook').locator('.wx-col')).toHaveCount(8);
  await expect(page.getByTestId('discussion')).toContainText('A strong Pacific trough');
});
