import { describe, expect, it } from 'vitest';
import { altaJson, stampIso } from './alta-page.ts';

describe('altaJson', () => {
  it('reads the window.Alta object directly or by brace scan', () => {
    expect(altaJson('<script>window.Alta = {"a":"<\\/b>"};</script>')).toEqual({ a: '</b>' });
    expect(altaJson('<script>window.Alta = {"a":{"b":"}"}}; window.x = 1;</script>')).toEqual({ a: { b: '}' } });
    expect(altaJson('window.Alta = {"a":1}')).toEqual({ a: 1 });
  });

  it('returns null without the marker or a JSON object', () => {
    for (const html of ['<html></html>', '<script>window.Alta = [1];</script>', 'window.Alta = {"a":']) {
      expect(altaJson(html)).toBeNull();
    }
  });
});

describe('stampIso', () => {
  it("adds Denver's offset, or the one Alta's DST flag pins, keeping the wall time", () => {
    expect(stampIso('2026-02-12 11:05:05')).toBe('2026-02-12T11:05:05-07:00');
    expect(stampIso(' 2026-07-04T09:30 ')).toBe('2026-07-04T09:30:00-06:00');
    expect(stampIso('2026-02-12 11:05:05', true)).toBe('2026-02-12T11:05:05-06:00');
    expect(stampIso('2026-07-04 09:30', false)).toBe('2026-07-04T09:30:00-07:00');
    expect([stampIso('2026-02-12'), stampIso('11:05'), stampIso(42), stampIso('2026-13-01 10:00')]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });
});
