// Phone jump bar for the briefing: pinned to the top only once the pick card has scrolled up out of view (an
// IntersectionObserver on #pick), so the 6 am view above the pick stays chrome-free. Hidden from 900 px (CSS).
import { useEffect, useState } from 'preact/hooks';
import { JumpBar, type JumpItem } from '../../ui/JumpBar.tsx';

// Targets are the section ids (ui/Section uses the testid; PickCard sets id="pick").
const ITEMS: JumpItem[] = [
  { id: 'pick', label: 'Pick' },
  { id: 'stakes', label: 'Stakes' },
  { id: 'resorts', label: 'Resorts' },
  { id: 'roads', label: 'Roads' },
  { id: 'avalanche', label: 'Avy' },
  { id: 'forecast', label: 'Fcst' },
];

export function BriefJump() {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const pick = document.getElementById('pick');
    if (!pick || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => {
      if (e) setShown(!e.isIntersecting && e.boundingClientRect.bottom <= 0);
    });
    io.observe(pick);
    return () => io.disconnect();
  }, []);
  return (
    <div class="brief-jump" hidden={!shown}>
      <JumpBar items={ITEMS} sticky={false} />
    </div>
  );
}
