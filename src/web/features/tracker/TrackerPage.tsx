// #/tracker (spec §9.5): the crew's shared Ikon day tracker. Link-only, no login: anyone with the link can edit;
// every change lands in "Recent changes" with an Undo. Section order: days, days left, save thresholds, bookings,
// crew, recent changes. With no crew yet, the crew form comes first.
import { useEffect } from 'preact/hooks';
import { me, setMe } from '../../data/settings.ts';
import {
  dismissNotice,
  people,
  trackerError,
  trackerLoaded,
  trackerNotice,
  trackerSaving,
  trackerServerTime,
  trackerStatus,
  watchTracker,
} from '../../data/tracker.ts';
import { clock } from '../../lib/format.ts';
import { Section } from '../../ui/Section.tsx';
import { Glyph } from '../../ui/StatusChip.tsx';
import type { Tone } from '../../ui/status.ts';
import { AuditLog } from './AuditLog.tsx';
import { Bookings } from './Bookings.tsx';
import { DayPicker } from './DayPicker.tsx';
import { Grid } from './Grid.tsx';
import { People } from './People.tsx';
import { Summary } from './Summary.tsx';
import { Thresholds } from './Thresholds.tsx';
import './tracker.css';

function SyncLine() {
  let tone: Tone = 'ok';
  let word: string;
  if (trackerSaving.value) {
    tone = 'warn';
    word = 'Saving…';
  } else if (trackerStatus.value === 'missing') {
    tone = 'off';
    word = 'Tracker not live yet';
  } else if (trackerError.value) {
    tone = 'bad';
    word = trackerLoaded.value ? `Can't sync (${trackerError.value}) – showing last data` : "Can't load the tracker";
  } else if (!trackerLoaded.value) {
    tone = 'off';
    word = 'Loading…';
  } else {
    const at = trackerServerTime.value;
    word = at > 0 ? `Synced ${clock(at)}` : 'Synced';
  }
  return (
    <p class={`trk-sync trk-tone-${tone}`} data-testid="tracker-sync" role="status">
      <Glyph tone={tone} />
      <span>{word}</span>
    </p>
  );
}

/** "I am" (utahsnow.me): drives "As me" on the pick card. */
function IAm() {
  const id = me.value;
  const list = people.value;
  if (list.length === 0) return null;
  return (
    <label class="field trk-iam" data-testid="tracker-iam">
      <span class="field-label">I am</span>
      <select
        value={id === null ? '' : id === '' ? '-' : id}
        onChange={(e) => {
          const v = e.currentTarget.value;
          setMe(v === '-' ? '' : v || null);
        }}
      >
        <option value="">Not set (ask me)</option>
        <option value="-">Skip (crew only)</option>
        {list.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}

const NOTICE_TONE: Record<'ok' | 'warn' | 'bad', Tone> = { ok: 'ok', warn: 'warn', bad: 'bad' };

/** Inline result of the last change: cap reached, rate limit, conflict, server warnings. */
function Notice() {
  const n = trackerNotice.value;
  if (!n) return null;
  return (
    <div
      class={`trk-notice trk-notice-${n.tone}`}
      data-testid="tracker-notice"
      role={n.tone === 'bad' ? 'alert' : 'status'}
    >
      <Glyph tone={NOTICE_TONE[n.tone]} />
      <p>{n.text}</p>
      <button type="button" class="btn-icon" aria-label="Dismiss" onClick={dismissNotice}>
        ×
      </button>
    </div>
  );
}

export function TrackerPage() {
  useEffect(() => watchTracker(), []);
  const empty = people.value.length === 0;
  const crew = (
    <Section testid="tracker-people" index={empty ? '01' : '05'} title="Crew">
      <People />
    </Section>
  );
  return (
    <div class="tracker" data-testid="tracker">
      <div class="trk-head">
        <div>
          <h1 class="page-title">Day tracker</h1>
          <p class="trk-lede">Shared by link: anyone with it can edit. Every change can be undone below.</p>
          <SyncLine />
        </div>
        <IAm />
      </div>
      {empty ? (
        <>
          {crew}
          <p class="trk-empty">Add the crew to start recording ski days, Ikon caps and bookings.</p>
        </>
      ) : (
        <>
          <Section testid="tracker-days" index="01" title="Ski days" sub="Tap a day to set or clear a resort">
            <Grid />
          </Section>
          <Section testid="tracker-summary" index="02" title="Days left">
            <Summary />
          </Section>
          <Section testid="tracker-thresholds" index="03" title="Save thresholds">
            <Thresholds />
          </Section>
          <Section testid="tracker-bookings" index="04" title="Bookings">
            <Bookings />
          </Section>
          {crew}
        </>
      )}
      <Section testid="tracker-audit" index={empty ? '02' : '06'} title="Recent changes">
        <AuditLog />
      </Section>
      <Notice />
      <DayPicker />
    </div>
  );
}
