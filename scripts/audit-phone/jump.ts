/// <reference lib="dom" />
// In-page probe of the briefing's phone jump bar (features/briefing/BriefJump.tsx), run after #pick has scrolled
// away. The chips are `flex: 1 1 auto`, so the live bar always looks full; their natural widths come from a hidden
// clone inside .brief-jump (its scoped padding rules apply) laid out at max-content, with extra labels appended.
// Self-contained: Playwright serializes it with toString().

export interface JumpChip {
  label: string;
  w: number;
  h: number;
  natural: number;
}
export interface JumpVariant {
  name: string;
  natural: number;
  fits: boolean;
}
export interface JumpProbe {
  hidden: boolean;
  display: string;
  top: number;
  height: number;
  clientWidth: number;
  scrollWidth: number;
  gap: number;
  chips: JumpChip[];
  natural: number;
  ariaCurrent: number;
  variants: JumpVariant[];
}

/** `extra`: labels for a 7th chip; `drop`: a label to remove in a swap variant (e.g. Stakes for Weather). */
export function probeJump(arg: { extra: string[]; drop: string }): JumpProbe | null {
  const wrap = document.querySelector<HTMLElement>('.brief-jump');
  const bar = wrap?.querySelector<HTMLElement>('.jumpbar');
  if (!wrap || !bar) return null;
  const label = (el: Element) => (el.textContent ?? '').trim();
  const hidden = wrap.hidden;
  const r = wrap.getBoundingClientRect();
  const display = getComputedStyle(wrap).display;
  wrap.hidden = false; // a still-hidden bar has no layout to measure; restored below
  const probe = bar.cloneNode(true) as HTMLElement;
  probe.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;width:max-content;overflow:visible';
  wrap.append(probe);
  const width = () => Math.ceil(probe.getBoundingClientRect().width);
  const natural = width();
  const proto = probe.querySelector('.jump');
  const chipsNatural = [...probe.querySelectorAll('.jump')].map((c) => c.getBoundingClientRect().width);
  const variants: JumpVariant[] = [];
  const fits = (n: number) => n <= bar.clientWidth;
  for (const l of arg.extra) {
    if (!proto) break;
    const b = proto.cloneNode(true) as HTMLElement;
    b.textContent = l;
    probe.append(b);
    const n7 = width();
    variants.push({ name: `+${l}`, natural: n7, fits: fits(n7) });
    const gone = [...probe.querySelectorAll('.jump')].find((c) => label(c).toLowerCase() === arg.drop.toLowerCase());
    if (gone) {
      gone.remove();
      const swap = width();
      variants.push({ name: `+${l} -${arg.drop}`, natural: swap, fits: fits(swap) });
      probe.insertBefore(gone, probe.children[1] ?? null);
    }
    b.remove();
  }
  probe.remove();
  const live = {
    clientWidth: bar.clientWidth,
    scrollWidth: bar.scrollWidth,
    gap: Number.parseFloat(getComputedStyle(bar).columnGap) || 0,
    chips: [...bar.querySelectorAll('.jump')].map((c, i) => {
      const cr = c.getBoundingClientRect();
      return { label: label(c), w: Math.round(cr.width), h: Math.round(cr.height), natural: chipsNatural[i] ?? 0 };
    }),
  };
  wrap.hidden = hidden;
  return {
    hidden: hidden !== false,
    display,
    top: Math.round(r.top),
    height: Math.round(r.height),
    ...live,
    natural,
    ariaCurrent: bar.querySelectorAll('[aria-current]').length,
    variants,
  };
}
