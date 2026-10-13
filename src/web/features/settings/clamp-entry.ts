// Typed number fields on the settings page (wall defaults, ski-day percent): the entry is rounded and clamped to the
// field's range, and the section heading flashes what was stored, so a clamp is never silent.

export interface Clamped {
  value: number;
  /** Why `value` differs from the entry: clamped to `min`/`max`, or `kept` the previous value (empty or not a number). */
  note: 'min' | 'max' | 'kept' | null;
}

/** "✓ Saved" (ok) or a ▲ line naming the stored value. */
export interface Flash {
  ok: boolean;
  text: string;
}

/** A whole number from a text entry, clamped to [min, max]; an empty or non-numeric entry keeps `prev`. */
export function clampEntry(raw: string, min: number, max: number, prev: number): Clamped {
  const n = Math.round(Number(raw));
  if (raw.trim() === '' || !Number.isFinite(n)) return { value: prev, note: 'kept' };
  if (n < min) return { value: min, note: 'min' };
  if (n > max) return { value: max, note: 'max' };
  return { value: n, note: null };
}

/** The heading flash for a stored entry; `unit` is appended as given (' s', '%', ''). */
export function savedFlash({ value, note }: Clamped, unit: string): Flash {
  if (note === null) return { ok: true, text: 'Saved' };
  if (note === 'kept') return { ok: false, text: `Kept ${value}${unit}` };
  return { ok: false, text: `Saved: ${value}${unit} (${note})` };
}
