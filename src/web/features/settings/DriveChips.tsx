// Free-flow drive minutes from one base to each resort as wrapping chips; the fastest resort's chip says "closest".
// Spans, not a list: it sits inside a preset's <label>. `approx` resorts (a custom base without an /api/drive answer)
// show "≈", the nearest preset's minutes.
import { RESORTS } from '../../../../config/resorts.ts';
import type { ResortId } from '../../../shared/types.ts';

const RESORT_IDS = Object.keys(RESORTS) as ResortId[];

interface Props {
  min: Record<ResortId, number>;
  approx?: (r: ResortId) => boolean;
}

export function DriveChips({ min, approx }: Props) {
  const best = Math.min(...RESORT_IDS.map((r) => min[r]));
  return (
    <span class="drive-chips">
      <span class="drive-label">Drive min</span>
      {RESORT_IDS.map((r) => (
        <span key={r} class={min[r] === best ? 'drive-chip is-closest' : 'drive-chip'}>
          {RESORTS[r].name}{' '}
          <span class="num">
            {approx?.(r) ? '≈ ' : ''}
            {min[r]}
          </span>
          {min[r] === best ? <span class="drive-closest"> closest</span> : null}
        </span>
      ))}
    </span>
  );
}
