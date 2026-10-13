// Per-corridor assembly (spec §5.6): base state from the newest state-bearing post, overlays, escalation,
// tractionLaw, advisories and the display blocks. Pure; inputs are already normalized by roads/parse.ts.
import { HOUR, isBetweenLocal, isoToMs, localDate } from '../../../shared/time.ts';
import type { Corridor, ResortId, RoadState, RoadStatus } from '../../../shared/types.ts';
import { type PostFacts, parkingIn } from './classify.ts';
import { type Signal, worse } from './raw.ts';
import type { SignView } from './signs.ts';
import { type Advisory, GUARDSMAN_SOURCE } from './traffic.ts';

export interface CorridorInput {
  corridor: Corridor;
  now: number;
  posts: PostFacts[] | null; // this corridor's posts, newest first; null = its WP feed failed this tick
  wpError: string | null;
  segments: RoadStatus['segments'];
  signs: SignView[];
  pass: RoadStatus['pass'];
  signals: Signal[]; // signs + traffic + resort feeds
  advisories: Advisory[]; // traffic construction closures
  prev: RoadStatus | null; // last-good row
}

const STATE_MS = 12 * HOUR;
const STALE_MS = 24 * HOUR;
const RECENT_MS = 6 * HOUR;
const MAX_CHECKS = 16;
const RESTRICTION_RE = /chain|traction|4x4|4wd/i;
const FEED_DOWN = ' (UDOT feed unavailable)';
const INTERLODGE_NOTE = ' – Interlodge possible – check x.com/altacentral';
// Spec §5.6 escalation inputs; other signals (e.g. Brighton comments) are recorded in crossChecks only.
const ESCALATES = (s: Signal): boolean =>
  s.source.startsWith('UDOT ') || s.source.startsWith('Alta ') || s.source.startsWith('Snowbird ');
const TRACTION_FROM = (s: Signal): boolean =>
  s.state === 'traction' && s.source !== 'Brighton comments' && s.source !== 'Snowbird alert';

const firstLine = (p: PostFacts): string => p.headline ?? p.text.split('\n')[0] ?? '';
const msOf = (s: string | null | undefined): number => isoToMs(s) ?? 0;

function baseState(posts: PostFacts[], now: number): { state: RoadState; headline: string; src: PostFacts | null } {
  const st = posts.find((p) => !p.advisory && p.state !== null);
  if (st?.state) {
    const age = now - st.ms;
    if (age < STATE_MS) {
      const passed = st.state === 'closure-scheduled' && st.closesAt !== null && msOf(st.closesAt) <= now;
      return { state: passed ? 'closed' : st.state, headline: firstLine(st), src: st };
    }
    if (age < STALE_MS && (st.state === 'closed' || st.state === 'interlodge')) {
      return { state: 'closed', headline: `${firstLine(st)} (stale)`, src: st };
    }
  }
  // No age in the text: the client renders it from latestPost.at, so it never goes stale in a cached row.
  return { state: 'open', headline: posts.length ? 'Latest UDOT update' : 'No active UDOT alerts', src: null };
}

/** Standing-advisory posts, one chip per route (the newest text, the latest end), while unexpired. */
function postAdvisories(posts: PostFacts[], now: number): Advisory[] {
  const byRoute = new Map<string, Advisory>();
  for (const p of posts) {
    if (!p.advisory) continue;
    const key = p.advisory.route ?? `post:${p.id}`;
    const have = byRoute.get(key);
    if (!have)
      byRoute.set(key, { id: `wp:${p.id}`, text: p.advisory.text, link: p.link || null, until: p.advisory.until });
    else if (msOf(p.advisory.until) > msOf(have.until)) have.until = p.advisory.until;
  }
  return [...byRoute.values()].filter((a) => msOf(a.until) > now);
}

/** BCC note: the newest Guardsman-only post, else an active Guardsman Pass event (never a closure). */
function guardsmanNote(posts: PostFacts[], signals: Signal[], carried: string | null): string | null {
  const post = posts.find((p) => p.guardsman)?.guardsman;
  const event = signals.find((s) => s.source === GUARDSMAN_SOURCE)?.raw;
  return post ?? (event ? `Guardsman Pass: ${event}`.slice(0, 300) : carried);
}

export function assembleCorridor(inp: CorridorInput): RoadStatus {
  const { corridor: c, now, posts, prev, signals } = inp;
  const up = posts !== null;
  const list = posts ?? [];
  const prevHeadline = (prev?.headline ?? 'No UDOT data').replace(FEED_DOWN, '').replace(INTERLODGE_NOTE, '');
  const carried: RoadState =
    prev?.state === 'closure-scheduled' && prev.closesAt && msOf(prev.closesAt) <= now
      ? 'closed'
      : (prev?.state ?? 'unknown');
  const base = up ? baseState(list, now) : { state: carried, headline: `${prevHeadline}${FEED_DOWN}`, src: null };
  let { state, headline } = base;
  const src = base.src;

  // tractionLaw (§5.6 step 4)
  const recent = list.filter((p) => !p.advisory && now - p.ms < RECENT_MS);
  const liftedAt = list.find((p) => p.lifted)?.ms ?? 0; // a 'Traction Law LIFTED' post ends older traction posts
  const traction = [
    ...recent.filter((p) => p.traction && p.ms > liftedAt).map(firstLine),
    ...inp.segments.filter((s) => RESTRICTION_RE.test(s.restriction)).map((s) => `${s.name}: ${s.restriction}`),
    ...signals.filter(TRACTION_FROM).map((s) => `${s.source}: ${s.raw}`),
  ];
  const tractionLaw = traction.length > 0 ? true : up ? false : (prev?.tractionLaw ?? null);

  // Overlays (step 2): only on open, traction or delays.
  if (state === 'open' || state === 'traction' || state === 'delays') {
    const delay = recent.find((p) => p.delay && p.ms >= liftedAt);
    const delaySig = signals.find((s) => s.state === 'delays' && ESCALATES(s));
    if (tractionLaw && state !== 'traction') {
      state = 'traction';
      headline = traction[0] ? `Traction law in effect – ${traction[0]}` : 'Traction law in effect';
    } else if (!tractionLaw && state === 'open' && (delay || delaySig)) {
      state = 'delays';
      headline = delay ? firstLine(delay) : `${delaySig?.source}: ${delaySig?.raw}`;
    }
  }

  // Escalation (step 3)
  const esc =
    signals.find((s) => s.state === 'interlodge' && ESCALATES(s) && worse('interlodge', state)) ??
    signals.find((s) => s.state === 'closed' && ESCALATES(s) && worse('closed', state));
  if (esc) {
    state = esc.state;
    headline = `${esc.source}: ${esc.raw}`;
  }

  const reason = src ? src.reason : up ? null : (prev?.reason ?? null);
  if (c === 'lcc' && state === 'closed' && reason === 'avalanche' && isBetweenLocal(now, '00:00', '09:00')) {
    headline += INTERLODGE_NOTE;
  }

  const today = localDate(now);
  const parking = new Set<ResortId>(
    up ? list.filter((p) => localDate(p.ms) === today).flatMap((p) => p.parkingFull) : (prev?.parkingFull ?? []),
  );
  for (const s of inp.signs) for (const r of parkingIn((s.advisory ?? '').toUpperCase())) parking.add(r);

  const lp = list[0];
  const advisories = up
    ? postAdvisories(list, now)
    : (prev?.advisories ?? []).filter((a) => a.id.startsWith('wp:') && msOf(a.until) > now);
  const checks: Signal[] = up ? [] : [{ source: 'UDOT WP', raw: inp.wpError ?? 'unavailable', state: 'unknown' }];

  return {
    corridor: c,
    state,
    tractionLaw,
    eto: src ? src.eto : up ? null : (prev?.eto ?? null),
    closesAt: src ? src.closesAt : up ? null : (prev?.closesAt ?? null),
    reason,
    headline: headline.slice(0, 300),
    latestPost: lp
      ? { id: lp.id, at: lp.at, text: lp.text, link: lp.link, site: lp.site, state: lp.state }
      : up
        ? null
        : (prev?.latestPost ?? null),
    guardsman: c === 'bcc' ? guardsmanNote(list, signals, up ? null : (prev?.guardsman ?? null)) : null,
    advisories: [...advisories, ...inp.advisories].slice(0, 8),
    segments: inp.segments,
    signs: inp.signs,
    pass: inp.pass,
    parkingFull: [...parking],
    crossChecks: [...checks, ...signals].slice(0, MAX_CHECKS),
  };
}
