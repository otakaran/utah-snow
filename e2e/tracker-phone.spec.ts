// Tracker below 900 px (spec §9.5): the day list replaces the grid (today first, past days collapsed), a chip edit
// confirms in the page notice with an Undo, and the days-left card follows. From 900 px the grid stays, the list is
// hidden, and a grid that mounted hidden scrolls to today once it shows. The clock is pinned inside the trip so the
// list order is fixed. Own "E2E <project>-list" person, so it never collides with smoke.spec.ts's per-project person.
import { expect, pinTime, test } from './fixtures.ts';
import { freshPerson, removePerson, trackerApi, useIp } from './tracker-api.ts';

const TODAY = '2027-01-03';

test('tracker: below 900 px a day list replaces the grid; a chip edit says saved and Undo reverts it', async ({
  page,
  request,
  baseURL,
}, info) => {
  await pinTime(page, '2027-01-03T17:00:00Z'); // 10:00 MST, trip day 8
  const size = page.viewportSize() ?? { width: 0, height: 0 };
  const narrow = size.width < 900;
  if (!narrow) {
    await page.setViewportSize({ ...size, width: 820 }); // a portrait tablet: the grid mounts hidden
    await page.goto('/#/tracker');
    await expect(page.getByTestId('tracker-daylist')).toBeVisible();
    await page.setViewportSize(size); // turned to landscape: the grid shows, scrolled to today
    await expect(page.getByTestId('tracker-grid')).toBeVisible();
    await expect(page.getByTestId('tracker-daylist')).toBeHidden();
    await expect.poll(() => page.locator('.trk-grid-wrap').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
    return;
  }
  const api = trackerApi(request, baseURL ?? '');
  const who = await freshPerson(api, `${info.project.name}-list`);
  try {
    await useIp(page, api);
    await page.goto('/#/tracker');
    const list = page.getByTestId('tracker-daylist');
    await expect(list).toBeVisible();
    await expect(page.getByTestId('tracker-grid')).toBeHidden();
    await expect(list.locator('li[data-date]').first()).toHaveAttribute('data-date', TODAY);
    await expect(list.locator('details summary')).toHaveText('Past days (7)');

    const chip = list.locator(`li[data-date="${TODAY}"] [data-testid="tracker-chip"][data-person="${who.id}"]`);
    await expect(chip).toHaveAttribute('aria-label', /no day recorded/);
    await chip.click();
    await page.getByTestId('tracker-picker').locator('[data-resort="brighton"]').click();
    await expect(chip).toContainText('Brighton');
    await expect(chip).toContainText('Planned');

    const notice = page.getByTestId('tracker-notice');
    await expect(notice).toContainText(`${who.name} → Brighton, Jan 3 saved`);
    const caps = page.getByTestId('tracker-threshold-table').locator(`tr[data-person="${who.id}"]`);
    await expect(caps.locator('td[data-group="brighton"]')).toHaveAttribute('data-left', '6');

    await notice.getByRole('button', { name: 'Undo' }).click();
    await expect(chip).toHaveAttribute('aria-label', /no day recorded/);
    await expect(notice).toContainText('Undone');
    await expect(caps.locator('td[data-group="brighton"]')).toHaveAttribute('data-left', '7');

    await list.locator('details summary').click(); // past days open on tap, most recent first
    await expect(list.locator('details li[data-date]').first()).toHaveAttribute('data-date', '2027-01-02');
  } finally {
    await removePerson(api, who);
  }
});

test('tracker head counts down to first chair before the trip', async ({ page }) => {
  await pinTime(page, '2026-12-20T17:00:00Z');
  await page.goto('/#/tracker');
  await expect(page.getByTestId('countdown')).toHaveText(/^7\s*days to first chair$/i);
});
