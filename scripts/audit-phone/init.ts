/// <reference lib="dom" />
// In-page init script and reader of scripts/audit-phone.ts (serialized by Playwright, so self-contained). The init
// script runs before the app: it answers every api.open-meteo.com fetch with the canned body (the crew's shared
// Open-Meteo limit is never spent, and no request interception is needed, so throttling and byte counts stay
// untouched) and buffers longtask, LCP and layout-shift entries where the engine supports them (WebKit: LCP only).

export interface PageBuf {
  long: { start: number; dur: number }[];
  lcp: { start: number; size: number; url: string; el: string } | null;
  /** Every LCP candidate in order (the last one is `lcp`). */
  lcps: { start: number; size: number; el: string }[];
  /** `moves`: every source (at most 5 per entry) as 'element x,y wxh -> x,y wxh'. */
  shifts: { start: number; value: number; src: string; moves: string[] }[];
  om: number;
  supported: { longtask: boolean; lcp: boolean; cls: boolean };
}
export interface PageRead {
  buf: PageBuf | null;
  now: number;
  fcp: number | null;
  dcl: number | null;
  load: number | null;
  connection: { effectiveType: string | null; saveData: boolean | null };
  /** responseEnd (ms) of same-origin resources, to place the long tasks: script, css, /api/*. */
  ends: { path: string; end: number }[];
}

export function initAudit(body: string): void {
  const types = typeof PerformanceObserver === 'undefined' ? [] : (PerformanceObserver.supportedEntryTypes ?? []);
  const buf: PageBuf = {
    long: [],
    lcp: null,
    lcps: [],
    shifts: [],
    om: 0,
    supported: {
      longtask: types.includes('longtask'),
      lcp: types.includes('largest-contentful-paint'),
      cls: types.includes('layout-shift'),
    },
  };
  (window as Window & { __audit?: PageBuf }).__audit = buf;
  const orig = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith('https://api.open-meteo.com/')) return orig(input, init);
    buf.om++;
    return Promise.resolve(new Response(body, { status: 200, headers: { 'content-type': 'application/json' } }));
  };
  const describe = (el: Element | null): string => {
    if (!el) return '';
    const card = el.closest('[data-testid]')?.getAttribute('data-testid') ?? '';
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
    return `${card ? `${card} ` : ''}${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}`;
  };
  if (buf.supported.longtask) {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) buf.long.push({ start: e.startTime, dur: e.duration });
    }).observe({ type: 'longtask', buffered: true });
  }
  if (buf.supported.lcp) {
    new PerformanceObserver((list) => {
      for (const e of list.getEntries() as LargestContentfulPaint[]) {
        buf.lcp = { start: e.startTime, size: e.size, url: e.url, el: describe(e.element) };
        buf.lcps.push({ start: Math.round(e.startTime), size: e.size, el: buf.lcp.el });
      }
    }).observe({ type: 'largest-contentful-paint', buffered: true });
  }
  if (buf.supported.cls) {
    new PerformanceObserver((list) => {
      type Src = { node: Node | null; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly };
      type Shift = PerformanceEntry & { value: number; hadRecentInput: boolean; sources?: Src[] };
      const elOf = (node: Node | null) => (node instanceof Element ? node : (node?.parentElement ?? null));
      const rect = (r: DOMRectReadOnly) =>
        `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.width)}x${Math.round(r.height)}`;
      for (const e of list.getEntries() as Shift[]) {
        if (e.hadRecentInput) continue;
        const srcs = e.sources ?? [];
        const moves = srcs.map((s) => `${describe(elOf(s.node))} ${rect(s.previousRect)} -> ${rect(s.currentRect)}`);
        buf.shifts.push({ start: e.startTime, value: e.value, src: describe(elOf(srcs[0]?.node ?? null)), moves });
      }
    }).observe({ type: 'layout-shift', buffered: true });
  }
}

export function readAudit(): PageRead {
  const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
  const fcp = performance.getEntriesByName('first-contentful-paint')[0];
  const c = (navigator as Navigator & { connection?: { effectiveType?: string; saveData?: boolean } }).connection;
  return {
    buf: (window as Window & { __audit?: PageBuf }).__audit ?? null,
    now: performance.now(),
    fcp: fcp ? fcp.startTime : null,
    dcl: nav ? nav.domContentLoadedEventEnd : null,
    load: nav ? nav.loadEventEnd : null,
    connection: { effectiveType: c?.effectiveType ?? null, saveData: c?.saveData ?? null },
    ends: (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter((e) => e.name.startsWith(location.origin))
      .map((e) => ({ path: new URL(e.name).pathname, end: Math.round(e.responseEnd) })),
  };
}
