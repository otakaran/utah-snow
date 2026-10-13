// Data saver switch (spec §8.3). The preference ('auto' | 'on' | 'off') is the settings store's `dataSaver`;
// 'auto' turns it on when the browser asks to save data or the connection is 2g/3g. While on: no auto-refresh of cam
// stills except the stake row, no live video unless tapped, the smallest still variant, heavy GIFs wait for a tap,
// and (Phase 2) the scrubber steps every 15 min.
import { computed, signal } from '@preact/signals';
import { dataSaver } from '../data/settings.ts';

const SLOW: ReadonlySet<string> = new Set(['slow-2g', '2g', '3g']);

interface ConnectionInfo extends EventTarget {
  saveData?: boolean;
  effectiveType?: string;
}

function connection(): ConnectionInfo | undefined {
  return typeof navigator === 'undefined'
    ? undefined
    : (navigator as Navigator & { connection?: ConnectionInfo }).connection;
}

function connectionWantsSaver(): boolean {
  const c = connection();
  return Boolean(c?.saveData) || SLOW.has(c?.effectiveType ?? '');
}

const autoSaver = signal(connectionWantsSaver());
connection()?.addEventListener('change', () => {
  autoSaver.value = connectionWantsSaver();
});

/** The effective switch every cam view reads. */
export const dataSaverOn = computed(() => (dataSaver.value === 'auto' ? autoSaver.value : dataSaver.value === 'on'));
