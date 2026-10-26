// The NWS alerts strip under the weather page head (`weather-alerts`, only while an alert is active): per alert a
// StatusChip (shape + word + color by severity), the event, when it runs and the resorts its zones cover.
import { StatusChip } from '../../ui/StatusChip.tsx';
import type { AlertView } from './alerts-view.ts';

export function AlertsStrip({ alerts }: { alerts: readonly AlertView[] }) {
  if (alerts.length === 0) return null;
  return (
    <section class="wx-alerts" data-testid="weather-alerts" aria-label="NWS alerts">
      <ul class="wx-alert-list">
        {alerts.map((a) => (
          <li key={a.key} class={`wx-alert wx-t-${a.tone}`} data-testid="weather-alert">
            <StatusChip tone={a.tone} word={a.word} />
            <span class="wx-alert-ev">{a.event}</span>
            {a.when ? <span class="wx-dim">{a.when}</span> : null}
            <span class="wx-dim">{a.tags.join(' · ')}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
