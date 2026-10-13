// Hash routes (spec §8.1). `route` is a signal; App renders the matching view.
// Unknown paths and unknown resort ids redirect to '#/'.
import { signal } from '@preact/signals';
import type { ResortId } from '../shared/types.ts';

export type WallSet = 'all' | 'stakes' | 'lcc' | 'bcc' | 'pc' | 'ogden';

export interface WallParams {
  rotate: number; // seconds per page
  yt: number; // seconds a YouTube player may run
  set: WallSet;
  hls: number; // max concurrent HLS players
}

export type Route =
  | { name: 'briefing' }
  | { name: 'resort'; id: ResortId }
  | { name: 'wall'; params: WallParams }
  | { name: 'tracker' }
  | { name: 'settings' };

const RESORT_IDS = [
  'alta',
  'snowbird',
  'brighton',
  'solitude',
  'deer-valley',
  'snowbasin',
] as const satisfies readonly ResortId[];
const WALL_SETS: readonly WallSet[] = ['all', 'stakes', 'lcc', 'bcc', 'pc', 'ogden'];
const WALL_DEFAULTS: WallParams = { rotate: 20, yt: 180, set: 'all', hls: 2 };
const BRIEFING: Route = { name: 'briefing' };

const isResortId = (id: string): id is ResortId => (RESORT_IDS as readonly string[]).includes(id);

function posInt(raw: string | null, fallback: number): number {
  const n = raw === null ? Number.NaN : Number(raw);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

function wallParams(query: string): WallParams {
  const q = new URLSearchParams(query);
  const set = q.get('set') ?? '';
  return {
    rotate: posInt(q.get('rotate'), WALL_DEFAULTS.rotate),
    yt: posInt(q.get('yt'), WALL_DEFAULTS.yt),
    set: (WALL_SETS as readonly string[]).includes(set) ? (set as WallSet) : WALL_DEFAULTS.set,
    hls: posInt(q.get('hls'), WALL_DEFAULTS.hls),
  };
}

/** Parses a location hash ('#/resort/alta', '#/wall?rotate=30'). Null means "redirect to #/". */
export function parseHash(hash: string): Route | null {
  const raw = hash.replace(/^#/, '');
  const qi = raw.indexOf('?');
  const path = (qi === -1 ? raw : raw.slice(0, qi)).replace(/\/+$/, '');
  const query = qi === -1 ? '' : raw.slice(qi + 1);
  const parts = path.split('/').filter(Boolean);
  const [head, arg] = parts;
  if (head === undefined) return BRIEFING;
  if (head === 'resort' && parts.length === 2 && arg !== undefined) {
    const id = decodeURIComponent(arg);
    return isResortId(id) ? { name: 'resort', id } : null;
  }
  if (parts.length !== 1) return null;
  if (head === 'wall') return { name: 'wall', params: wallParams(query) };
  if (head === 'tracker') return { name: 'tracker' };
  if (head === 'settings') return { name: 'settings' };
  return null;
}

export const route = signal<Route>(BRIEFING);

/** Subscribes to hashchange and syncs `route`; call once from main.tsx. */
export function startRouter(): void {
  const sync = () => {
    const next = parseHash(location.hash);
    if (next) route.value = next;
    else location.replace('#/'); // fires hashchange, which lands on the briefing
  };
  addEventListener('hashchange', sync);
  sync();
}
