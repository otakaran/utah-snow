// The settings Section sub that confirms a typed save for 2 s: "✓ Saved" (ok) or "▲ Saved: 5 s (min)" (clamped).
// It always renders the role=status span, so screen readers hear each new message.
import { useEffect, useState } from 'preact/hooks';
import type { Flash } from './clamp-entry.ts';

const SHOW_MS = 2000;

/** The current flash (null when idle) and a setter that restarts the 2 s timer. */
export function useFlash(): [Flash | null, (f: Flash) => void] {
  const [flash, setFlash] = useState<Flash | null>(null);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(null), SHOW_MS);
    return () => clearTimeout(t);
  }, [flash]);
  return [flash, (f) => setFlash({ ...f })];
}

export function FlashNote({ flash }: { flash: Flash | null }) {
  return (
    <span class={`flash${flash ? (flash.ok ? ' flash-ok' : ' flash-warn') : ''}`} role="status">
      {flash ? `${flash.ok ? '✓' : '▲'} ${flash.text}` : null}
    </span>
  );
}
