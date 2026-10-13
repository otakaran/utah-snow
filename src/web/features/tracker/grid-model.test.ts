import { describe, expect, it } from 'vitest';
import { TRIP } from '../../../../config/ikon.ts';
import type { CapDay } from '../../../shared/caps.ts';
import { cellText, dayListGroups, defaultStatus, focusDate, gridRows, resortChoices, tripDates } from './grid-model.ts';

const day = (personId: string, date: string, resortId: CapDay['resortId'], status: CapDay['status'] = 'skied') => ({
  personId,
  date,
  resortId,
  status,
});

/** n Alta/Snowbird-group days for `who`, starting at the trip start. */
const lcc = (who: string, n: number): CapDay[] =>
  tripDates()
    .slice(0, n)
    .map((d, i) => day(who, d, i % 2 ? 'snowbird' : 'alta-snowbird'));

describe('tracker grid model', () => {
  it('lists every trip date once, start to end', () => {
    const dates = tripDates();
    expect(dates).toHaveLength(TRIP.days);
    expect(dates[0]).toBe(TRIP.start);
    expect(dates.at(-1)).toBe(TRIP.end);
    expect(new Set(dates).size).toBe(TRIP.days);
  });

  it('builds date rows with one cell per person in crew order and marks past/today/future', () => {
    const people = [{ id: 'eva' }, { id: 'ana' }];
    const days = [day('ana', '2026-12-28', 'brighton'), day('ghost', '2026-12-28', 'alta')];
    const rows = gridRows(people, days, '2026-12-28');
    expect(rows).toHaveLength(TRIP.days);
    const [first, second, third] = rows;
    expect(first?.when).toBe('past');
    expect(second?.when).toBe('today');
    expect(third?.when).toBe('future');
    expect(second?.dayNo).toBe(2);
    expect(second?.cells.map((c) => c.personId)).toEqual(['eva', 'ana']);
    expect(second?.cells[0]?.day).toBeNull();
    expect(second?.cells[1]?.day?.resortId).toBe('brighton');
  });

  it('orders the phone list today, upcoming, then past days most recent first', () => {
    const { head, past } = dayListGroups(gridRows([], [], '2026-12-29'));
    expect(head.map((r) => r.date).slice(0, 2)).toEqual(['2026-12-29', '2026-12-30']);
    expect(head).toHaveLength(TRIP.days - 2);
    expect(past.map((r) => r.date)).toEqual(['2026-12-28', '2026-12-27']);
    expect(dayListGroups(gridRows([], [], '2027-03-01')).head).toEqual([]);
  });

  it('defaults past dates to skied and today/future to planned', () => {
    expect(defaultStatus('2026-12-27', '2026-12-28')).toBe('skied');
    expect(defaultStatus('2026-12-28', '2026-12-28')).toBe('planned');
    expect(defaultStatus('2026-12-29', '2026-12-28')).toBe('planned');
  });

  it('focuses today during the trip and clamps to the trip outside it', () => {
    expect(focusDate('2027-01-05')).toBe('2027-01-05');
    expect(focusDate('2026-10-12')).toBe(TRIP.start);
    expect(focusDate('2027-03-01')).toBe(TRIP.end);
    expect(focusDate('')).toBe(TRIP.start);
  });

  it('turns skiers-only resorts off for boarders but not for unknown mode', () => {
    const off = (mode: 'board' | 'unknown') =>
      resortChoices({ id: 'b', mode }, [], '2027-01-02')
        .filter((c) => c.disabled)
        .map((c) => c.resort);
    expect(off('board')).toEqual(['alta', 'alta-snowbird', 'deer-valley']);
    expect(off('unknown')).toEqual([]);
    const alta = resortChoices({ id: 'b', mode: 'board' }, [], '2027-01-02').find((c) => c.resort === 'alta');
    expect(alta?.reason).toBe('Skiers only');
  });

  it('turns a used-up cap group off, except for the date that already holds one of its days', () => {
    const days = lcc('ana', 7); // 7 Alta/Snowbird days: the cap
    const elsewhere = resortChoices({ id: 'ana', mode: 'ski' }, days, '2027-01-20');
    const off = elsewhere.filter((c) => c.disabled).map((c) => c.resort);
    expect(off).toEqual(['alta', 'snowbird', 'alta-snowbird']);
    expect(elsewhere.find((c) => c.resort === 'alta')?.reason).toBe('All 7 Alta/Snowbird days used');
    expect(elsewhere.find((c) => c.resort === 'solitude')).toMatchObject({ disabled: false, left: null });
    expect(elsewhere.find((c) => c.resort === 'brighton')).toMatchObject({ disabled: false, left: 6 });

    const sameDate = resortChoices({ id: 'ana', mode: 'ski' }, days, TRIP.start);
    expect(sameDate.find((c) => c.resort === 'snowbird')).toMatchObject({ disabled: false, left: 0 });
  });

  it('counts planned days against the cap like skied ones', () => {
    const days = lcc('ana', 6).concat(day('ana', '2027-01-10', 'alta', 'planned'));
    expect(
      resortChoices({ id: 'ana', mode: 'ski' }, days, '2027-01-20').find((c) => c.resort === 'alta')?.disabled,
    ).toBe(true);
  });

  it('captions a cell with the resort and status word', () => {
    expect(cellText(null)).toBeNull();
    expect(cellText({ resortId: 'alta-snowbird', status: 'planned' })).toEqual({
      resort: 'Alta + Snowbird',
      status: 'Planned',
    });
  });
});
