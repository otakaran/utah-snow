// Every source with its freshness badge and age (the header dot's popover, spec §8.1). Presentational only.
import type { Badge } from '../../shared/freshness.ts';
import { FreshnessBadge } from './FreshnessBadge.tsx';

export interface SourceRow {
  id: string;
  badge: Badge;
  age: number | null;
  error?: string | undefined;
  via?: string | undefined; // 'browser': the client fetched this row itself (data/mtnpowder.ts)
}

export function SourceList({ rows }: { rows: readonly SourceRow[] }) {
  if (rows.length === 0) return <p class="src-empty">No sources reported yet.</p>;
  return (
    <ul class="src-list">
      {rows.map((r) => (
        <li key={r.id} class="src-row">
          <code class="src-id">{r.id}</code>
          {r.via ? <span class="src-id">via {r.via}</span> : null}
          <FreshnessBadge badge={r.badge} age={r.age} />
          {r.error ? <span class="src-error">{r.error}</span> : null}
        </li>
      ))}
    </ul>
  );
}
