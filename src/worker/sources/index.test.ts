import { describe, expect, it } from 'vitest';
import { PRIORITY, SLOTS } from '../../../config/schedule.ts';
import { probeList, SOURCES, sourceOfRow, staleAfterMin } from './index.ts';

const slotIds = new Set(SLOTS.flatMap((s) => [...s.always, ...s.morning]));
const sourceIds = SOURCES.map((s) => s.id);

describe('registry', () => {
  it('every scheduled job id resolves to exactly one Source, and every Source is scheduled', () => {
    for (const id of slotIds)
      expect(
        sourceIds.filter((s) => s === id),
        id,
      ).toHaveLength(1);
    for (const id of sourceIds) expect(slotIds.has(id), id).toBe(true);
    expect(new Set(sourceIds).size).toBe(sourceIds.length);
  });

  it('every Source has a PRIORITY entry and no two Sources write the same row', () => {
    for (const id of sourceIds) {
      const key = id.startsWith('nws-grid:') ? 'nws-grid' : id;
      expect((PRIORITY as readonly string[]).includes(key), id).toBe(true);
    }
    const rows = SOURCES.flatMap((s) => s.rows);
    expect(new Set(rows).size).toBe(rows.length);
  });

  it('staleAfterMin honors staleByRow, then the source default, then 60', () => {
    expect(staleAfterMin('nws:afd')).toBe(720);
    expect(staleAfterMin('nws:alerts')).toBe(60);
    expect(staleAfterMin('nws:points')).toBe(11520);
    expect(staleAfterMin('udot:cams')).toBe(2880);
    expect(staleAfterMin('roads:lcc')).toBe(25);
    expect(staleAfterMin('resort:solitude')).toBe(40);
    expect(staleAfterMin('no-such-row')).toBe(60);
    expect(sourceOfRow('nws:points')?.id).toBe('maintenance');
  });

  it('probe allowlist has unique hostIds and https URLs', () => {
    const list = probeList();
    expect(new Set(list.map((p) => p.hostId)).size).toBe(list.length);
    for (const p of list) expect(p.url, p.hostId).toMatch(/^https:\/\//);
  });
});
