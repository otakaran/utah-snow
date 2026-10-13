import { describe, expect, it } from 'vitest';
import { RESORT_CAMS, UDOT_CAMS } from '../../../../config/cams/index.ts';
import type { CamDef } from '../../../shared/types.ts';
import type { CamApiState } from '../../data/cams.ts';
import { leadCam, visibleCams } from './cam-view.ts';

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
