import { describe, expect, it } from 'vitest';
import { decodeEntities, num, range, text } from './num.ts';

describe('num', () => {
  it('treats placeholders and the -7999 sentinel as missing', () => {
    for (const v of ['--', '', '   ', 'N/A', -7999, '-7999.0', null, undefined, Number.NaN]) expect(num(v)).toBeNull();
  });

  it('parses numbers out of units, entities and thousands separators', () => {
    expect(num('39&#8221;')).toBe(39);
    expect(num(' -4.5 °F')).toBe(-4.5);
    expect(num('9,662 ft')).toBe(9662);
    expect(num(12)).toBe(12);
  });

  it('range keeps plausible values only', () => {
    expect(range(12, 0, 100)).toBe(12);
    expect(range(250, 0, 100)).toBeNull();
    expect(range(null, 0, 100)).toBeNull();
  });
});

describe('text', () => {
  it('strips markup, decodes entities and truncates', () => {
    expect(decodeEntities('6&#8221; &amp; 2&#x2033; &bogus;')).toBe('6” & 2″ &bogus;');
    expect(text('<p>Fresh&nbsp;snow</p>\n<script>x()</script><b>today</b>')).toBe('Fresh snow today');
    expect(text('<br>')).toBeNull();
    expect(text('a'.repeat(700))?.length).toBe(600);
  });
});
