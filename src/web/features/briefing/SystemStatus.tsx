// The briefing's last block, right above the app footer (spec §8.2 `footer`, §8.6): one compact system-status line
// of label/value pairs (data badge, builds, last cron tick, snapshot time; a 2-column grid on phones) and every
// source behind a disclosure. The `footer` testid,
// credits, build id, repo link and "Not affiliated" line live on app.tsx's <footer> (ui/Attribution), every route.
import { ageMin, badge } from '../../../shared/freshness.ts';
import { CLIENT_BUILD, globalBadge, health, healthError, sources } from '../../data/health.ts';
import { serverNow, snapshot, snapshotError } from '../../data/snapshot.ts';
import { clockRel } from '../../lib/format.ts';
import { FreshnessBadge } from '../../ui/FreshnessBadge.tsx';
import { SourceList, type SourceRow } from '../../ui/SourceList.tsx';

const GLOBAL_LABEL = { green: 'Data OK', amber: 'Data stale', red: 'Data down', grey: 'Off-season' } as const;

function snapshotText(now: number): string {
  const snap = snapshot.value;
  const err = snapshotError.value;
  if (!snap) return err ? `unavailable (${err})` : 'loading…';
  return `${clockRel(snap.generatedAt, now)}${err ? ` (refresh failed: ${err})` : ''}`;
}

export function SystemStatus() {
  const now = serverNow.value;
  const h = health.value;
  const g = globalBadge.value;
  const rows: SourceRow[] = sources.value.map((m) => ({
    id: m.source,
    badge: badge(m, now),
    age: ageMin(m, now),
    error: m.error,
    via: m.via,
  }));
  const bad = rows.filter((r) => r.badge === 'amber' || r.badge === 'red').length;
  return (
    <section data-testid="status" class="brief-foot" aria-label="System status">
      <dl class="brief-status">
        {g ? (
          <div>
            <dt>Data</dt>
            <dd>
              <FreshnessBadge badge={g} label={GLOBAL_LABEL[g]} />
            </dd>
          </div>
        ) : null}
        <div data-testid="status-build">
          <dt>Build</dt>
          <dd>
            web {CLIENT_BUILD} · api{' '}
            {h?.version ?? (healthError.value ? `unavailable (${healthError.value})` : 'loading…')}
          </dd>
        </div>
        <div data-testid="status-cron">
          <dt>Cron</dt>
          <dd>{clockRel(h?.cron?.lastTickAt, now)}</dd>
        </div>
        <div data-testid="status-snapshot">
          <dt>Snapshot</dt>
          <dd>{snapshotText(now)}</dd>
        </div>
      </dl>
      <details class="brief-sources">
        <summary class="disclosure">
          Sources ({rows.length}){bad > 0 ? ` · ${bad} stale or down` : ''}
        </summary>
        <SourceList rows={rows} />
      </details>
    </section>
  );
}
