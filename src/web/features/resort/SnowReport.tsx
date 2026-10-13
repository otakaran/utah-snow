// Resort page `snow` section (spec §8.7.3): every SnowNumbers field, the summit block (Deer Valley reports two areas),
// the pre-season notice, surface, report text and report time. Each number carries its caption right under it.
import { RESORTS } from '../../../../config/resorts.ts';
import { formatLocalDate } from '../../../shared/time.ts';
import type { ResortId, ResortSnapshot, SnowNumbers } from '../../../shared/types.ts';
import type { Units } from '../../../shared/units.ts';
import { clockRel } from '../../lib/format.ts';
import { Section } from '../../ui/Section.tsx';
import { Glyph } from '../../ui/StatusChip.tsx';
import { Amount, Tile } from './Amount.tsx';

interface Props {
  id: ResortId;
  r: ResortSnapshot | null;
  now: number;
  units: Units;
}

type SnowKey = 'overnightIn' | 'new12hIn' | 'new24hIn' | 'new48hIn' | 'new72hIn' | 'new7dIn';
type NumKey = SnowKey | 'stormTotalIn' | 'seasonTotalIn' | 'baseDepthIn';

const TILES: { key: NumKey; label: string }[] = [
  { key: 'overnightIn', label: 'Overnight' },
  { key: 'new12hIn', label: '12 h' },
  { key: 'new24hIn', label: '24 h' },
  { key: 'new48hIn', label: '48 h' },
  { key: 'new72hIn', label: '72 h' },
  { key: 'new7dIn', label: '7 days' },
  { key: 'stormTotalIn', label: 'Storm' },
  { key: 'seasonTotalIn', label: 'Season' },
  { key: 'baseDepthIn', label: 'Base depth' },
];

const AREA: Record<SnowNumbers['area'], string> = {
  primary: 'the resort report',
  base: 'the base area',
  mid: 'mid-mountain',
  summit: 'the summit',
};

function PreSeason({ id }: { id: ResortId }) {
  const open = RESORTS[id].projectedOpen;
  return (
    <p class="rs-notice" role="note">
      <b>Pre-season.</b> {RESORTS[id].name} projects opening{' '}
      {open ? formatLocalDate(open, 'long') : 'on a date still to be announced'}. Numbers stay empty or show last
      season's until the first report.
    </p>
  );
}

export function SnowReport({ id, r, now, units }: Props) {
  const s = r?.snow;
  const summit = s?.summit;
  const morning = s?.morningOvernightIn;
  const sub = s ? `report ${clockRel(s.reportAt, now)}` : 'no report yet';
  return (
    <Section testid="snow" title="Snow report" index="03" sub={sub}>
      {r?.season === 'preseason' ? <PreSeason id={id} /> : null}
      {s && !s.reportIsToday && s.reportAt && r?.season !== 'preseason' ? (
        <p class="rs-warn">
          <Glyph tone="warn" /> Not today's report: the numbers are from {clockRel(s.reportAt, now)}.
        </p>
      ) : null}
      <dl class="rs-tiles">
        {TILES.map((t) => (
          <Tile key={t.key} label={t.label} card>
            <Amount
              kind="snow"
              value={s?.[t.key]}
              units={units}
              class={t.key === 'overnightIn' || t.key === 'new24hIn' ? 'rs-snow' : undefined}
            />
          </Tile>
        ))}
      </dl>
      {summit ? (
        <div class="rs-card">
          <h3 class="rs-h3">Summit</h3>
          <dl class="rs-tiles">
            <Tile label="Overnight">
              <Amount kind="snow" value={summit.overnightIn} units={units} class="rs-snow" />
            </Tile>
            <Tile label="24 h">
              <Amount kind="snow" value={summit.new24hIn} units={units} class="rs-snow" />
            </Tile>
          </dl>
        </div>
      ) : null}
      <ul class="rs-list">
        {s ? <li>Headline numbers come from {AREA[s.area]}.</li> : null}
        {morning ? (
          <li>
            Morning overnight ({formatLocalDate(morning.date, 'md')}):{' '}
            <Amount kind="snow" value={morning.value} units={units} />
          </li>
        ) : null}
        {s?.surface ? (
          <li>
            Surface: <b>{s.surface}</b>
          </li>
        ) : null}
      </ul>
      {s?.text ? <blockquote class="rs-card">{s.text}</blockquote> : null}
    </Section>
  );
}
