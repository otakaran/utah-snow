// Alta stamps are Denver wall time without a zone ('2026-02-12 11:05:05'). They become ISO strings with the Denver
// offset, built from src/shared/time.ts helpers (no Date getters here).
import { denverOffsetMin, localParts, zonedToUtc } from '../../../shared/time.ts';

const STAMP_RE = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?$/;
const pad = (n: number) => String(n).padStart(2, '0');

function offset(min: number): string {
  const abs = Math.abs(min);
  return `${min < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/**
 * 'YYYY-MM-DD HH:MM[:SS]' Denver wall time -> '2026-02-12T11:05:05-07:00', or null. `dst` is window.Alta.DST: when it
 * is a boolean it pins the offset (-06:00 / -07:00, spec §5.5 "+DST flag"); otherwise the offset is computed.
 */
export function stampIso(v: unknown, dst?: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  const m = STAMP_RE.exec(s);
  const ms = m ? zonedToUtc(s) : null;
  if (!m || ms === null) return null;
  const off = typeof dst === 'boolean' ? (dst ? -360 : -420) : denverOffsetMin(ms);
  return `${m[1]}T${m[2]}:${m[3] ?? '00'}${offset(off)}`;
}

/** An instant as Denver wall time with its offset, e.g. '2026-11-20T06:05:00-07:00'. */
export function isoAt(ms: number): string {
  const p = localParts(ms);
  return p ? `${p.date}T${p.hm}:00${offset(denverOffsetMin(ms))}` : '';
}
