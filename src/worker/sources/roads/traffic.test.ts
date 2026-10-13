import { describe, expect, it } from 'vitest';
import type { RoadStatus } from '../../../shared/types.ts';
import { roads } from '../roads.ts';
import type { RoadsRaw } from './raw.ts';

const CC = 'https://cottonwoodcanyons.udot.utah.gov';
// Keyless traffic row 36810 as served on 2026-10-13 (the seasonal Guardsman Pass gate), trimmed to the fields read.
const GATE = {
  DT_RowId: '36810',
  id: 36810,
  layerName: 'Construction',
  roadwayName: 'SR 190',
  description: 'Road Closure, EB SR-190 at MP 20 (Guardsman Pass Rd). Closed.',
  locationDescription: 'EB SR-190 at MP 20 (Guardsman Pass Rd)',
  startDate: '10/12/26, 9:37 PM',
  endDate: null,
  isFullClosure: true,
};
// The same gate as a keyed api `event` closure (synthetic: no keyed payload has been captured yet).
const KEYED_GATE = {
  ID: 90810,
  RoadwayName: 'SR-190',
  EventType: 'closures',
  IsFullClosure: true,
  StartDate: 1791862620,
  Location: 'EB SR-190 at MP 20 (Guardsman Pass Rd)',
  Description: 'Road Closure. Closed.',
};
const incident = (id: number, where: string) => ({ ...GATE, id, layerName: 'Incidents', locationDescription: where });

const bcc = (rows: unknown[], events: unknown[] = []): RoadStatus | undefined => {
  const raw: RoadsRaw = {
    keyed: false,
    wp: { [CC]: [] },
    conditions: null,
    passes: null,
    signs: null,
    traffic: [{ recordsTotal: 275, recordsFiltered: rows.length, data: rows }],
    events,
    snowbird: { roads: null, parking: null, alerts: null },
    brighton: null,
    errors: {},
  };
  return roads.parse(raw, { now: Date.parse('2026-10-13T21:00:00Z'), prev: {} }).rows['roads:bcc'] as RoadStatus;
};

describe('roads traffic: Guardsman Pass events never close BCC', () => {
  it('the gate (list Construction row, keyed closure) is the BCC note, neither a closure nor a chip', () => {
    const r = bcc([GATE], [KEYED_GATE]);
    expect([r?.state, r?.advisories]).toEqual(['open', []]);
    expect(r?.guardsman).toBe(
      'Guardsman Pass: EB SR-190 at MP 20 (Guardsman Pass Rd): Road Closure, EB SR-190 at MP 20 (Guardsman Pass Rd). Closed.',
    );
  });

  it('a full SR-190 closure below Brighton still closes BCC, also one that runs up to the pass', () => {
    expect(bcc([incident(1, 'SR-190 at MP 6 (S-Curves)')])?.state).toBe('closed');
    expect(bcc([incident(2, 'SR-190 MP 12 to Guardsman Pass')])?.state).toBe('closed');
  });
});
