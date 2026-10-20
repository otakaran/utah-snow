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
    briefingCams: ['udot-167778', 'udot-166033', 'udot-165271'],
  },
  bcc: {
    label: 'Big Cottonwood',
    wpSite: 'https://cottonwoodcanyons.udot.utah.gov',
    postRe: /\bSR[-\s]?190\b|BIG COTTONWOOD|\bBCC\b/, // Guardsman-only sentences: §5.6
    roadways: ['SR-190 Big Cottonwood Canyon Mouth to Spruces', 'SR-190 Spruces and above'],
    passes: [{ name: 'SR-190 Big Cottonwood Canyon', rowId: 12, apiId: 97 }],
    signs: { travel: ['6019', '6040'], advisory: ['2440'] },
    crossChecks: ['brighton /api/reportpal-roads', "brighton comments 'Road'"],
    briefingCams: ['udot-167802', 'udot-164818', 'udot-167944'],
  },
  parleys: {
    label: 'Parleys / Park City',
    wpSite: 'https://wasatchback.udot.utah.gov',
    postRe: /I-?80|PARLEY|SR-?224|KIMBALL|US-?40|SR-?248|DEER VALLEY/,
    roadways: ['I-80 Parleys Canyon', 'I-80 Parleys Summit', 'SR-224 Kimball Jct to Park City'],
    passes: [{ name: 'I-80 Parleys Summit', rowId: 9, apiId: 94 }],
    signs: { travel: ['6014', '6036', '6075', '5991', '6032'], advisory: ['3395', '3685'] }, // 6032 = return trip
    crossChecks: ['MtnPowder 49 Roads[] (ChainsRequired)'],
    briefingCams: ['udot-166089', 'udot-165548', 'udot-166233'],
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
    briefingCams: ['udot-165318', 'udot-164505', 'udot-165868'],
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
  'udot-167778',
  'udot-164806',
  'udot-164767',
  'udot-164768',
  'udot-166033',
  'udot-166000',
  'udot-165999',
  'udot-165998',
  'udot-165174',
  'udot-155967',
  'udot-165175',
  'udot-165271',
  // LCC approach 13-19
  'udot-165574',
  'udot-164804',
  'udot-164835',
  'udot-164335',
  'udot-164812',
  'udot-167426',
  'udot-165939',
  // LCC VMS GIFs 20-22
  'udot-vms-100032',
  'udot-vms-100083',
  'udot-vms-100219',
] as const;
const BCC_CAMS = [
  'udot-167802',
  'udot-167437',
  'udot-164788',
  'udot-165945',
  'udot-164818',
  'udot-165123',
  'udot-167944',
] as const;

export const RESORT_ROAD_CAMS = {
  alta: LCC_CAMS,
  snowbird: LCC_CAMS,
  brighton: BCC_CAMS,
  solitude: BCC_CAMS,
  'deer-valley': [
    // Parleys 30-35
    'udot-166089',
    'udot-166167',
    'udot-166150',
    'udot-165548',
    'udot-166134',
    'udot-166233',
    // Park City / DV 36-45; 164385 (Swede Alley) is displayed 5th of this group when online
    'udot-165044',
    'udot-164545',
    'udot-164247',
    'udot-164303',
    'udot-164385',
    'udot-164918',
    'udot-165212',
    'udot-141123',
    'udot-142189',
    'udot-154500',
  ],
  snowbasin: [
    'udot-165500',
    'udot-164499',
    'udot-165318',
    'udot-164722',
    'udot-164505',
    'udot-165868',
    'udot-166007', // alternate: shown only while a Snowbasin-route cam is offline
  ],
} as const satisfies Record<ResortId, readonly string[]>;
