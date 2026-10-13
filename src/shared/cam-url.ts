// Cam URL templates (spec §4.3): the ONLY place CamDef placeholders expand. Pure: the caller passes nowMs.
// {m} {m5} {h} {s} are cache-busting time buckets; {id} is the resolved YouTube video ID (§6.1); {hls} the HDRelay
// origin from the daily player config (§6.2); {path} a Prism frame path; {YYYY/MM/DD} the Denver date (Prism MP4).
// A template whose placeholder has no value, or an unknown placeholder, yields null: never a half-built request.
import { localDate } from './time.ts';

/** HDRelay origin used until the player config (`server.hls`) says otherwise (§6.2). */
export const DEFAULT_HLS_ORIGIN = 'https://b15.hdrelay.com';

export interface CamUrlVars {
  id?: string | null; // YouTube video ID
  hls?: string | null; // HDRelay host or origin ('//b15.hdrelay.com', 'https://b15.hdrelay.com/...')
  path?: string | null; // Prism 'YYYY/MM/DD/HH-MM'
}

const PLACEHOLDER_RE = /\{([^{}]+)\}/g;
const VIDEO_ID_RE = /^[A-Za-z0-9_-]{6,20}$/;
const PRISM_PATH_RE = /^\d{4}\/\d{2}\/\d{2}\/\d{2}-\d{2}$/;

/**
 * 'https://b15.hdrelay.com' for any form of an HDRelay host ('//b15.hdrelay.com', 'b15.hdrelay.com',
 * a full playlist URL). Only *.hdrelay.com over https is accepted; anything else is null.
 */
export function hlsOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const withScheme = raw.startsWith('//') ? `https:${raw}` : /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || !/(?:^|\.)hdrelay\.com$/.test(url.hostname)) return null;
  return `https://${url.host}`;
}

function value(name: string, nowMs: number, vars: CamUrlVars): string | null {
  switch (name) {
    case 'm':
      return String(Math.floor(nowMs / 60_000));
    case 'm5':
      return String(Math.floor(nowMs / 300_000));
    case 'h':
      return String(Math.floor(nowMs / 3_600_000));
    case 's':
      return String(Math.floor(nowMs / 1000));
    case 'id':
      return vars.id && VIDEO_ID_RE.test(vars.id) ? vars.id : null;
    case 'hls':
      return hlsOrigin(vars.hls);
    case 'path':
      return vars.path && PRISM_PATH_RE.test(vars.path) ? vars.path : null;
    case 'YYYY/MM/DD': {
      const date = localDate(nowMs);
      return date ? date.replaceAll('-', '/') : null;
    }
    default:
      return null;
  }
}

/** Expands every placeholder of a CamDef URL template, or returns null when one cannot be filled. */
export function expandCamUrl(template: string, nowMs: number, vars: CamUrlVars = {}): string | null {
  if (!Number.isFinite(nowMs)) return null;
  let missing = false;
  const out = template.replace(PLACEHOLDER_RE, (_, name: string) => {
    const v = value(name, nowMs, vars);
    if (v === null) missing = true;
    return v ?? '';
  });
  return missing ? null : out;
}

/** True when the template carries a time bucket, so a later nowMs produces a fresh URL. */
export const hasTimeBucket = (template: string): boolean => /\{(?:m|m5|h|s)\}/.test(template);

/**
 * YouTube serves a 120 px grey placeholder when maxresdefault_live does not exist (§4.3 YT convention):
 * the hqdefault_live twin of such a URL, or null when the URL is not a maxres thumbnail.
 */
export function ytHqFallback(url: string): string | null {
  return url.includes('/maxresdefault_live.jpg') ? url.replace('/maxresdefault_live.jpg', '/hqdefault_live.jpg') : null;
}
