// The weather page's sticky jump row (as resort/Resort.tsx ResortJump): the six resorts as #/weather?r= links, the
// shown one current and in accent, ★ on the crew pick; then buttons to the four sections (ids = Section testids).
import { RESORT_IDS, RESORTS } from '../../../../config/resorts.ts';
import type { ResortId } from '../../../shared/types.ts';
import { weatherHref } from '../../router.ts';
import { JumpBar, type JumpItem } from '../../ui/JumpBar.tsx';

const SECTIONS: JumpItem[] = [
  { id: 'week', label: 'Week' },
  { id: 'outlook', label: 'Outlook' },
  { id: 'hourly', label: 'Hourly' },
  { id: 'discussion', label: 'Discussion' },
];

export function WeatherJump({ id, pick }: { id: ResortId; pick: ResortId | null }) {
  const resorts = RESORT_IDS.map(
    (r, i): JumpItem => ({
      id: `wx-${r}`,
      label: RESORTS[r].name,
      href: weatherHref(r),
      current: r === id,
      accent: r === id,
      star: r === pick,
      rule: i === RESORT_IDS.length - 1,
    }),
  );
  return <JumpBar items={[...resorts, ...SECTIONS]} label="Resorts and sections" />;
}
