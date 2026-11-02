// Layout stability (the phone audit's CLS): every /api answer is held back until the first paint has been measured,
// then released. The header row keeps its height and the nav its top whether the data is there or not (the "I am"
// chip, or for a set "I am" the [Crew | As me] toggle, holds its slot while the tracker loads), and on a phone the
// waiting pick card keeps about its data height with no empty ridge. pinTime's pattern pins the clock; the hold
// handler, registered last, runs first.
import type { Page } from '@playwright/test';
import { expect, pinTime, seedStorage, test } from './fixtures.ts';

const AT = '2026-10-12T15:00:00Z'; // pre-season: the trip-start preview

/** Pins the clock to AT and holds every /api request until the returned function is called. */
async function holdApi(page: Page): Promise<() => void> {
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await pinTime(page, AT);
  await page.route('**/api/**', async (route) => {
    await gate;
    await route.fallback();
  });
  return release;
}

/** Header and pick boxes once every font in use has loaded. */
async function boxes(page: Page) {
  return page.evaluate(async () => {
    await document.fonts.ready;
    const box = (sel: string) => document.querySelector(sel)?.getBoundingClientRect() ?? null;
    const pick = document.getElementById('pick');
    return {
      row: box('.hdr-row')?.height ?? null,
      nav: box('.app-nav')?.top ?? null,
      fresh: box('[data-testid="global-fresh"]')?.width ?? null,
      band: box('.pick-band')?.height ?? null,
      pick: pick?.getBoundingClientRect().height ?? null,
      pickMin: pick ? getComputedStyle(pick).minHeight : null,
    };
  });
}

test('a first visit: the header keeps its height and the nav its top when the data lands', async ({ page }) => {
  const release = await holdApi(page);
  await page.goto('/');
  await expect(page.getByTestId('pick')).toContainText('Waiting for data…');
  await expect(page.getByTestId('iam-chip').locator('select')).toBeDisabled();
  const before = await boxes(page);
  release();
  await expect(page.locator('#pick-title')).not.toHaveText('Waiting for data…');
  await expect(page.getByTestId('iam-chip').locator('select')).toBeEnabled();
  await expect(page.getByTestId('global-fresh').locator('.fresh')).not.toHaveAttribute('data-badge', 'grey');
  const after = await boxes(page);
  expect(after.row).toBe(before.row);
  expect(after.nav).toBe(before.nav);
  expect(after.fresh).toBe(before.fresh);
});

// A returning crew member: the cached snapshot paints the pick at once, the tracker (not cached) lands later.
test('"I am" already chosen: no chip, and [Crew | As me] holds its place while the tracker loads', async ({
  page,
  request,
}) => {
  const snap = await (await request.get('/api/snapshot')).json();
  await seedStorage(page, { 'utahsnow.me': 'otakar0001', 'utahsnow.snap': snap });
  const release = await holdApi(page);
  await page.goto('/');
  await expect(page.locator('.pick-who')).toHaveText('Loading the crew…');
  await expect(page.getByTestId('iam-chip')).toHaveCount(0);
  await expect(page.getByTestId('pick-view')).toBeVisible();
  const before = await boxes(page);
  release();
  await expect(page.locator('.pick-who')).toContainText(/Crew pick · \d+ going/);
  await expect(page.getByTestId('pick-view')).toBeVisible();
  const after = await boxes(page);
  expect(after.row).toBe(before.row);
  expect(after.nav).toBe(before.nav);
  expect(after.band).toBe(before.band);
});

test.describe('phone width', () => {
  test.use({ viewport: { width: 393, height: 659 } });

  test('the waiting pick card holds its data height without an empty ridge, then fits its content', async ({
    page,
  }) => {
    const release = await holdApi(page);
    await page.goto('/');
    const pick = page.getByTestId('pick');
    await expect(pick).toContainText('Waiting for data…');
    await expect(page.getByTestId('pick-ridge')).toBeHidden();
    const waiting = await boxes(page);
    expect(waiting.pickMin).toBe('760px');
    expect(waiting.pick).toBeGreaterThanOrEqual(760);
    release();
    await expect(page.getByTestId('pick-ridge')).toBeVisible();
    const data = await boxes(page);
    expect(data.pickMin).not.toBe('760px');
    expect(data.row).toBe(waiting.row);
    expect(data.nav).toBe(waiting.nav);
  });

  // 2026-11-01: the outer mountains lost their outer slopes to the ridge's overflow: hidden, and a later column's
  // slope painted over the pick's peak. Mountains are 1.5 columns wide, so this is checked where two overlap.
  test('every ridge mountain fits inside the ridge and the pick peak paints over its neighbour', async ({ page }) => {
    await pinTime(page, AT);
    await page.goto('/');
    await expect(page.getByTestId('pick-ridge')).toBeVisible();
    const got = await page.evaluate(async () => {
      await document.fonts.ready;
      const ridge = document.querySelector('[data-testid="pick-ridge"]') as HTMLElement;
      const box = ridge.getBoundingClientRect();
      const mtns = [...ridge.querySelectorAll('.ridge-mtn')].map((m) => m.getBoundingClientRect());
      const peaks = [...ridge.querySelectorAll('.ridge-pk')];
      const i = peaks.findIndex((p) => p.classList.contains('is-pick'));
      const b = mtns[i];
      let front: boolean | null = null;
      if (b) {
        // a point near the base on the side of a neighbour, inside both triangles: the pick must win
        const x = i < peaks.length - 1 ? b.left + b.width * 0.8 : b.left + b.width * 0.2;
        const y = b.top + b.height * 0.95;
        front = document.elementFromPoint(x, y)?.closest('.ridge-pk')?.classList.contains('is-pick') ?? false;
      }
      return { left: box.left, right: box.right, mtns: mtns.map((m) => [m.left, m.right]), front };
    });
    expect(got.mtns).toHaveLength(6);
    for (const [left, right] of got.mtns) {
      expect(left).toBeGreaterThanOrEqual(got.left - 0.5);
      expect(right).toBeLessThanOrEqual(got.right + 0.5);
    }
    expect(got.front).toBe(true);
  });
});
