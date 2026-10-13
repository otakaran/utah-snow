// A grid of cam tiles (spec §8.7 `cams`, §8.2 road rows): a resort's cams in Appendix A order with the stake(s)
// first, or any given list (road cams). Which cams show is cam-view.ts `visibleCams`. YouTube Rewind shows on the
// detail variant. The lead tile is the first stake; `hero` makes it a 2x2 tile (else that hero cam) carrying
// `heroOverlay`. Tiles on their Offline plate sort last; below 600 px detail galleries are two columns with the lead
// tile across both (cams/gallery.css).
import type { ComponentChildren } from 'preact';
import { useEffect } from 'preact/hooks';
import { RESORT_CAMS } from '../../../../config/cams/index.ts';
import type { CamDef, ResortId } from '../../../shared/types.ts';
import { camStates, ensureCams } from '../../data/cams.ts';
import { serverNow } from '../../data/snapshot.ts';
import { CamTile } from './CamTile.tsx';
import { leadCam, type Variant, visibleCams } from './cam-view.ts';

interface Props {
  /** The cams to show, in order; or pass `resort` for that resort's full gallery. */
  cams?: readonly CamDef[];
  resort?: ResortId;
  variant?: Variant;
  /** The pick resort (★ on its cams). */
  pick?: ResortId | null;
  /** Rewind buttons on YouTube DVR streams; defaults to the detail variant. */
  rewind?: boolean;
  /** Resort name in captions; off by default for a `resort` gallery, whose heading already names it. */
  showResort?: boolean;
  /** Fallback cam id of the 2x2 lead tile when no stake shows (HEROES[resort]); no lead tile without it. */
  hero?: string;
  /** Drawn over the lead tile's still, e.g. the overnight-inches plate. */
  heroOverlay?: ComponentChildren;
}

/** A resort's cams in registry (Appendix A) order, stakes first. */
export function resortGallery(resort: ResortId): CamDef[] {
  const cams: readonly CamDef[] = RESORT_CAMS[resort];
  return [...cams].sort((a, b) => Number(b.isStake) - Number(a.isStake));
}

export function CamGallery(p: Props) {
  useEffect(ensureCams, []);
  const variant = p.variant ?? 'detail';
  const list = p.cams ?? (p.resort ? resortGallery(p.resort) : []);
  const shown = visibleCams(list, camStates.value, variant, serverNow.value);
  if (shown.length === 0) return <p class="cam-none">No cams to show right now.</p>;
  const lead = p.hero ? leadCam(shown, p.hero) : (shown.find((d) => d.isStake) ?? null);
  const ordered = lead ? [lead, ...shown.filter((d) => d !== lead)] : shown;
  const leadCls = p.hero ? 'cam-lead cam-hero' : 'cam-lead';
  return (
    <ul class={`cam-gallery cam-gallery-${variant}`} data-testid="cam-gallery">
      {ordered.map((def) => (
        <li key={def.id} class={def === lead ? leadCls : undefined}>
          <CamTile
            cam={def}
            variant={variant}
            pick={p.pick ?? null}
            rewind={p.rewind ?? variant === 'detail'}
            showResort={p.showResort ?? !p.resort}
            overlay={def === lead ? p.heroOverlay : undefined}
          />
        </li>
      ))}
    </ul>
  );
}
