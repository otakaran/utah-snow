// "Tomorrow outlook (forecast-based)" mini-pick (spec §8.2, §10.3): from 15:00 local on the eve of a trip day.
// Forecast only: no live roads, holds or avalanche danger.
import { RESORTS } from '../../../../config/resorts.ts';
import { formatLocalDate } from '../../../shared/time.ts';
import { TIER_LABEL } from './labels.ts';
import { tomorrowPick } from './use-pick.ts';

export function TomorrowOutlook() {
  const t = tomorrowPick.value;
  if (!t?.pick) return null;
  const top = t.ranked.find((x) => x.resort === t.pick);
  return (
    <aside class="pick-tomorrow" aria-labelledby="pick-tomorrow-h" data-testid="pick-tomorrow">
      <h3 id="pick-tomorrow-h" class="pick-more-h">
        Tomorrow outlook (forecast-based) · {formatLocalDate(t.date, 'short')}
      </h3>
      <p class="pick-tomorrow-line">
        <b>{RESORTS[t.pick].name}</b>
        {t.tier ? <span class="pick-tier pick-tier--sm">{TIER_LABEL[t.tier]}</span> : null}
        {top ? <span class="num">{top.net.toFixed(1)}</span> : null}
      </p>
      {top?.reasons[0] ? <p class="pick-tomorrow-why">{top.reasons[0]}</p> : null}
    </aside>
  );
}
