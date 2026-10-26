// The Playwright side of scripts/audit-phone.ts: an iPhone 15 context (Chromium by default, WebKit with --webkit),
// slow-4G + 4x CPU through CDP (Chromium only), a request log from Playwright's network events (real bytes, also
// for cross-origin cam stills), then: load and settle -> layout at scrollY 0 -> the jump bar once #pick has
// scrolled away -> scroll to the bottom and settle -> layout again. A second, unthrottled Chromium pass records
// V8 JS coverage on load, so instrumentation never inflates the long tasks of the first pass.
import { setTimeout as sleep } from 'node:timers/promises';
import {
  type Browser,
  type BrowserContext,
  chromium,
  devices,
  type Page,
  type Request,
  webkit,
} from '@playwright/test';
import { initAudit, readAudit } from './init.ts';
import { probeJump } from './jump.ts';
import { collectLayout, type Opts } from './metrics.ts';
import {
  type Audit,
  aboveFold,
  foldImages,
  type Phase,
  type Req,
  shiftSum,
  sumBytes,
  tasks,
  usedChars,
} from './report.ts';

export interface RunOpts {
  url: string;
  route: string;
  webkit: boolean;
}

const { defaultBrowserType: _engine, ...IPHONE } = devices['iPhone 15'];
const OM_BODY = JSON.stringify(Array.from({ length: 6 }, () => ({ daily: { time: [] }, hourly: { time: [] } })));
const THROTTLE = { rttMs: 150, downKbps: 1600, upKbps: 750, cpu: 4 };
const OPTS: Opts = { tap: 44, minText: 12, allow: '.cam-strip, .jumpbar, .rs-table-wrap' };
const JUMP = { extra: ['Weather', 'Wx'], drop: 'Stakes' };

interface Net {
  phase: Phase;
  log: Map<Request, Req>;
  inflight: Set<Request>;
  pending: Promise<unknown>[];
}

function trackNet(page: Page): Net {
  const net: Net = { phase: 'load', log: new Map(), inflight: new Set(), pending: [] };
  page.on('request', (r) => {
    if (r.url().startsWith('data:')) return;
    net.inflight.add(r);
    net.log.set(r, { url: r.url(), type: r.resourceType(), phase: net.phase, bytes: 0, status: 0 });
  });
  page.on('requestfinished', (r) => {
    net.inflight.delete(r);
    const rec = net.log.get(r);
    if (!rec) return;
    net.pending.push(
      r.sizes().then(
        (s) => (rec.bytes = s.responseBodySize + s.responseHeadersSize),
        () => 0,
      ),
      r.response().then(
        (res) => (rec.status = res?.status() ?? 0),
        () => 0,
      ),
    );
  });
  page.on('requestfailed', (r) => {
    net.inflight.delete(r);
    const rec = net.log.get(r);
    if (rec) rec.status = -1;
  });
  return net;
}

/** Waits until nothing has been in flight for `quietMs`, at most `capMs`. */
async function settle(net: Net, quietMs: number, capMs: number): Promise<void> {
  const t0 = performance.now();
  let quiet = t0;
  while (performance.now() - t0 < capMs) {
    if (net.inflight.size > 0) quiet = performance.now();
    else if (performance.now() - quiet >= quietMs) return;
    await sleep(100);
  }
}

async function throttle(context: BrowserContext, page: Page): Promise<void> {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: THROTTLE.rttMs,
    downloadThroughput: (THROTTLE.downKbps * 1024) / 8,
    uploadThroughput: (THROTTLE.upKbps * 1024) / 8,
    connectionType: 'cellular4g',
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE.cpu });
}

async function openPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ ...IPHONE, serviceWorkers: 'block' });
  await context.addInitScript(initAudit, OM_BODY);
  const page = await context.newPage();
  page.setDefaultTimeout(60_000);
  return { context, page };
}

/** Scrolls #pick out of view (BriefJump's IntersectionObserver shows the bar), then probes it. */
async function jumpAfterPick(page: Page) {
  const has = await page.evaluate(() => {
    const pick = document.getElementById('pick');
    if (!pick || !document.querySelector('.brief-jump')) return false;
    scrollTo(0, pick.getBoundingClientRect().bottom + scrollY + 10);
    return true;
  });
  if (!has) return null;
  await sleep(1_000);
  return page.evaluate(probeJump, JUMP);
}

/** Scrolls to the bottom in 90 %-viewport steps so every lazy section gets its turn on screen. */
async function scrollThrough(page: Page): Promise<void> {
  for (let i = 0; i < 80; i++) {
    const done = await page.evaluate(() => {
      scrollBy(0, Math.round(innerHeight * 0.9));
      return scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
    });
    await sleep(700);
    if (done) return;
  }
}

async function coverage(browser: Browser, target: string, origin: string) {
  const { page } = await openPage(browser);
  const net = trackNet(page);
  await page.coverage.startJSCoverage({ resetOnNavigation: false });
  await page.goto(target, { waitUntil: 'load' });
  await page.waitForSelector('main [data-testid]');
  await settle(net, 1_500, 20_000);
  const entries = await page.coverage.stopJSCoverage();
  return entries
    .filter((e) => e.url.startsWith(`${origin}/`) && e.source)
    .map((e) => ({ url: e.url, chars: e.source?.length ?? 0, used: usedChars(e.functions, e.source?.length ?? 0) }));
}

export async function audit(o: RunOpts): Promise<Omit<Audit, 'at'>> {
  const origin = new URL(o.url).origin;
  const target = `${origin}/${o.route}`;
  const browser = await (o.webkit ? webkit : chromium).launch();
  try {
    const { context, page } = await openPage(browser);
    const net = trackNet(page);
    if (!o.webkit) await throttle(context, page);
    await page.goto(target, { waitUntil: 'load', timeout: 120_000 });
    await page.waitForSelector('main [data-testid]');
    await settle(net, 2_000, 45_000);
    const r0 = await page.evaluate(readAudit);
    const layout = await page.evaluate(collectLayout, OPTS);
    net.phase = 'scroll';
    const scrollFrom = (await page.evaluate(readAudit)).now;
    const jump = await jumpAfterPick(page);
    await scrollThrough(page);
    await settle(net, 2_000, 30_000);
    const r1 = await page.evaluate(readAudit);
    await page.evaluate(() => scrollTo(0, 0));
    const afterScroll = await page.evaluate(collectLayout, OPTS);
    await Promise.all(net.pending);
    const reqs = [...net.log.values()];
    const loadReqs = reqs.filter((r) => r.phase === 'load');
    const loaded = new Set(loadReqs.map((r) => r.url));
    const heroes = layout.cards.filter((c) => c.heroSrc && loaded.has(c.heroSrc));
    const buf = r1.buf;
    return {
      tool: 'audit-phone',
      url: origin,
      route: o.route,
      engine: o.webkit ? 'webkit' : 'chromium',
      device: { width: IPHONE.viewport.width, height: IPHONE.viewport.height, dpr: IPHONE.deviceScaleFactor },
      throttle: o.webkit ? null : THROTTLE,
      connection: r0.connection,
      timing: { fcp: r0.fcp, dcl: r0.dcl, load: r0.load, lcp: buf?.lcp?.start ?? null, settle: r0.now },
      lcp: buf?.lcp ?? null,
      longTasks:
        buf?.supported.longtask === true
          ? {
              load: tasks(buf.long, 0, r0.now),
              scroll: tasks(buf.long, scrollFrom, r1.now),
              list: buf.long.map((t) => ({ start: Math.round(t.start), dur: Math.round(t.dur) })),
            }
          : null,
      ends: r0.ends,
      cls:
        buf?.supported.cls === true
          ? {
              sum: shiftSum(buf.shifts, r0.now),
              shifts: buf.shifts.map((x) => ({
                ...x,
                start: Math.round(x.start),
                value: Math.round(1000 * x.value) / 1000,
              })),
            }
          : null,
      layout,
      afterScroll,
      jump,
      hlsLight: reqs.some((r) => r.type === 'script' && /hls/i.test(new URL(r.url).pathname)),
      openMeteo: { stubbed: buf?.om ?? 0, network: reqs.filter((r) => r.url.includes('api.open-meteo.com')).length },
      bytes: {
        aboveFold: sumBytes(aboveFold(reqs, foldImages(layout.media.images, layout.fold), origin), origin),
        load: sumBytes(loadReqs, origin),
        full: sumBytes(reqs, origin),
      },
      heroesOnLoad: {
        pick: heroes.filter((c) => c.pick).length,
        other: heroes.filter((c) => !c.pick).length,
        cards: layout.cards.length,
      },
      coverage: o.webkit ? null : await coverage(browser, target, origin),
      requests: reqs.map((r) => ({ ...r, url: r.url.length > 200 ? `${r.url.slice(0, 200)}…` : r.url })),
    };
  } finally {
    await browser.close();
  }
}
