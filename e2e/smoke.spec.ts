// Shell smoke test (spec §8.10, §8.6): runs in every Playwright project (phone, laptop, wall, tz).
import { expect, test } from '@playwright/test';

test('briefing shell renders with header and indexing meta', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('Utah Snow');
  await expect(page.getByTestId('header')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex,nofollow');
  await expect(page.locator('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer');
});

test('status list renders build, cron and snapshot rows', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('status')).toBeVisible();
  await expect(page.getByTestId('status-build')).toContainText('web ');
  await expect(page.getByTestId('status-build')).not.toContainText('loading');
  await expect(page.getByTestId('status-snapshot')).not.toContainText('loading');
});

test('/api/health returns JSON with a boolean ok', async ({ request }) => {
  const res = await request.get('/api/health');
  expect(res.ok()).toBe(true);
  expect(res.headers()['content-type']).toContain('application/json');
  const body = await res.json();
  expect(typeof body.ok).toBe('boolean');
});

test('/ sends X-Robots-Tag noindex', async ({ request }) => {
  const res = await request.get('/');
  expect(res.headers()['x-robots-tag']).toContain('noindex');
});
