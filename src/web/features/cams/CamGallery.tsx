// A grid of cam tiles (spec §8.7 `cams`, §8.2 road rows): a resort's cams in Appendix A order with the stake(s)
// first, or any given list (road cams). Hidden: UDOT cams on their offline placeholder, hiddenUntilFresh cams until
// fresh, seasonal slots with no stream, `detailOnly` cams outside the detail variant, and `alternate` road cams
// unless another cam of their corridor in the list is hidden. YouTube Rewind shows on the detail variant.
import { useEffect } from 'preact/hooks';
import { RESORT_CAMS } from '../../../../config/cams/index.ts';
import type { CamDef, ResortId } from '../../../shared/types.ts';
import { camStates, ensureCams } from '../../data/cams.ts';
import { CamTile } from './CamTile.tsx';
import { camHidden, type Variant } from './cam-view.ts';

interface Props {
  /** The cams to show, in order; or pass `resort` for that resort's full gallery. */
  cams?: readonly CamDef[];
  resort?: ResortId;
  variant?: Variant;
  /** The pick resort (★ on its cams). */
  pick?: ResortId | null;
  /** Rewind buttons on YouTube DVR streams; defaults to the detail variant. */
  rewind?: boolean;
}

/** A resort's cams in registry (Appendix A) order, stakes first. */
export function resortGallery(resort: ResortId): CamDef[] {
  const cams: readonly CamDef[] = RESORT_CAMS[resort];
  return [...cams].sort((a, b) => Number(b.isStake) - Number(a.isStake));
}

export function CamGallery({ cams, resort, variant = 'detail', pick = null, rewind }: Props) {
  useEffect(ensureCams, []);
  const states = camStates.value;
  const list = cams ?? (resort ? resortGallery(resort) : []);
  const hidden = new Set(list.filter((d) => camHidden(d, states.get(d.id))).map((d) => d.id));
  const shown = list.filter((d) => {
    if (hidden.has(d.id) || (d.detailOnly && variant !== 'detail')) return false;
    if (!d.alternate) return true;
    return list.some((o) => o !== d && !o.alternate && o.corridor === d.corridor && hidden.has(o.id));
  });
  if (shown.length === 0) return <p class="cam-none">No cams to show right now.</p>;
  return (
    <ul class={`cam-gallery cam-gallery-${variant}`} data-testid="cam-gallery">
      {shown.map((def) => (
        <li key={def.id}>
          <CamTile cam={def} variant={variant} pick={pick} rewind={rewind ?? variant === 'detail'} />
        </li>
      ))}
    </ul>
  );
}
