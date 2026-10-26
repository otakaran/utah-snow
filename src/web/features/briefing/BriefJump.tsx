// Phone jump bar for the briefing: pinned to the top only once the pick card has scrolled up out of view (an
// IntersectionObserver on #pick), so the 6 am view above the pick stays chrome-free. Hidden from 900 px (CSS).
// The six section chips, then a Weather link to #/weather. One more observer marks the chip of the section at the
// top of the viewport (aria-current): the first section, in page order, still showing below the bar.
import { useEffect, useState } from 'preact/hooks';
import { weatherHref } from '../../router.ts';
import { JumpBar, type JumpItem } from '../../ui/JumpBar.tsx';

// Targets are the section ids (ui/Section uses the testid; PickCard sets id="pick").
const SECTIONS: JumpItem[] = [
  { id: 'pick', label: 'Pick' },
  { id: 'stakes', label: 'Stakes' },
  { id: 'resorts', label: 'Resorts' },
  { id: 'roads', label: 'Roads' },
  { id: 'avalanche', label: 'Avy' },
  { id: 'forecast', label: 'Fcst' },
];
const WEATHER: JumpItem = { id: 'weather', label: 'Weather', href: weatherHref() };

/** What the bar covers: --jump-h (48 px) plus a margin, so the section above a jumped-to one (scroll-margin-top
 * --jump-h) no longer counts, even edge to edge. */
const UNDER_BAR = '-56px 0px 0px 0px';

/** The id of the first section (page order) intersecting the viewport below the bar, or null. */
function useCurrentSection(): string | null {
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const showing = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) showing.add(e.target.id);
          else showing.delete(e.target.id);
        }
        setCurrent(SECTIONS.find((s) => showing.has(s.id))?.id ?? null);
      },
      { rootMargin: UNDER_BAR },
    );
    for (const s of SECTIONS) {
      const el = document.getElementById(s.id);
      if (el) io.observe(el);
    }
    return () => io.disconnect();
  }, []);
  return current;
}

export function BriefJump() {
  const [shown, setShown] = useState(false);
  const current = useCurrentSection();
  useEffect(() => {
    const pick = document.getElementById('pick');
    if (!pick || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => {
      if (e) setShown(!e.isIntersecting && e.boundingClientRect.bottom <= 0);
    });
    io.observe(pick);
    return () => io.disconnect();
  }, []);
  const items = [...SECTIONS.map((s) => (s.id === current ? { ...s, current: true } : s)), WEATHER];
  return (
    <div class="brief-jump" hidden={!shown}>
      <JumpBar items={items} sticky={false} />
    </div>
  );
}
