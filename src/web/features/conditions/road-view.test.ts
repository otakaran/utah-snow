import { describe, expect, it } from 'vitest';
import { isoUtc } from '../../../shared/time.ts';
import type { Block, Meta, RoadStatus } from '../../../shared/types.ts';
import {
  advisoryText,
  advisoryViews,
  guardsmanText,
  postSnippet,
  roadHeadline,
  roadView,
  stateChip,
  travelMin,
} from './road-view.ts';

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

describe('roadHeadline', () => {
  const post = { at: '2026-12-28T12:00:00Z' } as RoadStatus['latestPost'];

  it('drops the no-alert headline while a post carries the age, including the age old rows baked in', () => {
    expect(roadHeadline({ headline: 'Last UDOT update 59m ago', latestPost: post })).toBeNull();
    expect(roadHeadline({ headline: 'Latest UDOT update', latestPost: post })).toBeNull();
    expect(roadHeadline({ headline: null, latestPost: post })).toBeNull();
    expect(roadHeadline({ headline: 'Last UDOT update 2h ago (UDOT feed unavailable)', latestPost: post })).toBe(
      'Latest UDOT update (UDOT feed unavailable)',
    );
  });

  it('keeps real headlines', () => {
    expect(roadHeadline({ headline: 'Road Closure Alert (stale)', latestPost: post })).toBe(
      'Road Closure Alert (stale)',
    );
    expect(roadHeadline({ headline: 'No active UDOT alerts', latestPost: null })).toBe('No active UDOT alerts');
  });
});

describe('advisories', () => {
  const event = 'EB SR-190 at MP 20 (Guardsman Pass Rd): Road Closure, EB SR-190 at MP 20 (Guardsman Pass Rd) closed';

  it('reads a UDOT event as type · location, other texts as a snippet', () => {
    expect(advisoryText(event)).toBe('Road Closure · EB SR-190 at MP 20 (Guardsman Pass Rd)');
    expect(advisoryText('Bridge work: crews are repairing the joints over West Temple St. nightly')).toBe(
      'Bridge work: crews are repairing the joints over West Temple St. nightly',
    );
  });

  it('skips an advisory that repeats the Guardsman note and keeps one prefix on the note', () => {
    const a = { id: 'e1', text: event, link: null, until: '2026-10-14T06:00:00Z' };
    expect(advisoryViews({ advisories: [a], guardsman: 'Guardsman Pass: closed' })).toEqual([]);
    expect(advisoryViews({ advisories: [a], guardsman: null })[0]?.text).toBe(
      'Road Closure · EB SR-190 at MP 20 (Guardsman Pass Rd)',
    );
    expect(guardsmanText('Guardsman Pass: Guardsman Pass will be closed at 9:30pm')).toBe(
      'Guardsman Pass will be closed at 9:30pm',
    );
    expect(guardsmanText('Guardsman Pass: gate closed')).toBe('Guardsman Pass: gate closed');
  });
});
