// Hash routes (spec §8.1). `route` is a signal; app.tsx `Outlet` maps each route to its view.
// Unknown paths and unknown resort ids redirect to '#/'. This module stays pure (no feature imports), so features
// may import `route` and the href helpers without an import cycle.
// Views are wired in app.tsx `Outlet` (briefing, resort, cams, tracker, settings, wall).
import { signal } from '@preact/signals';
import { RESORT_IDS } from '../../config/resorts.ts';
import { WALL_LIMITS, WALL_SETS, type WallSet } from '../../config/wall.ts';
import type { ResortId } from '../shared/types.ts';

export { WALL_SETS, type WallSet };

export interface WallParams {
  rotate: number; // seconds per page
  yt: number; // seconds a YouTube player may run
  set: WallSet;
  hls: number; // max concurrent HLS players (0 = stills only)
  wx: number; // cam pages between full-screen weather pages (0 = never)
}

export type Route =
  | { name: 'briefing' }
  | { name: 'resort'; id: ResortId }
  | { name: 'cams' }
  | { name: 'wall'; params: WallParams }
  | { name: 'tracker' }
  | { name: 'settings' };

export type RouteName = Route['name'];

export const WALL_DEFAULTS: WallParams = { rotate: 20, yt: 180, set: 'all', hls: 2, wx: 4 };
const BRIEFING: Route = { name: 'briefing' };
const SIMPLE = ['cams', 'tracker', 'settings'] as const;

export const isResortId = (id: string): id is ResortId => (RESORT_IDS as readonly string[]).includes(id);

/** An integer from a URL param or a stored value, clamped to [lo, hi]; otherwise the fallback. */
function intIn(raw: unknown, [lo, hi]: readonly [number, number], fallback: number): number {
  const n = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN;
  return Number.isInteger(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

/**
 * Wall options from any key lookup (URL params or the stored object): numbers clamp to WALL_LIMITS, and invalid
 * fields fall back to `defaults`.
 */
export function wallParams(get: (key: keyof WallParams) => unknown, defaults: WallParams = WALL_DEFAULTS): WallParams {
  const set = get('set');
  return {
    rotate: intIn(get('rotate'), WALL_LIMITS.rotate, defaults.rotate),
    yt: intIn(get('yt'), WALL_LIMITS.yt, defaults.yt),
    set: typeof set === 'string' && (WALL_SETS as readonly string[]).includes(set) ? (set as WallSet) : defaults.set,
    hls: intIn(get('hls'), WALL_LIMITS.hls, defaults.hls),
    wx: intIn(get('wx'), WALL_LIMITS.wx, defaults.wx),
  };
}

/**
 * Parses a location hash ('#/resort/alta', '#/wall?rotate=30'). Null means "redirect to #/".
 * `wallDefaults` fills the wall params the URL leaves out (the stored settings; URL params win).
 */
export function parseHash(hash: string, wallDefaults: WallParams = WALL_DEFAULTS): Route | null {
  const raw = hash.replace(/^#/, '');
  const qi = raw.indexOf('?');
  const path = (qi === -1 ? raw : raw.slice(0, qi)).replace(/\/+$/, '');
  const query = qi === -1 ? '' : raw.slice(qi + 1);
  const parts = path.split('/').filter(Boolean);
  const [head, arg] = parts;
  if (head === undefined) return BRIEFING;
  if (head === 'resort' && parts.length === 2 && arg !== undefined) {
    let id = '';
    try {
      id = decodeURIComponent(arg);
    } catch {
      return null;
    }
    return isResortId(id) ? { name: 'resort', id } : null;
  }
  if (parts.length !== 1) return null;
  if (head === 'wall') {
    const q = new URLSearchParams(query);
    return { name: 'wall', params: wallParams((k) => q.get(k), wallDefaults) };
  }
  const simple = SIMPLE.find((s) => s === head);
  return simple ? { name: simple } : null;
}

export const resortHref = (id: ResortId): string => `#/resort/${id}`;

/** '#/wall?rotate=20&yt=180&set=all&hls=2&wx=4': the settings page's "Open wall" link. */
export function wallHref(p: WallParams): string {
  return `#/wall?rotate=${p.rotate}&yt=${p.yt}&set=${p.set}&hls=${p.hls}&wx=${p.wx}`;
}

export const route = signal<Route>(BRIEFING);

/** Subscribes to hashchange and syncs `route`; call once from main.tsx. */
export function startRouter(wallDefaults: () => WallParams = () => WALL_DEFAULTS): void {
  const sync = () => {
    const next = parseHash(location.hash, wallDefaults());
    if (!next) {
      location.replace('#/'); // fires hashchange, which lands on the briefing
      return;
    }
    const prev = route.peek();
    route.value = next;
    if (prev.name !== next.name || (prev.name === 'resort' && next.name === 'resort' && prev.id !== next.id)) {
      scrollTo(0, 0); // a new page starts at its top; hash routes do not scroll by themselves
    }
  };
  addEventListener('hashchange', sync);
  sync();
}
