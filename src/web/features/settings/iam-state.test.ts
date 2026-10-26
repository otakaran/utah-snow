import { describe, expect, it } from 'vitest';
import { iamState } from './iam-state.ts';

const crew = [{ id: 'a' }, { id: 'b' }];

describe('iamState', () => {
  it('holds the slot while the tracker loads, but only when me is unset', () => {
    expect(iamState([], null, false)).toBe('wait');
    expect(iamState([], 'a', false)).toBe('hide');
    expect(iamState([], '', false)).toBe('hide');
  });

  it('asks once the crew is known, unless me is a crew member or skipped', () => {
    expect(iamState(crew, null, true)).toBe('ask');
    expect(iamState(crew, 'gone', true)).toBe('ask');
    expect(iamState(crew, 'a', true)).toBe('hide');
    expect(iamState(crew, '', true)).toBe('hide');
    expect(iamState([], null, true)).toBe('hide');
  });
});
