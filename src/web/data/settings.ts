// Per-device settings (spec §8.5): typed signals persisted in localStorage under `utahsnow.<key>`.
// Every storage access is wrapped in try/catch and falls back to the default (private mode, quota, no storage).
// Read the exported signals; change them only through the setters, which persist. Other tabs sync via 'storage'.
// Not here: utahsnow.snap (data/snapshot.ts), .om (open-meteo), .driveCustom and .clientId (their own stores).
import { computed, type ReadonlySignal, type Signal, signal } from '@preact/signals';
import { BASES, type BaseId, CUSTOM_BOUNDS, DEFAULT_BASE } from '../../../config/bases.ts';
import { STRATEGY } from '../../../config/strategy.ts';
import { wasatchPoint } from '../../shared/geo.ts';
import { isObj } from '../../shared/json.ts';
import type { Units } from '../../shared/units.ts';
import { WALL_DEFAULTS, type WallParams, wallParams } from '../router.ts';

export type Theme = 'dark' | 'sun' | 'auto';
export type ResolvedTheme = 'dark' | 'sun';
export type DataSaver = 'auto' | 'on' | 'off';
export type PickView = 'crew' | 'me';
export type Ride = 'ski' | 'board';
export interface CustomBase {
  lat: number;
  lon: number;
  label: string;
}
export type Base = { preset: BaseId } | { custom: CustomBase };
export interface CrewToday {
  date: string; // Denver 'YYYY-MM-DD'; any other day means "all active people"
  ids: string[];
}
/** The active base as a point: a preset id or 'custom'. */
export interface BaseInfo extends CustomBase {
  id: BaseId | 'custom';
}

const PREFIX = 'utahsnow.';
const reloaders = new Map<string, () => void>();

/** Stored text as JSON when it parses, else the raw string (tolerates hand-written values like `metric`). */
function parseRaw(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** A signal backed by localStorage. `decode` validates a stored value (undefined = invalid, use the default). */
function persisted<T>(key: string, decode: (raw: unknown) => T | undefined, fallback: T) {
  const full = PREFIX + key;
  const load = (): T => {
    try {
      const raw = localStorage.getItem(full);
      return raw === null ? fallback : (decode(parseRaw(raw)) ?? fallback);
    } catch {
      return fallback;
    }
  };
  const sig: Signal<T> = signal(load());
  reloaders.set(full, () => {
    sig.value = load();
  });
  const set = (value: T): void => {
    sig.value = value;
    try {
      if (value === null) localStorage.removeItem(full);
      else localStorage.setItem(full, JSON.stringify(value));
    } catch {
      // Storage unavailable: the choice lasts for this page view only.
    }
  };
  return [sig as ReadonlySignal<T>, set] as const;
}

const oneOf =
  <T extends string>(values: readonly T[]) =>
  (raw: unknown): T | undefined =>
    values.find((v) => v === raw);

const inRange = (n: unknown, [lo, hi]: readonly [number, number]): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;

/** The trimmed label is 1-30 characters. */
export const labelOk = (label: string): boolean => {
  const n = label.trim().length;
  return n >= CUSTOM_BOUNDS.labelLen[0] && n <= CUSTOM_BOUNDS.labelLen[1];
};

/** A valid custom base (1-30 char label, wasatchPoint: 3 dp inside the bounds, as /api/drive checks), or null. */
export function checkCustomBase(lat: number, lon: number, label: string): CustomBase | null {
  const p = labelOk(label) ? wasatchPoint(lat, lon) : null;
  return p ? { ...p, label: label.trim() } : null;
}

const isBaseId = (id: unknown): id is BaseId => typeof id === 'string' && Object.hasOwn(BASES, id);

function decodeBase(raw: unknown): Base | undefined {
  if (!isObj(raw)) return undefined;
  if (isBaseId(raw.preset)) return { preset: raw.preset };
  const c = raw.custom;
  if (!isObj(c) || typeof c.label !== 'string') return undefined;
  const ok = checkCustomBase(Number(c.lat), Number(c.lon), c.label);
  return ok ? { custom: ok } : undefined;
}

function decodeCrew(raw: unknown): CrewToday | undefined {
  if (!isObj(raw) || typeof raw.date !== 'string' || !Array.isArray(raw.ids)) return undefined;
  return { date: raw.date, ids: raw.ids.filter((id): id is string => typeof id === 'string') };
}

export const [units, setUnits] = persisted<Units>('units', oneOf(['imperial', 'metric']), 'imperial');
export const [theme, setTheme] = persisted<Theme>('theme', oneOf(['dark', 'sun', 'auto']), 'dark');
export const [base, setBase] = persisted<Base>('base', decodeBase, { preset: DEFAULT_BASE });
/** personId; '' = the user skipped the question; null (absent) = ask. */
export const [me, setMe] = persisted<string | null>('me', (raw) => (typeof raw === 'string' ? raw : undefined), null);
/** This device's rider when no tracker person is chosen (a set `me` uses that person's mode instead). */
export const [ride, setRide] = persisted<Ride>('ride', oneOf(['ski', 'board']), 'ski');
export const [pickView, setPickView] = persisted<PickView>('pickView', oneOf(['crew', 'me']), 'crew');
export const [crewToday, setCrewToday] = persisted<CrewToday | null>('crewToday', decodeCrew, null);
export const [dataSaver, setDataSaver] = persisted<DataSaver>('dataSaver', oneOf(['auto', 'on', 'off']), 'auto');
/** Wall defaults; #/wall URL params override them (router.ts). */
export const [wallDefaults, setWallDefaults] = persisted<WallParams>(
  'wall',
  (raw) => (isObj(raw) ? wallParams((k) => raw[k]) : undefined),
  WALL_DEFAULTS,
);
export const [skiFraction, setSkiFraction] = persisted<number>(
  'skiFraction',
  (raw) => (inRange(raw, [0.1, 1]) ? raw : undefined),
  STRATEGY.skiDayFraction,
);
export const [admin, setAdmin] = persisted<boolean>(
  'admin',
  (raw) => (typeof raw === 'boolean' ? raw : undefined),
  false,
);

/** Crew ids chosen for `today` (Denver date), or null = every active person (no choice made today). */
export function crewIdsFor(today: string): string[] | null {
  const c = crewToday.value;
  return c && c.date === today ? c.ids : null;
}

/** The active base as {id, label, lat, lon}. */
export const baseInfo = computed<BaseInfo>(() => {
  const b = base.value;
  if ('custom' in b) return { id: 'custom', ...b.custom };
  const p = BASES[b.preset];
  return { id: b.preset, label: p.label, lat: p.lat, lon: p.lon };
});

// System light/dark preference, live (theme 'auto' maps light to 'sun').
const lightQuery = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: light)') : null;
const prefersLight = signal(lightQuery?.matches ?? false);
lightQuery?.addEventListener('change', (e) => {
  prefersLight.value = e.matches;
});

/** The theme to paint: 'auto' resolved through matchMedia. The wall forces dark on its own (main.tsx). */
export const resolvedTheme = computed<ResolvedTheme>(() => {
  const t = theme.value;
  if (t === 'auto') return prefersLight.value ? 'sun' : 'dark';
  return t;
});

if (typeof addEventListener === 'function') {
  addEventListener('storage', (e) => {
    if (e.key === null) for (const reload of reloaders.values()) reload();
    else reloaders.get(e.key)?.();
  });
}
