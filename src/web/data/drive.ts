// Custom-base drive times (spec §7 GET /api/drive, §8.5). While the base is custom, the store asks the Worker once per
// rounded point and keeps the last complete answer in localStorage `utahsnow.driveCustom` = {key, results,
// computedAt}. Until it arrives, or on 429/5xx, `customDrive` is null and the matrix (src/shared/geo.ts driveMatrix)
// uses the nearest preset's row, labelled "≈ approx". A partial answer is used for this page view only.
import { computed, effect, signal } from '@preact/signals';
import { RESORT_IDS } from '../../../config/resorts.ts';
import { driveKey } from '../../shared/geo.ts';
import type { DriveLeg, ResortId } from '../../shared/types.ts';
import { baseInfo } from './settings.ts';

export interface StoredDrive {
  key: string; // '{lat3},{lon3}'
  results: Partial<Record<ResortId, DriveLeg>>;
  computedAt: string;
}
export type DriveStatus = 'idle' | 'loading' | 'ok' | 'partial' | 'rate-limited' | 'error';

const STORAGE_KEY = 'utahsnow.driveCustom';
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/** Only well-formed legs of known resorts; anything else is dropped. */
function decodeResults(raw: unknown): Partial<Record<ResortId, DriveLeg>> {
  const out: Partial<Record<ResortId, DriveLeg>> = {};
  if (!isObj(raw)) return out;
  for (const r of RESORT_IDS) {
    const v = raw[r];
    if (!isObj(v) || !isNum(v.min) || !isNum(v.mi)) continue;
    const leg: DriveLeg = { min: v.min, mi: v.mi };
    if (v.via === 'bcc-mouth') leg.via = 'bcc-mouth';
    if (typeof v.warning === 'string') leg.warning = v.warning;
    out[r] = leg;
  }
  return out;
}

/** The stored `key`, or the key of an API answer's `origin`; '' when neither is there. */
function keyOf(raw: Record<string, unknown>): string {
  if (typeof raw.key === 'string') return raw.key;
  const o = raw.origin;
  return isObj(o) && typeof o.lat === 'number' && typeof o.lon === 'number' ? driveKey({ lat: o.lat, lon: o.lon }) : '';
}

/**
 * A stored value or a GET /api/drive body as {key, results, computedAt}; null when malformed, without a single
 * usable leg, or (with `key`) for another point.
 */
export function decodeDrive(raw: unknown, key?: string): StoredDrive | null {
  if (!isObj(raw) || typeof raw.computedAt !== 'string') return null;
  const k = keyOf(raw);
  const results = decodeResults(raw.results);
  if (!k || (key !== undefined && k !== key) || Object.keys(results).length === 0) return null;
  return { key: k, results, computedAt: raw.computedAt };
}

function loadStored(): StoredDrive | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === null ? null : decodeDrive(JSON.parse(raw));
  } catch {
    return null;
  }
}

const stored = signal<StoredDrive | null>(loadStored());
export const driveStatus = signal<DriveStatus>('idle');

/** /api/drive results for the active custom base, or null (a preset base, pending or failed). */
export const customDrive = computed<StoredDrive | null>(() => {
  const b = baseInfo.value;
  const s = stored.value;
  return b.id === 'custom' && s?.key === driveKey(b) ? s : null;
});

const tried = new Set<string>(); // one request per point per page view (the server caches; misses are rate-limited)

async function load(key: string, lat: number, lon: number): Promise<void> {
  if (tried.has(key)) return;
  tried.add(key);
  driveStatus.value = 'loading';
  try {
    const res = await fetch(`/api/drive?lat=${lat}&lon=${lon}`);
    if (res.status === 429) {
      void res.body?.cancel();
      driveStatus.value = 'rate-limited';
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: unknown = await res.json();
    const value = decodeDrive(body, key);
    if (!value) throw new Error('unexpected payload');
    const partial = isObj(body) && body.partial === true;
    stored.value = value;
    driveStatus.value = partial ? 'partial' : 'ok';
    if (partial) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Storage unavailable: the answer lasts for this page view.
    }
  } catch {
    driveStatus.value = 'error';
  }
}

// Fetch when the base becomes a custom point without stored results (browser only; tests import the helpers).
if (typeof document !== 'undefined') {
  effect(() => {
    const b = baseInfo.value;
    if (b.id !== 'custom') return;
    const key = driveKey(b);
    if (stored.peek()?.key === key) driveStatus.value = 'ok';
    else void load(key, b.lat, b.lon);
  });
}
