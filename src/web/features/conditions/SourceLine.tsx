// Section sub-line of a conditions panel: the source name and the worst freshness badge among its rows.
import { FreshnessBadge } from '../../ui/FreshnessBadge.tsx';
import type { PanelFreshness } from './panel-meta.ts';

export function SourceLine({ source, fresh }: { source: string; fresh: PanelFreshness | null }) {
  return (
    <span class="cond-src">
      {source}
      {fresh ? <FreshnessBadge badge={fresh.badge} age={fresh.age} /> : null}
    </span>
  );
}
