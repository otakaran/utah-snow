import { describe, expect, it } from 'vitest';
import { clampEntry, savedFlash } from './clamp-entry.ts';

describe('clampEntry', () => {
  it('rounds, clamps to the range and keeps the previous value for a blank entry', () => {
    expect(clampEntry('42.4', 5, 600, 20)).toEqual({ value: 42, note: null });
    expect(clampEntry('2', 5, 600, 20)).toEqual({ value: 5, note: 'min' });
    expect(clampEntry('9000', 5, 600, 20)).toEqual({ value: 600, note: 'max' });
    expect(clampEntry(' ', 5, 600, 20)).toEqual({ value: 20, note: 'kept' });
  });

  it('says what was stored when it differs from the entry', () => {
    expect(savedFlash({ value: 42, note: null }, ' s')).toEqual({ ok: true, text: 'Saved' });
    expect(savedFlash({ value: 5, note: 'min' }, ' s')).toEqual({ ok: false, text: 'Saved: 5 s (min)' });
    expect(savedFlash({ value: 85, note: 'kept' }, '%')).toEqual({ ok: false, text: 'Kept 85%' });
  });
});
