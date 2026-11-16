// Section sub-line of a conditions panel: the source name and the worst freshness badge among its rows
// ('1 of 6 down' when only some rows carry it). `greyWord` replaces the badge's 'Off-season' for a panel whose grey
// rows mean something else (resort reports before opening day: 'Pre-season', as their chips say).
import { FreshnessBadge } from '../../ui/FreshnessBadge.tsx';
import { type PanelFreshness, partialWord } from './panel-meta.ts';

interface Props {
  source: string;
  fresh: PanelFreshness | null;
  greyWord?: string;
}

export function SourceLine({ source, fresh, greyWord }: Props) {
  const partial = fresh ? partialWord(fresh) : null; // no age then: it belongs to one row, not to the panel
  return (
    <span class="cond-src">
      {source}
      {!fresh ? null : partial ? (
        <FreshnessBadge badge={fresh.badge} label={partial} />
      ) : (
        <FreshnessBadge badge={fresh.badge} age={fresh.age} label={fresh.badge === 'grey' ? greyWord : undefined} />
      )}
    </span>
  );
}
