// AvalanchePanel (spec §8.2 `avalanche`, C.4): Salt Lake (1738) and Ogden (1737) with the NAC level in a diamond,
// the level word, the labelled 5-segment scale, travel advice and the UAC link. Off-season: a grey
// "No rating (off-season)". Shared by the briefing, a resort page (its zone) and the wall (variant 'wall').
import type { AvalancheZone } from '../../../shared/types.ts';
import { serverNow, snapshot } from '../../data/snapshot.ts';
import { clockRel } from '../../lib/format.ts';
import { Section } from '../../ui/Section.tsx';
import { orderZones, zoneResorts, zoneView } from './avy-view.ts';
import { DangerScale } from './DangerScale.tsx';
import { worstMeta } from './panel-meta.ts';
import { SourceLine } from './SourceLine.tsx';

export interface AvalanchePanelProps {
  /** UAC zone ids to show (1738 Salt Lake, 1737 Ogden). Default: both. */
  zones?: readonly number[];
  variant?: 'full' | 'wall';
  /** Channel number in the heading ('05' on the briefing). */
  no?: string;
  /** Section data-testid (also its heading id). Default 'avalanche'. */
  testId?: string;
}

const external = { target: '_blank', rel: 'noreferrer' } as const;

function Diamond({ level, k }: { level: number | null; k: string }) {
  return (
    <span class={`cond-dia cond-nac-${k}`} aria-hidden="true">
      <span>{level ?? '–'}</span>
    </span>
  );
}

function Zone({ z, now, wall }: { z: AvalancheZone; now: number; wall: boolean }) {
  const v = zoneView(z);
  const attrs = { 'data-testid': 'avy-zone', 'data-zone': String(z.zoneId), 'data-level': String(v.level ?? -1) };
  if (wall) {
    return (
      <li class="cond-wall-row cond-wall-zone" {...attrs}>
        <Diamond level={v.level} k={v.key} />
        <b>{v.title}</b>
        <span class="cond-dim">{z.name}</span>
        <DangerScale level={v.level} />
      </li>
    );
  }
  return (
    <li class="cond-card cond-zone" {...attrs}>
      <Diamond level={v.level} k={v.key} />
      <div class="cond-zone-t">
        <h3 class={`cond-zone-title${v.level === null ? ' is-none' : ''}`}>{v.title}</h3>
        <p class="cond-dim">
          {z.name} · {zoneResorts(z.zoneId)}
        </p>
      </div>
      <DangerScale level={v.level} />
      {z.travelAdvice ? <p class="cond-zone-advice">{z.travelAdvice}</p> : null}
      <p class="cond-zone-foot">
        {z.validFrom ? <span class="cond-dim">Issued {clockRel(z.validFrom, now)}</span> : null}
        <a class="cond-link" href={z.link} {...external}>
          UAC {z.name} forecast ↗
        </a>
      </p>
    </li>
  );
}

export function AvalanchePanel({ zones, variant = 'full', no, testId = 'avalanche' }: AvalanchePanelProps) {
  const snap = snapshot.value;
  const now = serverNow.value;
  const block = snap?.avalanche;
  const list = orderZones(Array.isArray(block?.data) ? block.data : [], zones);
  const wall = variant === 'wall';
  const fresh = worstMeta([block?.meta], now);
  return (
    <Section
      testid={testId}
      title="Avalanche"
      index={no}
      class={wall ? 'cond-wall' : 'cond-avy'}
      sub={<SourceLine source="UAC" fresh={fresh} />}
    >
      {list.length > 0 ? (
        <ul class={wall ? 'cond-wall-list' : 'cond-list'}>
          {list.map((z) => (
            <Zone key={z.zoneId} z={z} now={now} wall={wall} />
          ))}
        </ul>
      ) : (
        <p class="cond-empty">{snap ? 'No avalanche rating available.' : 'Loading avalanche danger…'}</p>
      )}
    </Section>
  );
}
