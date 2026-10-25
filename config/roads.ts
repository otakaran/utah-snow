// Road corridors (spec §4.5, Appendix A.7 and C.10). Cam ids are CamDef ids in config/cams/udot.ts.
import type { Corridor, ResortId } from '../src/shared/types.ts';

export interface MountainPass {
  name: string; // matched on `name`
  rowId: number; // keyless list DT_RowId
  apiId: number; // keyed API MountainPassId
}
export interface CorridorDef {
  label: string;
  wpSite: string; // UDOT WordPress site with the canyon posts
  postRe: RegExp; // run on UPPERCASED post text
  roadways: readonly string[]; // UDOT RoadConditions `roadway`
  passes: readonly MountainPass[]; // first = the RoadStatus.pass
  signs: { travel: readonly string[]; advisory: readonly string[] }; // keyless DT_RowIds
  vmsCams?: readonly string[];
  crossChecks: readonly string[]; // resort feeds that hint at road state (parsed in the resort adapters)
  briefingCams: readonly [string, string, string];
}

// Bases at or east of this longitude are "Wasatch Back" (routeCorridors and SIGN_RULE).
export const WASATCH_BACK_LON = -111.7;

// SR-190 at or beyond this milepost is Guardsman Pass Rd, closed every winter and never the way to Brighton or
// Solitude (the Brighton RWIS sits at MP 16; UDOT's seasonal gate event is at MP 20). Used by roads/traffic.ts.
export const GUARDSMAN_MP = 17;

export const CORRIDORS = {
  lcc: {
    label: 'Little Cottonwood',
    wpSite: 'https://cottonwoodcanyons.udot.utah.gov',
    postRe: /\bSR[-\s]?210\b|LITTLE COTTONWOOD|\bLCC\b|HIGHWAY 210/,
    roadways: ['SR-210 Mouth of Little Cottonwood to SR-190', 'SR-210 Upper Little Cottonwood Canyon'],
    passes: [{ name: 'SR-210 Little Cottonwood Canyon', rowId: 13, apiId: 98 }],
    signs: { travel: ['6019', '6040'], advisory: ['3687', '3688', '3707'] },
    vmsCams: ['udot-vms-100032', 'udot-vms-100083', 'udot-vms-100219'],
    crossChecks: ['alta alerts[type=road-status]', "snowbird roads 'Highway SR-210'", 'snowbird alerts'],
    briefingCams: ['udot-171387', 'udot-171450', 'udot-172445'],
  },
  bcc: {
    label: 'Big Cottonwood',
    wpSite: 'https://cottonwoodcanyons.udot.utah.gov',
    postRe: /\bSR[-\s]?190\b|BIG COTTONWOOD|\bBCC\b/, // Guardsman-only sentences: §5.6
    roadways: ['SR-190 Big Cottonwood Canyon Mouth to Spruces', 'SR-190 Spruces and above'],
    passes: [{ name: 'SR-190 Big Cottonwood Canyon', rowId: 12, apiId: 97 }],
    signs: { travel: ['6019', '6040'], advisory: ['2440'] },
    crossChecks: ['brighton /api/reportpal-roads', "brighton comments 'Road'"],
    briefingCams: ['udot-171933', 'udot-172047', 'udot-171751'],
  },
  parleys: {
    label: 'Parleys / Park City',
    wpSite: 'https://wasatchback.udot.utah.gov',
    postRe: /I-?80|PARLEY|SR-?224|KIMBALL|US-?40|SR-?248|DEER VALLEY/,
    roadways: ['I-80 Parleys Canyon', 'I-80 Parleys Summit', 'SR-224 Kimball Jct to Park City'],
    passes: [{ name: 'I-80 Parleys Summit', rowId: 9, apiId: 94 }],
    signs: { travel: ['6014', '6036', '6075', '5991', '6032'], advisory: ['3395', '3685'] }, // 6032 = return trip
    crossChecks: ['MtnPowder 49 Roads[] (ChainsRequired)'],
    briefingCams: ['udot-171244', 'udot-170903', 'udot-170495'],
  },
  snowbasin: {
    label: 'Snowbasin route',
    wpSite: 'https://ogdenvalley.udot.utah.gov',
    postRe: /I-?84|WEBER|SR-?167|TRAPPERS|SR-?226|SNOWBASIN|SR-?39|US-?89/,
    roadways: [
      'I-84 Uintah Jct to Jct SR-167 at Mountain Green',
      'SR-167 Trappers Loop I-84 to Huntsville',
      'SR-226 to Snowbasin',
    ],
    passes: [
      { name: 'SR-226 Snowbasin', rowId: 8, apiId: 93 },
      { name: 'SR-167 Trappers Loop Summit', rowId: 71, apiId: 156 },
    ],
    signs: { travel: ['6060', '6120'], advisory: ['6125', '6093'] },
    crossChecks: [],
    briefingCams: ['udot-171492', 'udot-172087', 'udot-172091'],
  },
} as const satisfies Record<Corridor, CorridorDef>;

// Keyed API Ids for the keyless sign DT_RowIds, where known (C.10).
export const SIGN_KEYED_IDS = {
  '6019': 'ADX--73247',
  '6040': 'ADX--73246',
  '6014': 'ADX--71918',
  '2440': 'ADX--71712',
  '3687': 'ADX--71972',
  '3688': 'ADX--71974',
  '3707': 'ADX--73248',
} as const satisfies Record<string, string>;

// Targeted `search.value` queries on the keyless sign list (C.10).
export const SIGN_SEARCH = ['Cottonwood', 'SR-210', 'Parley'] as const;

// Road cams on each resort detail page (§8.7), in display order. Offline-gated (⊘) and alternate (◇) cams stay
// listed; their CamDef flags hide them.
const LCC_CAMS = [
  // LCC canyon 1-12
  'udot-171387',
  'udot-170639',
  'udot-170448',
  'udot-170487',
  'udot-171450',
  'udot-172050',
  'udot-171134',
  'udot-172125',
  'udot-170600',
  'udot-170413',
  'udot-171137',
  'udot-172445',
  // LCC approach 13-19
  'udot-170476',
  'udot-171139',
  'udot-172145',
  'udot-171415',
  'udot-172123',
  'udot-171185',
  'udot-171613',
  // LCC VMS GIFs 20-22
  'udot-vms-100032',
  'udot-vms-100083',
  'udot-vms-100219',
] as const;
const BCC_CAMS = [
  'udot-171933',
  'udot-170563',
  'udot-171447',
  'udot-170564',
  'udot-172047',
  'udot-171063',
  'udot-171751',
] as const;

export const RESORT_ROAD_CAMS = {
  alta: LCC_CAMS,
  snowbird: LCC_CAMS,
  brighton: BCC_CAMS,
  solitude: BCC_CAMS,
  'deer-valley': [
    // Parleys 30-35
    'udot-171244',
    'udot-171313',
    'udot-171325',
    'udot-170903',
    'udot-170838',
    'udot-170495',
    // Park City / DV 36-45; 172120 (Swede Alley) is displayed 5th of this group when online
    'udot-171570',
    'udot-172000',
    'udot-170644',
    'udot-170603',
    'udot-172120',
    'udot-171707',
    'udot-171731',
    'udot-170536',
    'udot-172460',
    'udot-171179',
  ],
  snowbasin: [
    'udot-170709',
    'udot-172440',
    'udot-171492',
    'udot-172128',
    'udot-172087',
    'udot-172091',
    'udot-171884', // alternate: shown only while a Snowbasin-route cam is offline
  ],
} as const satisfies Record<ResortId, readonly string[]>;
