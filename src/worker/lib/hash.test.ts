import { describe, expect, it } from 'vitest';
import { ipKey } from './hash.ts';

describe('ipKey', () => {
  it('keeps IPv4 and folds IPv6 to its /64, so rotating addresses inside it is one client', () => {
    expect(ipKey('203.0.113.7')).toBe('203.0.113.7');
    expect(ipKey('2001:db8:0:1:aaaa::1')).toBe('v6:2001:db8:0:1::/64');
    expect(ipKey('2001:DB8:0:1:bbbb:cccc:dddd:eeee')).toBe('v6:2001:db8:0:1::/64');
    expect(ipKey('2001:db8::1')).toBe('v6:2001:db8:0:0::/64');
    expect(ipKey('::ffff:198.51.100.1')).toBe('198.51.100.1');
  });
});
