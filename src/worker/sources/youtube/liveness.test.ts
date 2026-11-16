import { describe, expect, it } from 'vitest';
import type { YtState } from '../../../shared/types.ts';
import type { CsHit } from './camstreamer.ts';
import type { ApiCall, VideoItem } from './data-api.ts';
import { applyLiveness } from './liveness.ts';
import { readState } from './state.ts';

const NOW = Date.parse('2026-11-16T00:15:00Z');
const DV = 'UCTqz2P_u5ewpc7ICo9p-TMg';
const SOLITUDE = 'UCsG59EVXq_OZatwq299yThg';
const SOLITUDE_WEBCAMS = 'UC7doi0RX8jMJS1_cbb5gX-A';
const ONTARIO = 'deer-valley-ontario-snowstake-live';
const PARK_PEAK = 'deer-valley-park-peak-snowstake';
const SUMMIT = 'solitude-summit-express';

const video = (id: string, channelId: string, title: string, actualStartTime: string): VideoItem => ({
  id,
  snippet: { channelId, title, liveBroadcastContent: 'live' },
  liveStreamingDetails: { actualStartTime },
  status: { embeddable: true },
});
const call = (...items: VideoItem[]): ApiCall => ({ status: 200, ids: items.map((v) => v.id), items });
const embed = (cam: string, id: string): CsHit => ({
  cam,
  status: 302,
  location: `https://www.youtube.com/embed/${id}?autoplay=1&mute=1`,
});
/** A state as production held it on 2026-11-15: every slot from its seed, then the given slots overridden. */
function state(over: Record<string, Partial<YtState['slots'][string]>>): YtState {
  const st = readState(null, NOW);
  for (const [cam, s] of Object.entries(over)) Object.assign(st.slots[cam] ?? {}, s);
  return st;
}

describe('applyLiveness', () => {
  it('2026-11-15: the Park Peak stream leaves the Ontario slot, and Ontario takes its own stream back', () => {
    const parkPeak = video('k8NiVrlQACQ', DV, 'Park Peak Snow Stake Livestream', '2026-10-28T18:00:00Z');
    const ontario = video('4vi7EiWba7E', DV, 'Ontario Snow Stake Livestream', '2026-10-13T16:00:00Z');
    // Ontario's regex matches both titles and the newer stream had won its slot
    const st = state({
      [ONTARIO]: { videoId: 'k8NiVrlQACQ', status: 'live', source: 'api', actualStartTime: '2026-10-28T18:00:00Z' },
    });
    applyLiveness(st, call(parkPeak, ontario), [embed(ONTARIO, '4vi7EiWba7E'), embed(PARK_PEAK, 'k8NiVrlQACQ')], NOW);
    expect(st.slots[PARK_PEAK]).toMatchObject({ videoId: 'k8NiVrlQACQ', status: 'live' });
    expect(st.slots[ONTARIO]).toMatchObject({ videoId: '4vi7EiWba7E', status: 'live', deadSince: null });
    expect(st.retries).toEqual({}); // Ontario never counted as a death
    // and it stays that way on the next tick
    applyLiveness(st, call(parkPeak, ontario), [embed(ONTARIO, '4vi7EiWba7E'), embed(PARK_PEAK, 'k8NiVrlQACQ')], NOW);
    expect([st.slots[ONTARIO]?.videoId, st.slots[PARK_PEAK]?.videoId]).toEqual(['4vi7EiWba7E', 'k8NiVrlQACQ']);
  });

  it("a stream on the resort's second channel is live in its slot; one from a foreign channel is not", () => {
    const summit = video('Yblyfl97Mhc', SOLITUDE_WEBCAMS, 'Summit Express Lift Line', '2026-11-09T17:20:00Z');
    const st = state({});
    expect(st.slots[SUMMIT]).toMatchObject({ videoId: 'Yblyfl97Mhc', status: 'unknown', source: 'seed' });
    applyLiveness(st, call(summit), [], NOW);
    expect(st.slots[SUMMIT]).toMatchObject({ videoId: 'Yblyfl97Mhc', status: 'live', source: 'api' });
    expect(st.seen.Yblyfl97Mhc).toMatchObject({ channel: 'solitude', live: true });

    const foreign = state({});
    applyLiveness(foreign, call({ ...summit, snippet: { ...summit.snippet, channelId: DV } }), [], NOW);
    expect(foreign.slots[SUMMIT]?.status).toBe('offline');
    const own = state({ 'solitude-link-lift-line': { videoId: 'Yx3QmuKfwjY' } });
    applyLiveness(own, call(video('Yx3QmuKfwjY', SOLITUDE, 'Link Lift Line', '2025-12-12T16:01:27Z')), [], NOW);
    expect(own.slots['solitude-link-lift-line']?.status).toBe('live');
  });
});
