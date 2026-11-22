import { describe, expect, it } from 'vitest';
import { isDrySnow } from './format.ts';

describe('isDrySnow', () => {
  it('is true for a plain zero in either unit, and false for a range, a trace or a dash', () => {
    for (const dry of ['0', '0.0', '0″', '0.0″', '0 cm', ' 0cm ']) expect(isDrySnow(dry), dry).toBe(true);
    for (const wet of ['0–0.1', '0.1', '1″', '10', '0.5″', '—', '']) expect(isDrySnow(wet), wet).toBe(false);
  });
});
