// PickCard (spec §8.2 `pick`, §10.3): the crew pick by default, [Crew | As me] when "I am" is set. Phone order: mode
// band (section 01), who, resort name (outranks the number), overnight number + OVERNIGHT caption, tier/score/drive,
// the six-peak ridge (CSS `order` lifts it above the fold), reasons, divergences, alternatives, action links, the
// collapsed crew/excluded/inputs block, the tomorrow outlook. From 900 px, .pick-main (who, hero, reasons,
// divergences, the crew chips' block beside the crew line) and .pick-aside (ridge, alternatives, actions, tomorrow)
// become two columns of about equal height. The root's id is a JumpBar target. Until the first snapshot, phones get
// .pick--wait (pick-card.css): the card keeps about its data height and no empty ridge, so nothing moves on arrival.
// Likewise [Crew | As me] shows the saved view while a set "I am" waits for the tracker, so the band never grows.
import { RESORTS } from '../../../../config/resorts.ts';
import { formatLocalDate } from '../../../shared/time.ts';
import type { PickResult, PickScope } from '../../../shared/types.ts';
import type { Units } from '../../../shared/units.ts';
import { me as meSetting, pickView, setPickView, units } from '../../data/settings.ts';
import { serverNow, snapshot } from '../../data/snapshot.ts';
import { people, trackerStatus } from '../../data/tracker.ts';
import { Toggle, type ToggleOption } from '../../ui/Toggle.tsx';
import { crewNames, previewLabel, scoreText, snowQty, TIER_LABEL } from './labels.ts';
import { PickMore } from './PickMore.tsx';
import { Actions, Alternatives, Divergences, Reasons } from './PickParts.tsx';
import { effectiveView, me } from './prefs.ts';
import { Ridge } from './Ridge.tsx';
import { overnightAll, pickOvernight } from './snow-values.ts';
import { TomorrowOutlook } from './TomorrowOutlook.tsx';
import { shownPick } from './use-pick.ts';
import './pick-card.css';

function modeLabel(r: PickResult | null, now: number): string {
  if (r?.mode === 'preview') return previewLabel();
  if (r?.mode === 'post') return 'Trip over';
  return `${r?.scope === 'me' ? 'My pick' : "Today's pick"} · ${formatLocalDate(now, 'short')}`;
}

const VIEW_OPTIONS = [
  { value: 'crew', label: 'Crew' },
  { value: 'me', label: 'As me' },
] as const satisfies readonly ToggleOption<PickScope>[];

function Who({ r }: { r: PickResult }) {
  if (people.value.length === 0) {
    return (
      <p class="pick-who">
        One skier, full caps · <a href="#/tracker">Add the crew in Tracker</a>
      </p>
    );
  }
  const head = r.scope === 'me' ? 'As me' : `Crew pick · ${r.members.length} going`;
  return (
    <p class="pick-who">
      {head}: <span>{crewNames(r.members)}</span>
    </p>
  );
}

/** Name, overnight number + caption, tier, score and drive. Shared with the compact wall variant. */
export function PickHero({ r, units: u }: { r: PickResult; units: Units }) {
  const top = r.ranked.find((x) => x.resort === r.pick);
  const o = pickOvernight(snapshot.value, r);
  const snow = snowQty(o.inches, u);
  return (
    <>
      <h2 id="pick-title" class="pick-name">
        {r.pick ? RESORTS[r.pick].name : 'No pick'}
      </h2>
      <div class="pick-hero">
        <p class="pick-big">
          <span class="num pick-num">
            {snow.value}
            {snow.unit ? <span class="pick-unit">{snow.unit}</span> : null}
          </span>
          <span class="pick-cap">Overnight{o.note ? ` · ${o.note}` : ''}</span>
        </p>
        <div class="pick-side">
          {r.tier ? <span class="pick-tier">{TIER_LABEL[r.tier]}</span> : null}
          <span class="pick-stat">
            <span class="num">{top ? scoreText(top.net) : '—'}</span> <small>score</small>
          </span>
          <span class="pick-stat">
            <span class="num">{top ? Math.round(top.driveMin) : '—'}</span> <small>min drive</small>
          </span>
        </div>
      </div>
    </>
  );
}

export function PickCard() {
  const r = shownPick.value;
  const u = units.value;
  const live = r !== null && r.mode !== 'post';
  const waiting = snapshot.value === null;
  const meLoading = !me.value && !!meSetting.value && trackerStatus.value === 'idle';
  return (
    <section
      id="pick"
      data-testid="pick"
      class={waiting ? 'pick pick--wait' : 'pick'}
      aria-live="polite"
      aria-labelledby="pick-title"
    >
      <div class="pick-band">
        <p class="pick-mode">
          <span class="pick-no num" aria-hidden="true">
            01
          </span>
          {modeLabel(r, serverNow.value)}
        </p>
        {me.value || meLoading ? (
          <Toggle
            label="Pick for"
            name="pick-view"
            value={meLoading ? pickView.value : effectiveView.value}
            options={VIEW_OPTIONS}
            onChange={setPickView}
            testid="pick-view"
          />
        ) : null}
      </div>
      <div class="pick-body">
        <div class="pick-main">
          {live ? <Who r={r} /> : null}
          {live ? (
            <PickHero r={r} units={u} />
          ) : (
            <h2 id="pick-title" class="pick-name">
              {r ? 'Trip over' : waiting ? 'Waiting for data…' : 'Pick unavailable'}
            </h2>
          )}
          {live && r.lowValue ? <p class="pick-low">Low-value day: consider a rest day.</p> : null}
          {live ? <Reasons r={r} /> : null}
          {live && r.scope === 'crew' ? <Divergences r={r} /> : null}
          {live ? <PickMore r={r} /> : null}
        </div>
        <div class="pick-aside">
          <Ridge values={overnightAll(snapshot.value, r)} pick={live ? r.pick : null} units={u} />
          {live ? (
            <>
              <Alternatives r={r} units={u} />
              <Actions r={r} />
            </>
          ) : null}
          <TomorrowOutlook />
        </div>
      </div>
    </section>
  );
}
