// Six-peak overnight ridge chart (tokens.css UI rule): every resort's overnight inches as a mountain, full resort
// names, the pick's peak lit in --accent. `baseline` puts every number on one shared line (the wall's strip).
// Fresh snow makes a peak taller and whiter: its height and its snow line both follow the night's inches against
// the deepest of the six. A 0″ or unknown night (`is-dry`) is a bare hill of DRY height with a quiet number, so a
// dry morning still reads as a ridge and not as six slivers (2026-11-22). Shapes: ridge-shape.ts.
import { RESORTS } from '../../../../config/resorts.ts';
import type { ResortId } from '../../../shared/types.ts';
import type { Units } from '../../../shared/units.ts';
import { peakShares, snowQty } from './labels.ts';
import { capPolygons, outlineOf, points, shadePolygon, snowLine } from './ridge-shape.ts';

/** A bare hill's height against the deepest night's peak. */
const DRY = 0.36;

export interface RidgeProps {
  values: readonly { id: ResortId; inches: number | null }[];
  pick: ResortId | null;
  units: Units;
  baseline?: boolean;
}

function Mountain({ index, share }: { index: number; share: number }) {
  const outline = outlineOf(index);
  const caps = share > 0 ? capPolygons(outline, snowLine(share)) : [];
  return (
    <svg class="ridge-mtn" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <polygon class="ridge-rock" points={points(outline)} />
      {caps.map((cap) => (
        <polygon key={cap[0]?.[0]} class="ridge-cap" points={points(cap)} />
      ))}
      <polygon class="ridge-shade" points={points(shadePolygon(outline))} />
    </svg>
  );
}

export function Ridge({ values, pick, units, baseline = false }: RidgeProps) {
  const shares = peakShares(values.map((v) => v.inches));
  const label = values.map((v) => `${RESORTS[v.id].name} ${snowQty(v.inches, units).text}`).join(', ');
  const pickName = pick ? `; pick ${RESORTS[pick].name}` : '';
  return (
    <div
      class={`ridge${baseline ? ' ridge--baseline' : ''}`}
      role="img"
      aria-label={`Overnight snow: ${label}${pickName}`}
      data-testid="pick-ridge"
    >
      {values.map((v, i) => {
        const q = snowQty(v.inches, units);
        const share = shares[i] ?? 0;
        return (
          <div
            key={v.id}
            class={`ridge-pk${v.id === pick ? ' is-pick' : ''}${share > 0 ? '' : ' is-dry'}`}
            style={{ '--h': DRY + (1 - DRY) * share }}
          >
            <b class={`ridge-num num${v.inches === null ? ' is-empty' : ''}`}>
              {q.value}
              {v.inches === null ? null : <span class="ridge-unit">{q.unit}</span>}
            </b>
            <Mountain index={i} share={share} />
            <span class="ridge-name">{RESORTS[v.id].name}</span>
          </div>
        );
      })}
    </div>
  );
}
