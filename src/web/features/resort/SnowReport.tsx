// Resort page `snow` section (spec §8.7.3): every SnowNumbers field the resort reports, the summit block (Deer Valley
// reports two areas), surface, the resort's own report text (labelled) and the report time. Pre-season shows one
// compact panel with the projected opening and a countdown instead of empty tiles. Captions sit under the numbers.
import { RESORTS } from '../../../../config/resorts.ts';
import { formatLocalDate } from '../../../shared/time.ts';
import type { ResortId, ResortSnapshot, SnowNumbers } from '../../../shared/types.ts';
import type { Units } from '../../../shared/units.ts';
import { clockRel } from '../../lib/format.ts';
import { Countdown } from '../../ui/Countdown.tsx';
import { Section } from '../../ui/Section.tsx';
import { Glyph } from '../../ui/StatusChip.tsx';
import { Amount, Tile } from './Amount.tsx';

interface Props {
  id: ResortId;
  r: ResortSnapshot | null;
  today: string; // Denver date
  now: number;
  units: Units;
}

type NumKey = 'overnightIn' | 'new12hIn' | 'new24hIn' | 'new48hIn' | 'new72hIn' | 'new7dIn' | NumTotal;
type NumTotal = 'stormTotalIn' | 'seasonTotalIn' | 'baseDepthIn';

// Overnight and 24 h always show (a dash is news); the rest only when the resort reports them.
const TILES: { key: NumKey; label: string; always?: true }[] = [
  { key: 'overnightIn', label: 'Overnight', always: true },
  { key: 'new12hIn', label: '12 h' },
  { key: 'new24hIn', label: '24 h', always: true },
  { key: 'new48hIn', label: '48 h' },
  { key: 'new72hIn', label: '72 h' },
  { key: 'new7dIn', label: '7 days' },
  { key: 'stormTotalIn', label: 'Storm total' },
  { key: 'seasonTotalIn', label: 'Season total' },
  { key: 'baseDepthIn', label: 'Base depth' },
];

const AREA: Record<SnowNumbers['area'], string> = {
  primary: '',
  base: 'Measured at the base area.',
  mid: 'Measured at mid-mountain.',
  summit: 'Measured at the summit.',
};

/** 'Pre-season · projected open Fri, Nov 20' under the 'N days to opening' countdown. */
function PreSeason({ id, today }: { id: ResortId; today: string }) {
  const open = RESORTS[id].projectedOpen;
  return (
    <div class="rs-card rs-pre" role="note">
      {open ? <Countdown today={today} to={open} word="to opening" /> : null}
      <div>
        <p class="rs-strong">
          <Glyph tone="off" /> Pre-season · projected open {open ? formatLocalDate(open, 'short') : 'TBA'}
        </p>
        <p class="rs-dim rs-small">Snow numbers start with the first report of the season.</p>
      </div>
    </div>
  );
}

export function SnowReport({ id, r, today, now, units }: Props) {
  const s = r?.snow;
  const pre = r?.season === 'preseason';
  const summit = s?.summit;
  const morning = s?.morningOvernightIn;
  const sub = s?.reportAt ? `report ${clockRel(s.reportAt, now)}` : 'no report yet';
  const tiles = TILES.filter((t) => t.always || typeof s?.[t.key] === 'number');
  return (
    <Section testid="snow" title="Snow report" index="03" sub={sub}>
      {pre ? <PreSeason id={id} today={today} /> : null}
      {s && !s.reportIsToday && s.reportAt && !pre ? (
        <p class="rs-warn">
          <Glyph tone="warn" /> Not today's report: the numbers are from {clockRel(s.reportAt, now)}.
        </p>
      ) : null}
      {pre ? null : (
        <dl class="rs-tiles">
          {tiles.map((t) => (
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
      )}
      {summit && !pre ? (
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
      {(s && AREA[s.area] && !pre) || morning || s?.surface ? (
        <ul class="rs-list">
          {s && AREA[s.area] && !pre ? <li>{AREA[s.area]}</li> : null}
          {morning ? (
            <li>
              This morning's overnight reading ({formatLocalDate(morning.date, 'md')}):{' '}
              <Amount kind="snow" value={morning.value} units={units} />
            </li>
          ) : null}
          {s?.surface ? (
            <li>
              Surface: <b>{s.surface}</b>
            </li>
          ) : null}
        </ul>
      ) : null}
      {s?.text ? (
        <figure class="rs-card rs-quote">
          <figcaption class="rs-label rs-dim">Resort says:</figcaption>
          <blockquote>{s.text}</blockquote>
        </figure>
      ) : null}
    </Section>
  );
}
