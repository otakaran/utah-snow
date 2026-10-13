import { describe, expect, it } from 'vitest';
import { isoUtc } from '../../../shared/time.ts';
import type { Block, Meta, RoadStatus } from '../../../shared/types.ts';
import { postSnippet, roadView, stateChip, travelMin } from './road-view.ts';

const NOW = Date.parse('2026-12-28T13:00:00Z'); // 6:00 AM Denver

function block(state: RoadStatus['state'], okMinAgo: number | null, extra: Partial<Meta> = {}): Block<RoadStatus> {
  const okAt = okMinAgo === null ? null : isoUtc(NOW - okMinAgo * 60_000);
  const data = { corridor: 'lcc', state, closesAt: null, signs: [] } as unknown as RoadStatus;
  const meta: Meta = {
    source: 'roads:lcc',
    fetchedAt: okAt,
    okAt,
    asOf: null,
    status: 'ok',
    failCount: 0,
    staleAfterMin: 25,
  };
  return { data, meta: { ...meta, ...extra } };
}

describe('roadView', () => {
  it('shows the live state while the row is fresh', () => {
    expect(roadView(block('closed', 3), NOW)).toEqual({
      chip: { tone: 'bad', word: 'Closed' },
      stale: false,
      ageMin: 3,
    });
  });

  it('marks a row stale past staleAfterMin or after two failed fetches (StatusChip then says LAST KNOWN)', () => {
    expect(roadView(block('open', 41), NOW)).toMatchObject({ chip: { tone: 'ok', word: 'Open' }, stale: true });
    expect(roadView(block('traction', 5, { status: 'error', failCount: 2 }), NOW).stale).toBe(true);
    expect(roadView(block('traction', 5, { status: 'error', failCount: 1 }), NOW).stale).toBe(false);
  });

  it('shows a missing or placeholder row as a plain No data', () => {
    expect(roadView(undefined, NOW)).toEqual({ chip: { tone: 'off', word: 'No data' }, stale: false, ageMin: null });
    const seeded = { ...block('open', 1), data: {} as RoadStatus };
    expect(roadView(seeded, NOW).chip.word).toBe('No data');
  });

  it('names the time of a scheduled closure', () => {
    expect(stateChip({ state: 'closure-scheduled', closesAt: '2026-12-28T23:00:00Z' }, NOW)).toEqual({
      tone: 'warn',
      word: 'Closing 4:00 PM',
    });
  });
});

describe('travelMin', () => {
  const signs = [
    { travel: [{ dest: 'TIME TO I-84', min: 38 }] },
    { travel: [{ dest: 'TIME TO PARK CITY', min: 14 }] },
    { travel: [{ dest: 'TO PARK CITY SR248 VIA KIMBALL JCT', min: 9 }] },
  ] as unknown as RoadStatus['signs'];

  it('takes the first sign that times the resort end of the corridor', () => {
    expect(travelMin('parleys', signs)).toBe(14);
    expect(travelMin('lcc', signs)).toBeNull();
    expect(travelMin('bcc', null)).toBeNull();
  });
});

describe('postSnippet', () => {
  it('joins lines and cuts long posts at a word', () => {
    expect(postSnippet('👋 SR-190 ROAD CONDITIONS\n\nBe  prepared\n')).toBe('👋 SR-190 ROAD CONDITIONS · Be prepared');
    expect(postSnippet('Construction for Weber Canyon Bridge replacement in progress', 30)).toBe(
      'Construction for Weber Canyon…',
    );
  });
});
