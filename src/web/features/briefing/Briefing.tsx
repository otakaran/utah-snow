// Morning briefing (spec §8.2). For now: the `header` section, then a plain system-status list.
// The pick, stakes, roads and the rest of the §8.2 order slot in below the header as they land.
import { ageMin, badge } from '../../../shared/freshness.ts';
import { CLIENT_BUILD, health, healthError, sources } from '../../data/health.ts';
import { serverNow, snapshot, snapshotError } from '../../data/snapshot.ts';
import { clock, clockRel, longDate, tripLine } from '../../lib/format.ts';
import { FreshnessBadge } from '../../ui/FreshnessBadge.tsx';
import './briefing.css';

function BriefingHeader({ now }: { now: number }) {
  return (
    <section data-testid="header" class="briefing-header" aria-labelledby="briefing-title">
      <h1 id="briefing-title">Morning briefing</h1>
      <p class="briefing-when">
        {longDate(now)} · {clock(now)} Denver
      </p>
      <p class="briefing-trip">{tripLine(now)}</p>
    </section>
  );
}

function StatusList({ now }: { now: number }) {
  const h = health.value;
  const hErr = healthError.value;
  const snap = snapshot.value;
  const sErr = snapshotError.value;
  const metas = sources.value;
  return (
    <section data-testid="status" class="briefing-status" aria-labelledby="status-title">
      <h2 id="status-title">System status</h2>
      <dl class="status-facts">
        <dt>Build</dt>
        <dd data-testid="status-build">
          web {CLIENT_BUILD} · api {h?.version ?? (hErr ? `unavailable (${hErr})` : 'loading…')}
        </dd>
        <dt>Last cron tick</dt>
        <dd data-testid="status-cron">{clockRel(h?.cron?.lastTickAt, now)}</dd>
        <dt>Snapshot generated</dt>
        <dd data-testid="status-snapshot">
          {snap ? clockRel(snap.generatedAt, now) : sErr ? `unavailable (${sErr})` : 'loading…'}
          {snap && sErr ? ` (refresh failed: ${sErr})` : ''}
        </dd>
      </dl>
      <h3>Sources</h3>
      {metas.length === 0 ? (
        <p class="status-empty">No sources reported yet.</p>
      ) : (
        <ul class="source-list">
          {metas.map((m) => (
            <li key={m.source} data-testid="source" class="source-row">
              <code class="source-id">{m.source}</code>
              <FreshnessBadge badge={badge(m, now)} age={ageMin(m, now)} />
              {m.error ? <span class="source-error">{m.error}</span> : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function Briefing() {
  const now = serverNow.value;
  return (
    <>
      <BriefingHeader now={now} />
      <StatusList now={now} />
    </>
  );
}
