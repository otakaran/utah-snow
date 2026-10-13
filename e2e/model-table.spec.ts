// Resort page ModelTable (spec §8.7.5): the Open-Meteo models for today and the next two days, one column per model.
// Open-Meteo gets a canned body (C.5 shape) in which HRRR ends after two days.
import { expect, pinTime, test } from './fixtures.ts';

const DAYS = ['2027-01-05', '2027-01-06', '2027-01-07', '2027-01-08', '2027-01-09', '2027-01-10', '2027-01-11'];
const daily = {
  time: DAYS,
  snowfall_sum_ncep_hrrr_conus: [1.2, 3.4, null, null, null, null, null],
  snowfall_sum_ncep_nbm_conus: [1, 2, 3, 0, 0, 0, 0],
  snowfall_sum_ecmwf_ifs: [0.8, 2.5, 4, 0, 0, 0, 0],
  snowfall_sum_ncep_gfs_global: [0.5, 1.5, 2, 0, 0, 0, 0],
};
const BODY = JSON.stringify(Array.from({ length: 6 }, () => ({ daily, hourly: { time: [] } })));

test('resort page shows the model table with HRRR, NBM, ECMWF and GFS columns', async ({ page }) => {
  await pinTime(page, '2027-01-05T13:30:00Z');
  await page.route('https://api.open-meteo.com/**', (route) =>
    route.fulfill({ contentType: 'application/json', body: BODY }),
  );
  await page.goto('/#/resort/alta');
  const table = page.getByTestId('weather').getByTestId('model-table');
  await expect(table.locator('thead th[data-model]')).toHaveText(['HRRR', 'NBM', 'ECMWF', 'GFS']);
  await expect(table.locator('tbody tr')).toHaveCount(3);
  await expect(table.locator('tbody tr').first().locator('th')).toHaveText('Today');
  await expect(table.locator('tr[data-date="2027-01-06"] td[data-model="ecmwf_ifs"]')).toContainText('2.5″');
  await expect(table.locator('tr[data-date="2027-01-07"] td[data-model="ncep_hrrr_conus"]')).toContainText('—');
});
