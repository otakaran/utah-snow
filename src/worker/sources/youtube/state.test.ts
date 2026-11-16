import { describe, expect, it } from 'vitest';
import type { YtSlotState, YtState } from '../../../shared/types.ts';
import { readState } from './state.ts';

const NOW = Date.parse('2026-11-16T00:15:00Z');
const SUMMIT = 'solitude-summit-express';
const SEED = 'Yblyfl97Mhc'; // config/youtube.ts today

/** The stored row with one slot replaced (as a row written before `seed` existed unless the slot carries one). */
function row(cam: string, slot: Partial<YtSlotState>): YtState {
  const st = readState(null, NOW);
  for (const s of Object.values(st.slots)) delete s.seed;
  Object.assign(st.slots[cam] ?? {}, slot);
  return JSON.parse(JSON.stringify(st)) as YtState;
}

describe('readState: a corrected config seed', () => {
  it('2026-11-15: replaces a slot the API left offline on a dead ID, once', () => {
    const dead = { videoId: '5ZNLOc1thIc', status: 'offline', source: 'api', apiAt: NOW - 60_000 } as const;
    const first = readState(row(SUMMIT, dead), NOW);
    expect(first.slots[SUMMIT]).toMatchObject({ videoId: SEED, status: 'unknown', source: 'seed', seed: SEED });
    // fetch and parse both read the same stored row: the same answer twice
    expect(readState(row(SUMMIT, dead), NOW).slots[SUMMIT]).toEqual(first.slots[SUMMIT]);

    // the API then finds the seed dead too and discovery later points the slot elsewhere: the seed is not retried
    const moved = { ...first.slots[SUMMIT], videoId: 'AAAAAAAAAAA', status: 'offline', source: 'api' } as const;
    const stored = JSON.parse(JSON.stringify({ ...first, slots: { ...first.slots, [SUMMIT]: moved } })) as YtState;
    expect(readState(stored, NOW).slots[SUMMIT]).toMatchObject({ videoId: 'AAAAAAAAAAA', seed: SEED });
  });

  it('only marks a live slot that holds another video: a working stream is never dropped for a seed', () => {
    const live = { videoId: 'BBBBBBBBBBB', status: 'live', source: 'api', apiAt: NOW } as const;
    const st = readState(row(SUMMIT, live), NOW);
    expect(st.slots[SUMMIT]).toMatchObject({ videoId: 'BBBBBBBBBBB', status: 'live', seed: SEED });
    // once marked, going offline later does not bring the old seed back either
    const later = JSON.parse(JSON.stringify(st)) as YtState;
    Object.assign(later.slots[SUMMIT] ?? {}, { status: 'offline' });
    expect(readState(later, NOW).slots[SUMMIT]?.videoId).toBe('BBBBBBBBBBB');
  });

  it('keyless: a CamStreamer slot is reset to its seed at most once, so its counters can build up', () => {
    const cam = 'deer-valley-snow-park';
    const cs = { videoId: 'CCCCCCCCCCC', status: 'unknown', source: 'camstreamer', csMisses: 1 } as const;
    const first = readState(row(cam, cs), NOW);
    expect(first.slots[cam]).toMatchObject({ videoId: 'QozKoFs-hL0', source: 'seed' });
    const again = JSON.parse(JSON.stringify(first)) as YtState;
    Object.assign(again.slots[cam] ?? {}, cs); // CamStreamer puts its candidate back
    expect(readState(again, NOW).slots[cam]).toMatchObject({ videoId: 'CCCCCCCCCCC', csMisses: 1 });
  });

  it('a seed-sourced slot follows a changed seed at once, and a slot without a config seed is left alone', () => {
    const st = readState(row(SUMMIT, { videoId: 'rUXoOLxKKX4', status: 'unknown', source: 'seed' }), NOW);
    expect(st.slots[SUMMIT]?.videoId).toBe(SEED);
    const none = readState(row('brighton-majestic', { videoId: 'DDDDDDDDDDD', status: 'offline', source: 'api' }), NOW);
    expect(none.slots['brighton-majestic']).toMatchObject({ videoId: 'DDDDDDDDDDD', seed: null });
  });
});
