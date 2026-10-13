// The overnight-inches plate drawn over a stake still (the briefing's StakeRow, each #/cams lead tile): the resort
// report, else the pick's SNOTEL or forecast input, with OVERNIGHT (and that source) right under the number.
// Nothing when there is no number. Styles: cams/gallery.css `.cam-inches`.
import type { ResortId } from '../../../shared/types.ts';
import { fmt } from '../../../shared/units.ts';
import { units } from '../../data/settings.ts';
import { snapshot } from '../../data/snapshot.ts';
import { crewPick, overnightFor } from '../pick-card/index.ts';

export function InchPlate({ resort }: { resort: ResortId | null }) {
  const o = overnightFor(snapshot.value, crewPick.value, resort);
  const q = fmt('snow', o.inches, units.value);
  if (q.value === '—') return null;
  return (
    <span class="cam-inches">
      <span class="cam-inches-num num">
        {q.value}
        <small>{q.unit}</small>
      </span>
      <span class="cam-inches-cap">{o.note ? `Overnight · ${o.note}` : 'Overnight'}</span>
    </span>
  );
}
