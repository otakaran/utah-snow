// Custom-base drive times (spec §7 GET /api/drive, §8.5). While the base is custom, the store asks the Worker once per
// rounded point and page view (with `X-Requested-With: utahsnow`; a busy 503 is retried after its Retry-After) and
// keeps the last complete answer in localStorage `utahsnow.driveCustom` = {key, results}. Every answer of this page
// view is remembered, so returning to an earlier point shows its times and status again. Until an answer arrives, or
// on 429/5xx, `customDrive` is null and the matrix (src/shared/geo.ts driveMatrix) uses the nearest preset's row,
// labelled "≈ approx". A partial answer is used for this page view only.
import { computed, effect, signal } from '@preact/signals';
import { RESORT_IDS } from '../../../config/resorts.ts';
import { driveKey } from '../../shared/geo.ts';
import { isObj } from '../../shared/json.ts';
import type { DriveLeg, ResortId } from '../../shared/types.ts';
import { baseInfo } from './settings.ts';

export interface StoredDrive {
  key: string; // '{lat3},{lon3}'
  results: Partial<Record<ResortId, DriveLeg>>;
}
export type DriveStatus = 'idle' | 'loading' | 'ok' | 'partial' | 'rate-limited' | 'error';

interface Outcome {
  status: DriveStatus;
  value?: StoredDrive;
}

const STORAGE_KEY = 'utahsnow.driveCustom';
const BUSY_TRIES = 4; // the Worker routes one point at a time (about 10 s each)
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
 * A stored value or a GET /api/drive body as {key, results}; null when malformed, without a single usable leg, or
 * (with `key`) for another point.
 */
export function decodeDrive(raw: unknown, key?: string): StoredDrive | null {
  if (!isObj(raw)) return null;
  const k = keyOf(raw);
  const results = decodeResults(raw.results);
  if (!k || (key !== undefined && k !== key) || Object.keys(results).length === 0) return null;
  return { key: k, results };
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

const outcomes = new Map<string, Outcome>(); // one request per point per page view (misses are rate-limited)
const wait = (s: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, s * 1000));

async function ask(key: string, lat: number, lon: number): Promise<Outcome> {
  for (let tries = 1; ; tries++) {
    const res = await fetch(`/api/drive?lat=${lat}&lon=${lon}`, { headers: { 'X-Requested-With': 'utahsnow' } });
    if (res.status === 429 || (res.status === 503 && tries < BUSY_TRIES)) {
      void res.body?.cancel();
      if (res.status === 429) return { status: 'rate-limited' };
      await wait(Number(res.headers.get('Retry-After')) || 10);
      continue;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body: unknown = await res.json();
    const value = decodeDrive(body, key);
    if (!value) throw new Error('unexpected payload');
    if (isObj(body) && body.partial === true) return { status: 'partial', value };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Storage unavailable: the answer lasts for this page view.
    }
    return { status: 'ok', value };
  }
}

/** Shows this page view's outcome for `key`. */
function show(key: string): void {
  const o = outcomes.get(key);
  if (o?.value) stored.value = o.value;
  driveStatus.value = o?.status ?? 'idle';
}

/** Matches `stored` / `driveStatus` to the base: the stored or remembered answer for its point, else one request. */
export async function syncDrive(): Promise<void> {
  const b = baseInfo.value;
  if (b.id !== 'custom') return;
  const key = driveKey(b);
  if (outcomes.has(key)) return show(key);
  if (stored.peek()?.key === key) {
    driveStatus.value = 'ok';
    return;
  }
  outcomes.set(key, { status: 'loading' });
  driveStatus.value = 'loading';
  outcomes.set(key, await ask(key, b.lat, b.lon).catch((): Outcome => ({ status: 'error' })));
  const now = baseInfo.peek();
  if (now.id === 'custom' && driveKey(now) === key) show(key); // the user may have moved on meanwhile
}

// Sync whenever the base changes (browser only; tests call syncDrive).
if (typeof document !== 'undefined') {
  effect(() => {
    void syncDrive();
  });
}
