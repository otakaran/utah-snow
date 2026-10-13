// NWS text forecast for the resort's summit grid (spec §8.7.5). Fetched by the browser when the reader opens it.
import { useEffect, useState } from 'preact/hooks';
import { RESORTS } from '../../../../config/resorts.ts';
import { isoUtc } from '../../../shared/time.ts';
import type { ResortId } from '../../../shared/types.ts';
import { clockRel } from '../../lib/format.ts';
import { Glyph } from '../../ui/StatusChip.tsx';
import { loadNwsText, nwsText } from './nws-text.ts';

const MAX_PERIODS = 6;

export function NwsText({ id, now }: { id: ResortId; now: number }) {
  const def = RESORTS[id];
  const grid = def.nws.summit.grid;
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) void loadNwsText(grid, now);
  }, [open, grid, now]);
  const f = nwsText.value[grid];
  const page = `https://forecast.weather.gov/MapClick.php?lat=${def.summit.lat}&lon=${def.summit.lon}`;
  return (
    <details class="rs-details" onToggle={(e) => setOpen((e.currentTarget as HTMLDetailsElement).open)}>
      <summary class="rs-label">
        NWS text forecast · summit <span class="rs-dim">grid {grid}</span>
      </summary>
      {f?.loading && f.periods.length === 0 ? <p class="rs-dim">Loading…</p> : null}
      {f?.error ? (
        <p class="rs-warn">
          <Glyph tone="warn" /> NWS text forecast unavailable ({f.error})
          {f.periods.length > 0 ? `; showing the copy from ${clockRel(isoUtc(f.okAt), now)}` : ''}.
        </p>
      ) : null}
      {f && f.periods.length > 0 ? (
        <dl class="rs-periods">
          {f.periods.slice(0, MAX_PERIODS).map((p) => (
            <div key={p.name}>
              <dt class="rs-label">{p.name}</dt>
              <dd>{p.text}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      <p class="rs-small">
        <a class="rs-tap" href={page} target="_blank" rel="noreferrer">
          Full NWS point forecast ↗
        </a>
      </p>
    </details>
  );
}
