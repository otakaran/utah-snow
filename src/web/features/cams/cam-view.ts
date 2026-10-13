// What a cam tile shows (spec §4.3, §7 /api/cams, §8.3): which cam's still (fallback chains), its URL, the live
// source a tap opens, the status word and the caption age. Inputs are a CamDef plus its /api/cams state, which may
// be missing (still loading or failed): everything then comes from config/cams alone.
import { CAM_BY_ID } from '../../../../config/cams/index.ts';
import { RESORTS } from '../../../../config/resorts.ts';
import { expandCamUrl, hasTimeBucket, hlsOrigin } from '../../../shared/cam-url.ts';
import { isoToMs } from '../../../shared/time.ts';
import type { CamDef } from '../../../shared/types.ts';
import type { CamApiState } from '../../data/cams.ts';
import { ageText } from '../../lib/format.ts';
import { KINDS, ytVideoId } from './kinds/index.ts';

export type Variant = 'card' | 'detail' | 'wall';
export type LiveSource =
  | { type: 'hls'; url: string }
  | { type: 'youtube'; videoId: string }
  | { type: 'iframe'; url: string };
export type TileStatus = 'live' | 'ok' | 'stale' | 'offline' | 'unknown' | 'off';
type States = ReadonlyMap<string, CamApiState>;

export { CAM_BY_ID };

const DOWN: ReadonlySet<CamApiState['status']> = new Set(['stale', 'offline', 'seasonal-off']);

/** The state says this cam has no usable picture or stream right now. */
export const isDown = (state: CamApiState | undefined): boolean =>
  state !== undefined && (DOWN.has(state.status) || state.online === false);

/** The still template for a variant: the API's when it is still a template (it knows maxres vs hq), else config's. */
function stillTemplate(def: CamDef, state: CamApiState | undefined, variant: Variant): string {
  const api = state?.still?.[variant];
  return api && hasTimeBucket(api) ? api : def.still[variant];
}

/** The still URL at nowMs, or null when a placeholder cannot be filled (a YouTube cam with no known ID). */
export function stillUrl(def: CamDef, state: CamApiState | undefined, variant: Variant, nowMs: number): string | null {
  return expandCamUrl(stillTemplate(def, state, variant), nowMs, KINDS[def.kind].vars(def, state));
}

/**
 * The cam whose still a tile shows: itself, or the first healthy cam of its `fallback` chain. When every cam of the
 * chain is down, the first one that still has a picture (shown as stale beats an empty tile).
 */
export function shownCam(def: CamDef, states: States, nowMs: number): CamDef {
  const chain = [def, ...(def.fallback ?? []).flatMap((id) => CAM_BY_ID.get(id) ?? [])];
  const pictured = chain.filter((cam) => stillUrl(cam, states.get(cam.id), 'card', nowMs) !== null);
  return pictured.find((cam) => !isDown(states.get(cam.id))) ?? pictured[0] ?? def;
}

/** What a tap on the cam opens, or null (still-only kind, offline, or no known stream). */
export function liveSource(def: CamDef, state: CamApiState | undefined): LiveSource | null {
  const player = KINDS[def.kind].player;
  if (!player || !def.live || isDown(state)) return null;
  if (state && state.live === null) return null; // the Worker knows there is no stream right now
  if (player === 'youtube') {
    const videoId = ytVideoId(def.id, state);
    return videoId ? { type: 'youtube', videoId } : null;
  }
  const apiUrl = state?.live && 'url' in state.live ? state.live.url : null;
  const url = apiUrl ?? (def.live.url ? expandCamUrl(def.live.url, 0, KINDS[def.kind].vars(def, state)) : null);
  if (!url?.startsWith('https://')) return null;
  if (player === 'iframe') return { type: 'iframe', url };
  return hlsOrigin(url) ? { type: 'hls', url } : null; // HDRelay hosts only (§6.2)
}

/**
 * Tiles hidden outright: UDOT cams on their offline placeholder, hiddenUntilFresh cams until /api/cams calls them
 * fresh, seasonal YouTube slots with no stream.
 */
export function camHidden(def: CamDef, state: CamApiState | undefined): boolean {
  if (def.hiddenUntilFresh) return !(state?.status === 'ok' || state?.status === 'live');
  if (state?.status === 'seasonal-off') return true;
  return (def.kind === 'udot' || def.kind === 'udot_vms') && state?.online === false;
}

/** The status word for the chip; 'ok' shows no chip. A failed refresh turns ok into stale. */
export function tileStatus(state: CamApiState | undefined, failed: boolean): TileStatus | null {
  if (!state) return failed ? 'stale' : null;
  if (state.online === false || state.status === 'offline') return 'offline';
  if (state.status === 'seasonal-off') return 'off';
  if (state.status === 'stale' || failed) return 'stale';
  return state.status;
}

/** Caption age: from cams:status asOf, else an upper bound from the load time plus the provider's cadence. */
export function ageLabel(
  def: CamDef,
  state: CamApiState | undefined,
  url: string | null,
  loadedAt: number | null,
  nowMs: number,
): string {
  const asOf = isoToMs(state?.asOf);
  if (asOf !== null) return ageText((nowMs - asOf) / 60_000);
  if (loadedAt === null) return 'loading…';
  const cadence = KINDS[def.kind].cadenceMin(def, url ?? '');
  const min = (nowMs - loadedAt) / 60_000 + cadence;
  return cadence > 0 ? `≤ ${ageText(Math.max(1, min))}` : ageText(min);
}

/** 'Alta' for resort cams, null for road cams (their names already say where they are). */
export const resortName = (def: CamDef): string | null => (def.resort ? RESORTS[def.resort].name : null);
