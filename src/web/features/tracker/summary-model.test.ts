import { describe, expect, it } from 'vitest';
import type { CapDay } from '../../../shared/caps.ts';
import { capTable, capTone, capWord } from './summary-model.ts';

const d = (personId: string, date: string, resortId: CapDay['resortId'], status: CapDay['status'] = 'skied') => ({
  personId,
  date,
  resortId,
  status,
});

const people = [
  { id: 'ana', name: 'Ana' },
  { id: 'eva', name: 'Eva' },
];

describe('tracker cap summary', () => {
  it('maps remaining days to tone and word (red at 0, amber when low, unlimited ok)', () => {
    expect([capTone(5), capWord(5)]).toEqual(['ok', '5 left']);
    expect([capTone(2), capWord(2)]).toEqual(['warn', '2 left']);
    expect([capTone(0), capWord(0)]).toEqual(['bad', 'None left']);
    expect([capTone(-1), capWord(-1)]).toEqual(['bad', '1 over']);
    expect([capTone(null), capWord(null)]).toEqual(['ok', 'Unlimited']);
  });

  it('gives each person every group with skied/planned split; a combo day counts once', () => {
    const days = [
      d('ana', '2026-12-27', 'alta-snowbird'),
      d('ana', '2026-12-28', 'snowbird', 'planned'),
      d('ana', '2026-12-29', 'solitude'),
      d('eva', '2026-12-27', 'brighton'),
      d('zed', '2026-12-27', 'alta'), // not in the crew: ignored
    ];
    const t = capTable(people, days);
    expect(t.groups.map((g) => g.id)).toEqual(['alta-snowbird', 'brighton', 'deer-valley', 'snowbasin', 'solitude']);
    const ana = t.rows[0];
    expect(ana?.name).toBe('Ana');
    expect(ana?.cells[0]).toMatchObject({ group: 'alta-snowbird', cap: 7, skied: 1, planned: 1, remaining: 5 });
    expect(ana?.cells[4]).toMatchObject({ group: 'solitude', cap: null, skied: 1, remaining: null, word: 'Unlimited' });
    expect(t.rows[1]?.cells[1]).toMatchObject({ group: 'brighton', remaining: 6, tone: 'ok' });
  });

  it('adds a crew-minimum row only for two or more people', () => {
    const days = Array.from({ length: 7 }, (_, i) => d('eva', `2027-01-0${i + 1}`, 'brighton'));
    const t = capTable(people, days);
    expect(t.crew?.[1]).toMatchObject({ group: 'brighton', remaining: 0, tone: 'bad', word: 'None left' });
    expect(t.crew?.[0]).toMatchObject({ group: 'alta-snowbird', remaining: 7 });
    expect(t.crew?.[4]?.remaining).toBeNull();
    expect(capTable(people.slice(0, 1), days).crew).toBeNull();
  });

  it('handles an empty crew', () => {
    expect(capTable([], [])).toMatchObject({ rows: [], crew: null });
  });
});
