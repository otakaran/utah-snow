// Hashing and constant-time comparison (Web Crypto only).

const enc = new TextEncoder();

/** Hex SHA-256 of a UTF-8 string. */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * The client an address stands for: IPv4 as is; IPv6 as its /64 ('v6:2001:db8:0:1::/64'), since one client usually
 * owns a whole /64 and could rotate addresses inside it. An IPv4-mapped IPv6 address counts as its IPv4.
 */
export function ipKey(ip: string): string {
  if (!ip.includes(':')) return ip;
  if (ip.includes('.')) return ip.slice(ip.lastIndexOf(':') + 1);
  const [head = '', tail] = ip.toLowerCase().split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const zeros = tail === undefined ? [] : Array<string>(Math.max(0, 8 - left.length - right.length)).fill('0');
  const hextets = [...left, ...zeros, ...right].slice(0, 4).map((h) => (Number.parseInt(h, 16) || 0).toString(16));
  return `v6:${hextets.join(':')}::/64`;
}

/** Salted ipKey hash for rate limits and the audit log (16 hex chars). A missing salt still hashes (local dev). */
export async function ipHash(ip: string, salt: string | undefined): Promise<string> {
  return (await sha256Hex(`${salt ?? ''}|${ipKey(ip)}`)).slice(0, 16);
}

/** Constant-time string equality; false when either side is empty. */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const x = enc.encode(a);
  const y = enc.encode(b);
  // timingSafeEqual needs equal lengths; compare x with itself so a length mismatch costs the same time.
  if (x.byteLength !== y.byteLength) return !crypto.subtle.timingSafeEqual(x, x);
  return crypto.subtle.timingSafeEqual(x, y);
}
