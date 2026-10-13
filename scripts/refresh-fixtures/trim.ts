// Per-folder trims for payloads over 30 KB: keep the fields each parse() reads, drop rows it never looks at, cap
// long arrays. Folders not listed are written as fetched. Trims get a private copy, so they may mutate it.
// refresh-fixtures re-parses every written file and reports where its output differs from the full payload's.
import { CORRIDORS } from '../../config/roads.ts';
import { arr, isObj, type Obj, obj } from '../../src/shared/json.ts';
import { TRAFFIC_TERMS } from '../../src/worker/sources/roads/fetch.ts';
import { normRoute } from '../../src/worker/sources/roads/udot-list.ts';
import { altaPage, cleanHtml, each, ends, keep, type Shape, tail } from './shape.ts';
import { trimSnowbasin } from './snowbasin.ts';

const ALTA: Shape = [
  ...['DST', 'seasonal', 'alerts', 'conditions'],
  { operations: ['runs'] },
  {
    liftStatus: [
      {
        lifts: [
          'id',
          'name',
          'open',
          'notes',
          'opening_at',
          'closing_at',
          'updated_at',
          { runs: ['id', 'name', 'groomed'] },
        ],
        accessGates: ['name', 'open', 'scheduled', 'notes', { lifts: ['opening_at', 'closing_at'] }],
        terrainAreas: ['name', 'status', 'notes'],
      },
    ],
  },
];
const ALTA_WEATHER: Shape = [
  'DST',
  'seasonal',
  {
    weather: [
      {
        snowfall: [{ seasons: ['value'], history: ['season', 'reported_at', 'new_snow', 'storm_total', 'ytd_snow'] }],
        observation: [
          { weather: ['dated_at', 'location_id', 'temperature', 'snow', 'wind_speed', 'wind_direction_text'] },
        ],
      },
    ],
  },
];
const BRIGHTON: Shape = [
  ...['name', 'updated', 'comments'],
  { operations: ['resortStatus'], currentConditions: ['resortwide', 'resortLocations'] },
  { facilities: ['parkingLots', 'winterActivities', { areas: [{ area: ['name', 'lifts', 'gates'] }] }] },
];
const PRISM_CAM: Shape = ['id', { cam: ['camStatus'], current: ['imagePath', 'time'], images: ['time', 'path'] }];
const CAM_STATUS: Shape = [
  {
    probes: [
      {
        '*': [
          'status',
          'err',
          'lastModified',
          'etag',
          'location',
          'contentType',
          { body: ['first', 'last', { cams: PRISM_CAM }] },
        ],
      },
    ],
  },
];
const HDRELAY_BODY: Shape = [
  {
    camera: ['id', 'status'],
    server: ['hls'],
    video: ['timeout', 'record'],
    image: ['position', { overlays: ['hotlink'] }],
  },
];
const MTN_LIFT: Shape = ['Id', 'Name', 'MountainAreaName', 'Status', 'StatusEnglish', 'UpdateDate', 'Hours'];
const NWS_FIELDS = ['snowfallAmount', 'quantitativePrecipitation', 'snowLevel', 'windGust', 'windSpeed'];
const NWS_GRID: Shape = [
  {
    properties: [
      'updateTime',
      'validTimes',
      'elevation',
      'gridId',
      'gridX',
      'gridY',
      ...NWS_FIELDS,
      'temperature',
      'probabilityOfPrecipitation',
    ],
  },
];
const NWS_OBS: Shape = [
  { '*': [{ properties: ['stationId', 'timestamp', 'temperature', 'windSpeed', 'windGust', 'windDirection'] }] },
];
const NWS_POINTS: Shape = [
  'id',
  'status',
  'error',
  { body: [{ properties: ['gridId', 'gridX', 'gridY', 'forecastZone', 'county'] }] },
];
const UDOT_PAGE: Shape = [
  'recordsTotal',
  'recordsFiltered',
  {
    data: [
      ...['DT_RowId', 'id', 'name', 'roadway', 'description', 'roadCondition', 'weatherCondition', 'restriction'],
      ...['lastUpdated', 'mountainPassId', 'rwisInfo', 'message', 'message2', 'message3', 'layerName', 'type'],
      ...['roadwayName', 'locationDescription', 'startDate', 'endDate', 'isFullClosure'],
    ],
  },
];
const SENSOR: Shape = ['temperature', 'wind', 'nonstandardizedDataPoints'];
const SNOWBIRD: Shape = [
  ...['report', 'trailsEtag'],
  { lifts: ['name', 'status', 'hours', 'sector', 'updated'], terrains: ['name', 'status'] },
  { sensors: [{ snowbirdBase: SENSOR, snowbirdGad2: SENSOR, snowbirdHiddenPeak15min: SENSOR }] },
  { trails: ['season', 'type', 'include', 'status', 'groom_status'] },
];
const SNOTEL: Shape = ['stationTriplet', { data: [{ stationElement: ['elementCode'] }, 'values'] }];

const defs = Object.values(CORRIDORS);
const ROADWAYS = new Set<unknown>(defs.flatMap((d) => d.roadways));
const PASSES = new Set<unknown>(
  defs.flatMap((d) => d.passes.flatMap((p) => [p.name, p.rowId, String(p.rowId), p.apiId, String(p.apiId)])),
);
const SIGNS = new Set<unknown>(defs.flatMap((d) => [...d.signs.travel, ...d.signs.advisory]));
const ROUTES = new Set<unknown>(TRAFFIC_TERMS.map(normRoute));

/** Keyless list pages with only the rows parse() looks up, and only the fields it reads (null = no call). */
function listRows(pages: unknown, wanted: (row: Obj) => boolean): unknown {
  if (!Array.isArray(pages)) return pages;
  return keep(
    pages.map((p) => (isObj(p) ? { ...p, data: arr(p.data).filter((r) => isObj(r) && wanted(r)) } : p)),
    UDOT_PAGE,
  );
}

export const TRIM: Readonly<Record<string, (raw: unknown) => unknown>> = {
  alta: (raw) => altaPage(raw, (root) => keep(root, ALTA)),
  'alta-weather': (raw) =>
    altaPage(raw, (root) => {
      const sf = obj(obj(root.weather)?.snowfall);
      if (sf) Object.assign(sf, { seasons: arr(sf.seasons).slice(0, 1), history: tail(sf.history, 20) }); // 14 days read
      return keep(root, ALTA_WEATHER);
    }),
  brighton: (raw) => keep(raw, BRIGHTON),
  'cam-status': (raw) => {
    each(obj(obj(obj(obj(raw)?.probes)?.prism)?.body)?.cams, (c) => Object.assign(c, { images: ends(c.images, 2) }));
    return keep(raw, CAM_STATUS); // prism archive first/last come from the oldest and newest images
  },
  'hdrelay-config': (raw) => keep(raw, [{ '*': ['status', 'err', { body: HDRELAY_BODY }] }]),
  mtnpowder: (raw) => {
    const root = obj(raw) ?? {};
    const area = (a: unknown) =>
      keep(
        a,
        obj(a)?.Name === 'Terrain Areas'
          ? ['Name', { Activities: ['Name', 'Status', 'StatusEnglish'] }]
          : ['Name', { Lifts: MTN_LIFT }],
      );
    return {
      ...obj(keep(root, ['Name', 'SnowReport', 'Roads', 'CurrentConditions'])),
      MountainAreas: arr(root.MountainAreas).map(area),
    };
  },
  'nws-grid': (raw) => keep(raw, NWS_GRID),
  'nws-obs': (raw) => keep(raw, NWS_OBS),
  'nws-points': (raw) => keep(raw, NWS_POINTS),
  roads: (raw) => {
    const r = obj(raw);
    if (!r || r.keyed === true) return raw; // keyed api/v2 bodies are not trimmed
    return {
      ...r,
      conditions: listRows(r.conditions, (o) => ROADWAYS.has(o.roadway)),
      passes: listRows(r.passes, (o) => PASSES.has(o.name) || PASSES.has(o.DT_RowId) || PASSES.has(o.mountainPassId)),
      signs: listRows(r.signs, (o) => SIGNS.has(o.DT_RowId)),
      traffic: listRows(r.traffic, (o) => ROUTES.has(normRoute(String(o.roadwayName ?? '')))), // corridor routes
    };
  },
  snotel: (raw) => {
    // SNWD: the last 30 hourly values cover the 16:00 anchor and the 24 h change; WTEQ and TOBS: the latest only.
    const last = (el: Obj) =>
      Object.assign(el, { values: tail(el.values, obj(el.stationElement)?.elementCode === 'SNWD' ? 30 : 1) });
    return keep(
      each(raw, (st) => each(st.data, last)),
      SNOTEL,
    );
  },
  snowbasin: (raw) => trimSnowbasin(cleanHtml(String(raw))),
  snowbird: (raw) => {
    const r = obj(raw);
    const counted = (t: Obj) => t.season === 'winter' && t.type === 'alpine_trail' && t.include === true;
    if (r && Array.isArray(r.trails)) r.trails = r.trails.filter((t) => isObj(t) && counted(t)); // as trailCounts()
    return keep(raw, SNOWBIRD);
  },
};
