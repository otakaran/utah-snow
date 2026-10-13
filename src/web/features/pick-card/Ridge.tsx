// Six-peak overnight ridge chart (tokens.css UI rule): every resort's overnight inches as a mountain, full resort
// names, the pick's peak lit in --accent. `baseline` puts every number on one shared line (the wall's strip).
import { RESORTS } from '../../../../config/resorts.ts';
import type { ResortId } from '../../../shared/types.ts';
import type { Units } from '../../../shared/units.ts';
import { peakFractions, snowQty } from './labels.ts';

export interface RidgeProps {
  values: readonly { id: ResortId; inches: number | null }[];
  pick: ResortId | null;
  units: Units;
  baseline?: boolean;
}

export function Ridge({ values, pick, units, baseline = false }: RidgeProps) {
  const fr = peakFractions(values.map((v) => v.inches));
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
        return (
          <div key={v.id} class={`ridge-pk${v.id === pick ? ' is-pick' : ''}`} style={{ '--h': fr[i] ?? 0 }}>
            <b class={`ridge-num num${v.inches === null ? ' is-empty' : ''}`}>
              {q.value}
              {v.inches === null ? null : <span class="ridge-unit">{q.unit}</span>}
            </b>
            <i class="ridge-mtn" />
            <span class="ridge-name">{RESORTS[v.id].name}</span>
          </div>
        );
      })}
    </div>
  );
}
