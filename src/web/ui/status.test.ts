import { describe, expect, it } from 'vitest';
import { resortFreshWord } from './status.ts';

describe('resortFreshWord', () => {
  it('says Pre-season for a grey badge of a pre-season resort and keeps every other word', () => {
    expect(resortFreshWord('grey', 'preseason')).toBe('Pre-season');
    expect(resortFreshWord('red', 'preseason')).toBeUndefined(); // a failed source still reads Down
    expect(resortFreshWord('grey', 'open')).toBeUndefined();
    expect(resortFreshWord(null, undefined)).toBeUndefined();
  });
});
