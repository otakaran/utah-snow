// The NWS Area Forecast Discussion's KEY MESSAGES as a collapsible block (spec §8.2 forecast notes): bullets, the
// issue time and the link to the full discussion. Renders nothing until the AFD row has key messages.
import { snapshot } from '../../data/snapshot.ts';
import { clockRel } from '../../lib/format.ts';
import { afdBullets } from './forecast-rows.ts';

const external = { target: '_blank', rel: 'noreferrer' } as const;

export function AfdNotes({ now }: { now: number }) {
  const afd = snapshot.value?.afd?.data;
  const bullets = afdBullets(afd?.keyMessages);
  if (!afd || bullets.length === 0) return null;
  return (
    <details class="cond-more">
      <summary class="disclosure">NWS key messages · {clockRel(afd.issuedAt, now)}</summary>
      <ul class="cond-afd">
        {bullets.map((b) => (
          <li key={b}>{b}</li>
        ))}
      </ul>
      <a class="cond-link" href={afd.url} {...external}>
        Full NWS discussion ↗
      </a>
    </details>
  );
}
