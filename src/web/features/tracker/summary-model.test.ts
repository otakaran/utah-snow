import { describe, expect, it } from 'vitest';
import type { CapDay } from '../../../shared/caps.ts';
import { capTable, capTone, capWord, chipSave, pips } from './summary-model.ts';

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

  it('punches skied, then planned, then left pips; none when unlimited, extra ones over the cap', () => {
    expect(pips(4, 1, 2)).toEqual(['skied', 'planned', 'planned', 'left']);
    expect(pips(null, 3, 0)).toEqual([]);
    expect(pips(2, 2, 1)).toEqual(['skied', 'skied', 'planned']);
  });

  it('adds a crew-minimum row only for two or more people', () => {
    const days = Array.from({ length: 7 }, (_, i) => d('eva', `2027-01-0${i + 1}`, 'brighton'));
    const t = capTable(people, days);
    expect(t.crew?.[1]).toMatchObject({ group: 'brighton', remaining: 0, tone: 'bad', word: 'None left', skied: 7 });
    expect(t.crew?.[0]).toMatchObject({ group: 'alta-snowbird', remaining: 7 });
    expect(t.crew?.[4]?.remaining).toBeNull();
    expect(capTable(people.slice(0, 1), days).crew).toBeNull();
  });

  it("gates the pick's save number on the chip's own count (the pick leaves today's planned day out)", () => {
    const days = [
      ...Array.from({ length: 6 }, (_, i) => d('ana', `2027-01-0${i + 1}`, 'alta')),
      d('ana', '2027-01-20', 'snowbird', 'planned'),
    ];
    const c = capTable(people, days).rows[0]?.cells[0];
    if (!c) throw new Error('no cell');
    expect(c.word).toBe('None left');
    expect(chipSave(c, { remaining: 1, threshold: 0, expiringFrom: '2027-01-20' })).toEqual({
      threshold: null,
      from: null,
    });
    expect(chipSave(c, { remaining: 1, threshold: 9.8, expiringFrom: '2027-01-31' })).toEqual({
      threshold: null,
      from: null,
    });
    const open = capTable(people, []).rows[0]?.cells[0];
    if (!open) throw new Error('no cell');
    expect(chipSave(open, { remaining: 7, threshold: 4, expiringFrom: '2027-01-25' })).toEqual({
      threshold: 4,
      from: '2027-01-25',
    });
    expect(chipSave(open, { remaining: 7, threshold: 0, expiringFrom: '2027-01-25' })).toEqual({
      threshold: 0,
      from: null,
    });
  });

  it('handles an empty crew', () => {
    expect(capTable([], [])).toMatchObject({ rows: [], crew: null });
  });
});
