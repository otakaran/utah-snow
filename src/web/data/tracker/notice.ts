// The tracker page's inline notice (saved with Undo, cap reached, rate limit, conflict, server warnings) and the
// device's client id. Re-exported through data/tracker.ts; import from there.
import { signal } from '@preact/signals';

export type NoticeTone = 'ok' | 'warn' | 'bad';
export interface Notice {
  id: number;
  tone: NoticeTone;
  text: string;
  /** Audit id the notice's Undo reverts (a saved edit), else absent. */
  undo?: number;
}

const NOTICE_MS = 8_000;
const CLIENT_KEY = 'utahsnow.clientId';

/** The inline message for the last mutation; null when there is none. */
export const trackerNotice = signal<Notice | null>(null);

let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

/** Shows an inline notice; ok and warn clear themselves, bad stays until dismissed or replaced. */
export function notify(tone: NoticeTone, text: string, undo?: number | null): void {
  if (timer) clearTimeout(timer);
  const id = ++seq;
  trackerNotice.value = typeof undo === 'number' ? { id, tone, text, undo } : { id, tone, text };
  timer =
    tone === 'bad'
      ? null
      : setTimeout(() => {
          if (trackerNotice.peek()?.id === id) trackerNotice.value = null;
        }, NOTICE_MS);
}

export function dismissNotice(): void {
  trackerNotice.value = null;
}

let cid: string | null = null;

/** A random 16-hex id per device (spec §8.5 `utahsnow.clientId`), sent with every tracker op. */
export function clientId(): string {
  if (cid) return cid;
  try {
    const stored = localStorage.getItem(CLIENT_KEY);
    if (stored && /^[0-9a-f]{16}$/.test(stored)) {
      cid = stored;
      return stored;
    }
  } catch {
    // no storage: a fresh id per page view
  }
  const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    localStorage.setItem(CLIENT_KEY, id);
  } catch {
    // ignored
  }
  cid = id;
  return id;
}
