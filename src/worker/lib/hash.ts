// Hashing and constant-time comparison (Web Crypto only).

const enc = new TextEncoder();

/** Hex SHA-256 of a UTF-8 string. */
export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Salted IP hash for rate limits and the audit log (16 hex chars). A missing salt still hashes (local dev). */
export async function ipHash(ip: string, salt: string | undefined): Promise<string> {
  return (await sha256Hex(`${salt ?? ''}|${ip}`)).slice(0, 16);
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
