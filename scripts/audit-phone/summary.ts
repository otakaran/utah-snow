// The ~20-line console summary of one audit-phone run (scripts/audit-phone.ts); the JSON holds the detail.
import type { Hit, Layout } from './metrics.ts';
import { type Audit, type Bytes, collapseSaving, foldImages, kind } from './report.ts';

const kb = (n: number) => `${Math.round(n / 1024)} KB`;
const ms = (n: number | null) => (n === null ? 'n/a' : `${Math.round(n)} ms`);
const count = (hits: readonly Hit[]) => hits.reduce((s, h) => s + h.n, 0);
const kinds = (b: Bytes) =>
  Object.entries(b.byKind)
    .sort((x, y) => y[1] - x[1])
    .map(([k, v]) => `${k} ${kb(v)}`)
    .join(', ');
const file = (url: string) => new URL(url).pathname.split('/').filter(Boolean).pop() ?? url;

function head(a: Audit): string[] {
  const L = a.layout;
  const t = a.throttle;
  const net = t ? `${t.rttMs} ms RTT, ${t.downKbps} kbps, ${t.cpu}x CPU` : 'no throttle';
  return [
    `audit-phone ${a.engine} ${a.url}/${a.route} · ${a.device.width}x${a.device.height} @${a.device.dpr}x · ${net} · ect ${a.connection.effectiveType ?? 'n/a'}`,
    ...(a.snapshot
      ? [
          `snapshot replayed from ${a.snapshot.file}: ${kb(a.snapshot.raw)} raw, ${kb(a.snapshot.wire)} gzip, +${a.snapshot.delayMs} ms, served ${a.snapshot.served}x`,
        ]
      : []),
    `page ${L.scrollHeight} px = ${(L.scrollHeight / L.fold).toFixed(1)} viewports of ${L.fold} px (after scroll ${a.afterScroll.scrollHeight})`,
    `chrome: ${L.chrome.map((b) => `${b.name} ${b.height}`).join(' · ')}`,
    `sections (height@top): ${L.sections.map((b) => `${b.name} ${b.height}@${b.top}`).join(' · ')}`,
  ];
}

function cards(a: Audit): string[] {
  const c = a.layout.cards;
  if (c.length === 0) return [];
  const pre = c.filter((x) => x.preseason).length;
  const save = collapseSaving(c, a.layout.scrollHeight);
  const h = a.heroesOnLoad;
  return [
    `resort cards (${pre}/${c.length} pre-season, * = pick): ${c.map((x) => `${x.name}${x.pick ? '*' : ''} ${x.height}`).join(' · ')}`,
    `closing non-pick cards to ~${c[0]?.collapsed ?? 0} px saves ${save.px} px (${save.pct} % of page); hero stills fetched on load: pick ${h.pick}, other ${h.other} of ${h.cards - 1}`,
  ];
}

function checks(L: Layout): string[] {
  const worst = [...L.taps].filter((h) => !h.inline).slice(0, 4);
  const inline = count(L.taps.filter((h) => h.inline));
  const small = L.smallText.slice(0, 3).map((h) => `${h.sel} ${h.w}px`);
  return [
    `tap < 44 px: ${count(L.taps)} (${inline} inline text links)${worst.length ? `; ${worst.map((h) => `${h.sel} ${h.w}x${h.h}`).join(', ')}` : ''}`,
    `text < 12 px: ${count(L.smallText)} nodes${small.length ? ` (${small.join(', ')})` : ''} · overflow: doc +${L.overflow.doc} px, ${L.overflow.offenders.length} offenders, ${L.scrollers.length} stray scrollers`,
  ];
}

function media(a: Audit): string[] {
  const L = a.layout;
  const imgs = a.requests.filter((r) => r.phase === 'load' && kind(r, a.url) === 'image');
  const big = [...imgs].sort((x, y) => y.bytes - x.bytes)[0];
  const loaded = (s: Layout) => `${s.media.images.filter((i) => i.loaded).length}/${s.media.images.length}`;
  const v = L.media.videos;
  return [
    `images fetched on load: ${imgs.length} (${kb(imgs.reduce((s, r) => s + r.bytes, 0))}${big ? `, largest ${file(big.url)} ${kb(big.bytes)}` : ''}); ${foldImages(L.media.images, L.fold).size} in the fold; DOM loaded ${loaded(L)}, after scroll ${loaded(a.afterScroll)}`,
    `video ${v.n} (${v.playing} playing) · iframes ${L.media.iframes.length} · hls.light ${a.hlsLight ? 'loaded' : 'not loaded'} · tap-to-load plates ${L.media.tapToLoad}`,
  ];
}

function perf(a: Audit): string[] {
  const lt = a.longTasks;
  const cov = a.coverage?.reduce((s, r) => ({ chars: s.chars + r.chars, used: s.used + r.used }), {
    chars: 0,
    used: 0,
  });
  const unused = cov ? Math.round((100 * (cov.chars - cov.used)) / Math.max(1, cov.chars)) : 0;
  const shift = [...(a.cls?.shifts ?? [])].sort((x, y) => y.value - x.value)[0];
  const cls = a.cls
    ? `${a.cls.sum}${shift ? ` (largest ${shift.value} at ${shift.start} ms, ${shift.src})` : ''}`
    : 'n/a';
  return [
    lt
      ? `long tasks on load: ${lt.load.count}, ${lt.load.totalMs} ms (max ${lt.load.maxMs}); while scrolling: ${lt.scroll.count}, ${lt.scroll.totalMs} ms`
      : 'long tasks: not supported by this engine',
    `FCP ${ms(a.timing.fcp)} · LCP ${ms(a.timing.lcp)}${a.lcp ? ` (${a.lcp.el})` : ''} · CLS ${cls} · load ${ms(a.timing.load)} · settled ${ms(a.timing.settle)}`,
    ...(cov
      ? [`JS run on load: ${kb(cov.used)} of ${kb(cov.chars)} raw (${unused} % unused, ${a.coverage?.length} scripts)`]
      : []),
    `bytes above fold ${kb(a.bytes.aboveFold.total)} (${kinds(a.bytes.aboveFold)})`,
    `bytes on load ${kb(a.bytes.load.total)} in ${a.bytes.load.n} req (${kinds(a.bytes.load)})`,
    `bytes full page ${kb(a.bytes.full.total)} in ${a.bytes.full.n} req (${kinds(a.bytes.full)})`,
  ];
}

function jump(a: Audit): string[] {
  const j = a.jump;
  const bars = a.layout.jumpbars.map((b) => `jumpbar ${b.sel}: scrollWidth ${b.scrollWidth} / ${b.clientWidth} px`);
  if (!j) return bars;
  const vs = j.variants.map((v) => `${v.name} ${v.natural}${v.fits ? ' fits' : ' SCROLLS'}`).join(', ');
  return [
    `jump bar after #pick: ${j.hidden ? 'HIDDEN' : 'shown'}, ${j.chips.length} chips natural ${j.natural}/${j.clientWidth} px; ${vs}; aria-current ${j.ariaCurrent}`,
    ...bars,
  ];
}

export function summary(a: Audit, out: string): string[] {
  return [
    ...head(a),
    ...cards(a),
    ...checks(a.layout),
    ...media(a),
    ...perf(a),
    ...jump(a),
    `open-meteo: ${a.openMeteo.stubbed} stubbed, ${a.openMeteo.network} on the network · ${out}`,
  ];
}
