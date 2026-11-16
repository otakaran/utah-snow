// Section sub-line of a conditions panel: the source name and the worst freshness badge among its rows
// ('1 of 6 down' when only some rows carry it).
import { FreshnessBadge } from '../../ui/FreshnessBadge.tsx';
import { type PanelFreshness, partialWord } from './panel-meta.ts';

export function SourceLine({ source, fresh }: { source: string; fresh: PanelFreshness | null }) {
  const partial = fresh ? partialWord(fresh) : null; // no age then: it belongs to one row, not to the panel
  return (
    <span class="cond-src">
      {source}
      {!fresh ? null : partial ? (
        <FreshnessBadge badge={fresh.badge} label={partial} />
      ) : (
        <FreshnessBadge badge={fresh.badge} age={fresh.age} />
      )}
    </span>
  );
}
