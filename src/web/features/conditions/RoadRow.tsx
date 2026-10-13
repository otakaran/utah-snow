// One corridor of RoadsPanel (spec §8.2): state chip, ETO / closing time, traction and parking chips,
// headline, pass surface, Guardsman note, standing advisories, the latest UDOT post with its age, canyon-top minutes.
// Stale rows keep the last known facts, but the chip reads 'Last known: Open?' on the dashed off plate.
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { RESORTS } from '../../../../config/resorts.ts';
import { formatLocalDate, isoToMs } from '../../../shared/time.ts';
import type { Block, Corridor, RoadStatus } from '../../../shared/types.ts';
import type { Units } from '../../../shared/units.ts';
import { ageText, qty } from '../../lib/format.ts';
import { StatusChip } from '../../ui/StatusChip.tsx';
import {
  CORRIDOR_NAME,
  corridorResorts,
  postSnippet,
  type RoadView,
  roadData,
  roadView,
  showEto,
  travelMin,
} from './road-view.ts';

interface Props {
  corridor: Corridor;
  block: Block<RoadStatus> | null | undefined;
  now: number;
  units: Units;
  /** Expanded content (the corridor's ★ road cams, from the cams feature); the row stays plain without it. */
  cams?: ((c: Corridor) => ComponentChildren) | undefined;
}

const external = { target: '_blank', rel: 'noreferrer' } as const;

function Post({ post, now }: { post: NonNullable<RoadStatus['latestPost']>; now: number }) {
  const at = isoToMs(post.at);
  return (
    <div class="cond-post">
      <a class="cond-link" href={post.link} {...external}>
        UDOT post · {at === null ? '—' : ageText((now - at) / 60_000)} ↗
      </a>
      <p>“{postSnippet(post.text)}”</p>
    </div>
  );
}

function Facts({ r, units }: { r: RoadStatus; units: Units }) {
  const pass = r.pass;
  const surface = pass?.surface ? `${pass.surface.toLowerCase()} road` : null;
  const air = pass?.airF !== null && pass?.airF !== undefined ? `air ${qty('temp', pass.airF, units)}` : null;
  const passLine = [surface, air].filter(Boolean).join(', ');
  return (
    <>
      {r.headline ? <p class="cond-road-text">{r.headline}</p> : null}
      {pass && passLine ? (
        <p class="cond-dim">
          {pass.name}: {passLine}
        </p>
      ) : null}
      {r.guardsman ? <p class="cond-dim">{r.guardsman}</p> : null}
      {r.advisories?.length ? (
        <ul class="cond-tags" aria-label="Standing advisories">
          {r.advisories.map((a) => (
            <li key={a.id} class="cond-tag">
              {a.link ? (
                <a href={a.link} {...external}>
                  {postSnippet(a.text, 90)}
                </a>
              ) : (
                postSnippet(a.text, 90)
              )}
              <span class="cond-dim"> · until {formatLocalDate(a.until, 'md') || '—'}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}

function Chips({ r, v }: { r: RoadStatus | null; v: RoadView }) {
  return (
    <div class="cond-road-s">
      <StatusChip tone={v.chip.tone} word={v.chip.word} stale={v.stale} size="lg" />
      {r && !v.stale && showEto(r) ? (
        <span class="cond-eto">
          ETO <span class="cond-num">{r.eto}</span>
        </span>
      ) : null}
      {r && !v.stale && r.tractionLaw && r.state !== 'traction' ? <StatusChip tone="warn" word="Traction law" /> : null}
      {r && !v.stale
        ? (r.parkingFull ?? []).map((id) => (
            <StatusChip key={id} tone="bad" word={`${RESORTS[id].name} parking full`} />
          ))
        : null}
      {v.stale ? <span class="cond-age">updated {ageText(v.ageMin)}</span> : null}
    </div>
  );
}

/** The cams render only while open, so a closed row loads no images. */
function RoadCams({ corridor, cams }: { corridor: Corridor; cams: (c: Corridor) => ComponentChildren }) {
  const [open, setOpen] = useState(false);
  return (
    <details class="cond-more" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Road cams</summary>
      {open ? cams(corridor) : null}
    </details>
  );
}

export function RoadRow({ corridor: c, block, now, units, cams }: Props) {
  const r = roadData(block);
  const v = roadView(block, now);
  const mins = travelMin(c, r?.signs);
  const name = CORRIDOR_NAME[c];
  return (
    <li
      class={`cond-card cond-road cond-t-${v.stale ? 'off' : v.chip.tone}`}
      data-testid="road"
      data-corridor={c}
      data-state={r?.state ?? 'none'}
      data-stale={v.stale ? 'true' : 'false'}
    >
      <div class="cond-road-h">
        <h3 class="cond-road-code">{name.code}</h3>
        <span class="cond-road-route">
          {name.route} · {corridorResorts(c)}
        </span>
        {mins !== null ? (
          <span class="cond-road-min">
            <span class="cond-num">{mins}</span> min {name.travelTo}
          </span>
        ) : null}
      </div>
      <Chips r={r} v={v} />
      {r ? <Facts r={r} units={units} /> : <p class="cond-dim">No road data yet.</p>}
      {r?.latestPost ? <Post post={r.latestPost} now={now} /> : null}
      {cams ? <RoadCams corridor={c} cams={cams} /> : null}
    </li>
  );
}

/** Wall sidebar row: code, chip and ETO only. */
export function RoadWallRow({ corridor: c, block, now }: Omit<Props, 'units' | 'cams'>) {
  const r = roadData(block);
  const v = roadView(block, now);
  return (
    <li class="cond-wall-row" data-testid="road" data-corridor={c} data-stale={v.stale ? 'true' : 'false'}>
      <b class="cond-wall-code">{CORRIDOR_NAME[c].code}</b>
      <StatusChip tone={v.chip.tone} word={v.chip.word} stale={v.stale} />
      {r && !v.stale && showEto(r) ? <span class="cond-eto cond-num">ETO {r.eto}</span> : null}
    </li>
  );
}
