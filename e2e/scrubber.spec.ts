// Timelapse scrubber (spec §6.3, §8.3): a stake tile's [Timelapse] opens the Scrubber in the cam Lightbox. The frame
// list is stubbed here (no upstream calls) and /api/cams is patched so the tile offers the action whatever the local
// D1 holds; the frame images are external URLs, which fixtures.ts answers with a 1x1 GIF.
import { expect, test } from './fixtures.ts';

const CAM = 'snowbird-snowstake';
const N = 8;
const T0 = Date.parse('2026-10-13T19:00:00Z');
const FRAMES = Array.from({ length: N }, (_, i) => {
  const t = T0 + i * 15 * 60_000;
  const full = `https://img.hdrelay.com/frames/8611e276-7ee5-42c0-b8cd-d9e1890e1cd4/default/${t}`;
  return { t, thumb: `${full}/:/rs=h:270`, full };
});

test('a stake tile opens its timelapse; the scrubber lists every frame and ← moves one frame', async ({ page }) => {
  await page.route(
    (url) => url.pathname === '/api/cams',
    async (route) => {
      const res = await route.fetch();
      const body = (await res.json()) as { cams: { id: string; timelapse: unknown }[] };
      for (const c of body.cams) if (c.id === CAM) c.timelapse = { provider: 'hdrelay', available: true };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    },
  );
  const asked: string[] = [];
  await page.route(
    (url) => /^\/api\/stake\/[^/]+\/frames$/.test(url.pathname),
    (route) => {
      asked.push(route.request().url());
      const markers = [{ t: FRAMES[2]?.t, kind: 'last-snow', label: 'Last snow · 1:30 PM' }];
      return route.fulfill({ json: { camId: CAM, provider: 'hdrelay', frames: FRAMES, markers } });
    },
  );
  await page.goto('/');
  const tile = page.getByTestId('stakes').locator(`[data-cam="${CAM}"]`);
  await tile.getByRole('button', { name: /^Timelapse/ }).click();

  const scrubber = page.getByTestId('cam-lightbox').getByTestId('scrubber');
  await expect(scrubber).toHaveAttribute('data-count', String(N));
  await expect(scrubber).toHaveAttribute('data-index', String(N - 1)); // opens on the newest frame
  await expect(scrubber.getByText(`Frame ${N} of ${N} · every`)).toBeVisible(); // 15 min on phones, else 5
  await expect(scrubber.getByRole('button', { name: 'Last snow · 1:30 PM' })).toBeVisible();
  expect(asked).toEqual([expect.stringMatching(new RegExp(`/api/stake/${CAM}/frames\\?hours=24&step=(5|15)$`))]);

  await scrubber.getByRole('slider', { name: 'Timelapse frame' }).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(scrubber).toHaveAttribute('data-index', String(N - 2));
  await expect(scrubber.getByText(`Frame ${N - 1} of ${N}`)).toBeVisible();
  await page.keyboard.press('Home');
  await expect(scrubber).toHaveAttribute('data-index', '0');
  await page.keyboard.press('ArrowRight');
  await expect(scrubber).toHaveAttribute('data-index', '1');
});
