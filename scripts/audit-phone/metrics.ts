/// <reference lib="dom" />
// In-page collectors of scripts/audit-phone.ts. Playwright serializes each exported function with toString() and
// runs it in the page, so every helper lives inside the function body and nothing from module scope is used.
// Positions are document offsets (rect.top + scrollY) in CSS px; `fold` is innerHeight at scrollY 0.

export interface Box {
  name: string;
  top: number;
  height: number;
  /** Elements inside: a rough share of the render work. */
  nodes: number;
}
export interface CardBox extends Box {
  pick: boolean;
  preseason: boolean;
  heroSrc: string;
  /** What a closed card would keep: the name + status row plus the card's padding and border. */
  collapsed: number;
}
export interface Hit {
  sel: string;
  n: number;
  w: number;
  h: number;
  inline: boolean;
  sample: string;
}
export interface ImgState {
  src: string;
  top: number;
  loading: string;
  loaded: boolean;
  card: string;
}
export interface MediaState {
  images: ImgState[];
  videos: { n: number; playing: number; withSrc: number };
  iframes: string[];
  tapToLoad: number;
}
export interface Layout {
  vw: number;
  fold: number;
  scrollHeight: number;
  chrome: Box[];
  sections: Box[];
  cards: CardBox[];
  taps: Hit[];
  smallText: Hit[];
  overflow: { doc: number; offenders: { sel: string; left: number; right: number }[] };
  scrollers: Scroller[];
  jumpbars: Scroller[];
  media: MediaState;
}
export interface Scroller {
  sel: string;
  scrollWidth: number;
  clientWidth: number;
}

export interface Opts {
  tap: number;
  minText: number;
  allow: string;
}

/** Layout, tap targets, small text, overflow and media at the current scroll position (call it at scrollY 0). */
export function collectLayout(o: Opts): Layout {
  const vw = innerWidth;
  const y0 = scrollY;
  const sel = (el: Element): string => {
    const tid = el.getAttribute('data-testid');
    const cls = typeof el.className === 'string' ? el.className.trim().split(/\s+/)[0] : '';
    const own = tid ? `[data-testid=${tid}]` : el.id ? `#${el.id}` : cls ? `.${cls}` : '';
    const ctx = el.parentElement?.closest('[data-testid]')?.getAttribute('data-testid');
    return `${ctx && ctx !== tid ? `${ctx} ` : ''}${el.tagName.toLowerCase()}${own}`;
  };
  const box = (name: string, el: Element): Box => {
    const r = el.getBoundingClientRect();
    return {
      name,
      top: Math.round(r.top + y0),
      height: Math.round(r.height),
      nodes: el.getElementsByTagName('*').length,
    };
  };
  const imgSrc = (img: HTMLImageElement | null): string => (img ? img.currentSrc || img.getAttribute('src') || '' : '');
  const visible = (el: Element): boolean =>
    el.getClientRects().length > 0 && (el.checkVisibility?.({ visibilityProperty: true }) ?? true);
  const text = (el: Element): string => (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40);
  const group = (hits: Map<string, Hit>, key: string, h: Omit<Hit, 'n'>) => {
    const g = hits.get(key);
    if (g) g.n++;
    else hits.set(key, { ...h, n: 1 });
  };

  const main = document.querySelector('main');
  const chrome = ['.app-header', '.app-nav', 'main', 'footer'].flatMap((q) => {
    const el = document.querySelector(q);
    return el ? [box(q.replace('.', ''), el)] : [];
  });
  const sections = main
    ? [...main.querySelectorAll('[data-testid]')]
        .filter((el) => !el.parentElement?.closest('main [data-testid]'))
        .map((el) => box(el.getAttribute('data-testid') ?? '?', el))
        .filter((b) => b.height > 0)
    : [];
  const edges = ['padding-top', 'padding-bottom', 'border-top-width', 'border-bottom-width'];
  const cards = [...document.querySelectorAll('[data-testid="resort-card"]')].map((el) => {
    const cs = getComputedStyle(el);
    const rim = edges.reduce((s, k) => s + (Number.parseFloat(cs.getPropertyValue(k)) || 0), 0);
    return {
      ...box(el.getAttribute('data-resort') ?? '?', el),
      pick: el.classList.contains('is-pick'),
      preseason: el.querySelector('.rc-pre') !== null,
      heroSrc: imgSrc(el.querySelector<HTMLImageElement>('.rc-hero img')),
      collapsed: Math.round((el.querySelector('.rc-top')?.getBoundingClientRect().height ?? 0) + rim),
    };
  });

  const taps = new Map<string, Hit>();
  const tapQ = 'a[href], button, input:not([type=hidden]), select, textarea, summary, [role=button], [tabindex="0"]';
  for (const el of document.querySelectorAll(tapQ)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= o.tap && r.height >= o.tap) continue;
    const w = Math.round(r.width);
    const h = Math.round(r.height);
    const inline = getComputedStyle(el).display === 'inline';
    group(taps, `${sel(el)} ${w}x${h}`, { sel: sel(el), w, h, inline, sample: text(el) });
  }

  const small = new Map<string, Hit>();
  const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode(); n; n = walk.nextNode()) {
    const el = n.parentElement;
    if (!el || !n.textContent?.trim() || el.closest('script, style, .sr-only') || !visible(el)) continue;
    const px = Number.parseFloat(getComputedStyle(el).fontSize);
    if (px >= o.minText) continue;
    group(small, `${sel(el)} ${px}`, { sel: sel(el), w: px, h: px, inline: true, sample: text(el) });
  }

  const offenders: Layout['overflow']['offenders'] = [];
  const scrollers: Layout['scrollers'] = [];
  for (const el of document.body.querySelectorAll('*')) {
    if (el.closest(o.allow) || !visible(el)) continue;
    const cs = getComputedStyle(el);
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) {
      scrollers.push({ sel: sel(el), scrollWidth: el.scrollWidth, clientWidth: el.clientWidth });
    }
    const r = el.getBoundingClientRect();
    if (r.right <= vw + 1 && r.left >= -1) continue;
    let clipped = false;
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      if (getComputedStyle(a).overflowX !== 'visible') clipped = true;
      if (offenders.some((x) => x.sel === sel(a))) clipped = true;
    }
    if (!clipped && cs.position !== 'fixed' && offenders.length < 15) {
      offenders.push({ sel: sel(el), left: Math.round(r.left), right: Math.round(r.right) });
    }
  }

  const images = [...document.images].map((img) => {
    const r = img.getBoundingClientRect();
    return {
      src: imgSrc(img),
      top: Math.round(r.top + y0),
      loading: img.getAttribute('loading') ?? '',
      loaded: img.complete && img.naturalWidth > 0,
      card: img.closest('[data-testid="resort-card"]')?.getAttribute('data-resort') ?? '',
    };
  });
  const vids = [...document.querySelectorAll('video')];
  const media: MediaState = {
    images,
    videos: {
      n: vids.length,
      playing: vids.filter((v) => !v.paused).length,
      withSrc: vids.filter((v) => v.currentSrc || v.srcObject).length,
    },
    iframes: [...document.querySelectorAll('iframe')].map((f) => f.src),
    tapToLoad: [...document.querySelectorAll('.cam-empty')].filter((e) => /tap/i.test(e.textContent ?? '')).length,
  };

  return {
    vw,
    fold: innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    chrome,
    sections,
    cards,
    taps: [...taps.values()],
    smallText: [...small.values()],
    overflow: { doc: document.documentElement.scrollWidth - vw, offenders },
    scrollers,
    jumpbars: [...document.querySelectorAll('.jumpbar')].filter(visible).map((b) => ({
      sel: sel(b),
      scrollWidth: b.scrollWidth,
      clientWidth: b.clientWidth,
    })),
    media,
  };
}
