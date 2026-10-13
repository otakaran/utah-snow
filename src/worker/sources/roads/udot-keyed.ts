// Keyed UDOT developer API (spec §5.4, Appendix B udot-api): api/v2/get/{endpoint}?key=…&format=json, 10 calls/60 s.
// Field names follow the documented schema (research 2026-10-12); no keyed payload has been captured yet, so the
// readers accept number-or-string values. Sign Ids ('ADX--…') map to keyless DT_RowIds via SIGN_KEYED_IDS.
import { SIGN_KEYED_IDS } from '../../../../config/roads.ts';
import { obj } from '../../../shared/json.ts';
import { num, range, text } from '../../../shared/num.ts';
import { isoUtc } from '../../../shared/time.ts';
import { str } from './raw.ts';
import { keyedPages, type SignRow } from './signs.ts';
import { normRoute, type PassRow, type Segment, type TrafficEvent } from './udot-list.ts';

const API = 'https://www.udottraffic.utah.gov/api/v2/get';
export type KeyedEndpoint = 'roadconditions' | 'mountainpasses' | 'messagesigns' | 'event';
export const keyedUrl = (ep: KeyedEndpoint, key: string): string =>
  `${API}/${ep}?key=${encodeURIComponent(key)}&format=json`;

const KEYLESS_SIGN = new Map<string, string>(Object.entries(SIGN_KEYED_IDS).map(([k, v]) => [v, k]));

/** Rows of a keyed body (a non-empty JSON array), else null. */
export function keyedRows(body: unknown): Record<string, unknown>[] | null {
  const list = Array.isArray(body) ? body : null;
  if (!list?.length) return null;
  return list.map(obj).filter((o): o is Record<string, unknown> => o !== null);
}

/** Unix seconds (or ms) -> ISO. */
function unixIso(v: unknown): string | null {
  const n = num(v);
  if (n === null || n <= 0) return null;
  return isoUtc(n > 1e12 ? n : n * 1000);
}
const unixMs = (v: unknown): number | null => {
  const n = num(v);
  return n === null || n <= 0 ? null : n > 1e12 ? n : n * 1000;
};

export const segmentKeyed = (o: Record<string, unknown>): Segment => ({
  name: str(o.RoadwayName),
  roadCondition: str(o.RoadCondition),
  weatherCondition: str(o.WeatherCondition),
  restriction: str(o.Restriction),
  at: unixIso(o.LastUpdated),
});

export function passKeyed(o: Record<string, unknown>): PassRow {
  const name = str(o.Name);
  return {
    name,
    rowId: null,
    apiId: num(o.MountainPassId),
    view: {
      name,
      airF: range(num(o.AirTemperature), -60, 130),
      windMph: range(num(o.WindSpeed), 0, 200),
      gustMph: range(num(o.WindGust), 0, 250),
      surfaceF: range(num(o.SurfaceTemp), -60, 170),
      surface: str(o.SurfaceStatus).trim() || null,
      visMi: range(num(o.Visibility), 0, 100),
    },
  };
}

/** Null for signs whose 'ADX--' Id has no keyless DT_RowId in SIGN_KEYED_IDS (they are skipped in keyed mode). */
export function signKeyed(o: Record<string, unknown>): SignRow | null {
  const id = KEYLESS_SIGN.get(str(o.Id));
  if (!id) return null;
  const msgs = Array.isArray(o.Messages) ? o.Messages.map(str) : [];
  return { id, name: str(o.Name), pages: msgs.flatMap(keyedPages), at: unixIso(o.LastUpdated) };
}

export function eventKeyed(o: Record<string, unknown>): TrafficEvent {
  const type = str(o.EventType);
  return {
    id: `udot-event:${str(o.ID ?? o.Id)}`,
    route: normRoute(str(o.RoadwayName)),
    layer: type === 'roadwork' ? 'Construction' : type,
    full: o.IsFullClosure === true || str(o.IsFullClosure).toLowerCase() === 'true',
    startMs: unixMs(o.StartDate),
    endMs: unixMs(o.PlannedEndDate),
    text: text(`${str(o.Location) ? `${str(o.Location)}: ` : ''}${str(o.Description)}`, 300) ?? '',
  };
}
