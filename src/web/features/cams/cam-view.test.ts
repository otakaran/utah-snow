import { describe, expect, it } from 'vitest';
import { RESORT_CAMS, UDOT_CAMS } from '../../../../config/cams/index.ts';
import { isoUtc as iso, MIN } from '../../../shared/time.ts';
import type { CamDef } from '../../../shared/types.ts';
import type { CamApiState } from '../../data/cams.ts';
import { ageLabel, leadCam, shownCam, stillUrl, visibleCams } from './cam-view.ts';

const NOW = Date.parse('2027-01-05T13:30:00Z');
const LIVE = 'deer-valley-ontario-snowstake-live';
const STILL = 'deer-valley-ontario-snowstake-still';
const DV: readonly CamDef[] = RESORT_CAMS['deer-valley'];

const state = (id: string, over: Partial<CamApiState> = {}): CamApiState => ({
  id,
  status: 'ok',
  online: null,
  asOf: null,
  still: { card: '', detail: '', wall: '' },
  live: null,
  timelapse: { provider: 'none', available: false },
  ...over,
});
const ids = (cams: readonly CamDef[]): string[] => cams.map((d) => d.id);

describe('visibleCams', () => {
  it('DV: a live stake slot with no stream falls back to its -still twin, which shows as one tile', () => {
    const states = new Map([[LIVE, state(LIVE, { status: 'offline', online: false })]]);
    const shown = ids(visibleCams(DV, states, 'detail', NOW));
    expect(shown.filter((id) => id.includes('ontario'))).toEqual([STILL]);
    expect(new Set(shown).size).toBe(shown.length);
  });

  it('offline-gated UDOT cams show only once /api/cams reports them online', () => {
    const gated = UDOT_CAMS.filter((d: CamDef) => d.offlineGated);
    expect(gated.length).toBeGreaterThan(0);
    expect(visibleCams(gated, new Map(), 'detail', NOW)).toEqual([]);
    const online = new Map(gated.map((d) => [d.id, state(d.id, { online: true })]));
    expect(ids(visibleCams(gated, online, 'detail', NOW))).toEqual(ids(gated));
  });
});

describe('leadCam', () => {
  it('leads with the first shown stake, else the given hero cam, else none', () => {
    const [stake, other] = [DV.find((d) => d.id === STILL), DV.find((d) => !d.isStake)];
    if (!stake || !other) throw new Error('fixture');
    expect(leadCam([other, stake], other.id)).toBe(stake);
    expect(leadCam([other], other.id)).toBe(other);
    expect(leadCam([other], 'nope')).toBeNull();
  });
});

describe('ageLabel', () => {
  const superior = RESORT_CAMS.alta.find((d) => d.id === 'alta-mount-superior');
  const peak = RESORT_CAMS.snowbird.find((d) => d.kind === 'roundshot');
  if (!superior || !peak) throw new Error('fixture');

  it('a cam that passed its last probe shows the bound of the picture just loaded, not the probe time', () => {
    const passed = state(superior.id, { asOf: iso(NOW - 56 * MIN), checkedAt: iso(NOW - 55 * MIN) });
    expect(ageLabel(superior, passed, 'https://x/Superior.jpg', NOW - MIN, NOW)).toMatch(/^≤ \d+ min ago$/);
    expect(ageLabel(superior, passed, 'https://x/Superior.jpg', null, NOW)).toBe('loading…');
  });

  it('a stale cam and a Roundshot at night show the real age of their picture', () => {
    const stale = state(superior.id, { status: 'stale', asOf: iso(NOW - 180 * MIN), checkedAt: iso(NOW - 5 * MIN) });
    expect(ageLabel(superior, stale, null, NOW - MIN, NOW)).toBe('3 h ago');
    const night = state(peak.id, { status: 'ok', asOf: iso(NOW - 240 * MIN), checkedAt: iso(NOW - 5 * MIN) });
    expect(ageLabel(peak, night, null, NOW - MIN, NOW)).toBe('4 h ago');
    const archived = state('alta-collins-stake', { asOf: iso(NOW - 6 * MIN) }); // no checkedAt: the frame's time
    expect(ageLabel(superior, archived, null, NOW - MIN, NOW)).toBe('6 min ago');
  });
});

describe('a YouTube cam the Worker sent no still for', () => {
  const SOLITUDE: readonly CamDef[] = RESORT_CAMS.solitude;
  const summit = SOLITUDE.find((d) => d.id === 'solitude-summit-express');
  if (!summit) throw new Error('fixture');
  const live = { type: 'youtube', videoId: '5ZNLOc1thIc' } as const;
  // 2026-11-15: an offline stream still loaded i.ytimg's grey 404 placeholder under "≤ 5 min ago"
  const offline = state(summit.id, { status: 'offline', online: false, live });

  it('has no picture (config is not asked to rebuild the URL), an em dash for an age, and keeps its tile', () => {
    expect(stillUrl(summit, offline, 'card', NOW)).toBeNull();
    expect(stillUrl(summit, offline, 'detail', NOW)).toBeNull();
    expect(ageLabel(summit, offline, null, null, NOW)).toBe('—');
    const states = new Map([[summit.id, offline]]);
    expect(shownCam(summit, states, NOW)).toBe(summit);
    expect(ids(visibleCams(SOLITUDE, states, 'detail', NOW))).toContain(summit.id);
  });

  it('before /api/cams answers, and for a cam whose still is not a YouTube thumbnail, config still gives the URL', () => {
    expect(stillUrl(summit, undefined, 'card', NOW)).toMatch(
      /^https:\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/mqdefault_live\.jpg/,
    );
    const withStill = state(summit.id, {
      status: 'live',
      live,
      still: { card: 'https://i.ytimg.com/vi/5ZNLOc1thIc/mqdefault_live.jpg?t={m5}', detail: '', wall: '' },
    });
    expect(stillUrl(summit, withStill, 'card', NOW)).toContain('/5ZNLOc1thIc/mqdefault_live.jpg?t=');
    const superior = RESORT_CAMS.alta.find((d) => d.id === 'alta-mount-superior');
    if (!superior) throw new Error('fixture');
    expect(stillUrl(superior, state(superior.id), 'card', NOW)).toContain('Superior.jpg'); // '' from the test helper
  });
});
