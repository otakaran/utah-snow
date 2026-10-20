// YouTube channels and ordered title slots (spec §4.4). Slots hold only title-matching data; display flags
// (seasonal, custom thumbnails, hqdefault_live) live on the CamDef in config/cams/.
import type { ResortId } from '../src/shared/types.ts';

export interface YtChannel {
  channelId: string;
  uploads: string; // uploads playlist id
}
export interface YtSlot {
  cam: string; // CamDef id
  re: RegExp; // matched against the video title
  seed?: string; // last known live video id; keyless mode starts from it
  camstreamer?: string; // CamStreamer embed key
  unlisted?: boolean; // findable only through CamStreamer
}
type YtResort = Extract<ResortId, 'brighton' | 'solitude' | 'deer-valley'>;

export const CHANNELS = {
  brighton: { channelId: 'UC3NvXJeIa_dBZ2ygCKrfCCQ', uploads: 'UU3NvXJeIa_dBZ2ygCKrfCCQ' },
  solitude: { channelId: 'UCsG59EVXq_OZatwq299yThg', uploads: 'UUsG59EVXq_OZatwq299yThg' },
  'deer-valley': { channelId: 'UCTqz2P_u5ewpc7ICo9p-TMg', uploads: 'UUTqz2P_u5ewpc7ICo9p-TMg' },
} as const satisfies Record<YtResort, YtChannel>;

// IFrame player error codes a browser reports to POST /api/cams/report (removed, private, not embeddable, ...).
export const YT_REPORT_CODES = [2, 5, 100, 101, 150, 153] as const;

// ORDERED per channel: first regex match wins.
export const SLOTS = {
  brighton: [
    { cam: 'brighton-parking-lot', re: /^parking lot\b/i, seed: '4a-3iEM7bHk' },
    { cam: 'brighton-molly-greens', re: /^molly green/i, seed: 'uZ24vqOWEkQ' },
    { cam: 'brighton-top-of-crest', re: /^top of crest/i, seed: 'Zv8HYwaXjBg' },
    { cam: 'brighton-explorer', re: /^explorer\b/i, seed: 'vMwQRjlfqtA' },
    { cam: 'brighton-milly-express', re: /^milly\b/i, seed: 'N-d3MuOagLg' },
    { cam: 'brighton-great-western', re: /^great western\b/i },
    { cam: 'brighton-majestic', re: /^majestic\b/i },
  ],
  solitude: [
    { cam: 'solitude-snowstake', re: /snow\s*stake/i, seed: 'lkEM6EC8NVA' },
    { cam: 'solitude-powderhorn-ii-lift-line', re: /^powderhorn\s*(ii|2)\b/i, seed: 'yeoBog_kSzc' },
    { cam: 'solitude-powderhorn', re: /^powderhorn\s*$/i, seed: 'xNER0JHrqLg' },
    { cam: 'solitude-honeycomb-return', re: /honeycomb\s*return/i },
    { cam: 'solitude-honeycomb-canyon', re: /honeycomb/i, seed: 'gfHReYIuydU' },
    { cam: 'solitude-moonbeam-parking', re: /moonbeam.*park/i, seed: 'ta-4QZbfMXc' },
    { cam: 'solitude-moonbeam-lift-line', re: /moonbeam/i, seed: 'NSiItCGabfo' },
    { cam: 'solitude-sunshine-bowl', re: /sunshine/i, seed: 'Lnznapxh2xM' },
    { cam: 'solitude-apex-sunrise', re: /apex|sunrise/i, seed: 'l2X9DlRzX54' },
    { cam: 'solitude-link-lift-line', re: /^link\b/i, seed: 'Yx3QmuKfwjY' },
    { cam: 'solitude-eagle-express', re: /eagle/i, seed: 'oWaG8txpW1c' },
    { cam: 'solitude-summit-express', re: /summit/i, seed: 'rUXoOLxKKX4' },
  ],
  'deer-valley': [
    {
      cam: 'deer-valley-ontario-snowstake-live',
      re: /snow\s*stake|ontario/i,
      camstreamer: 'yDfseDxIMslaR2Ae0x4rur2uWvwFjBKNOIZu0CqW',
    },
    {
      cam: 'deer-valley-snow-park',
      re: /snow\s*park/i,
      camstreamer: 'M5ToybhwNTDP6Y5Yt6lIr9hylOONXTv892poZIyH',
      seed: 'QozKoFs-hL0',
    },
    {
      cam: 'deer-valley-silver-lake',
      re: /silver\s*lake/i,
      camstreamer: 'oCzfMDDSJHRGJXfQug4D8FhLpuU7GwaphZjuO00Z',
      seed: 'uE_ent5rC3Y',
    },
    {
      cam: 'deer-valley-empire',
      re: /empire/i,
      camstreamer: '5JJMkCuxzOl52j8pMT9Fc6wNrJkeVLlPl75l2nPD',
      seed: 'r8qiPv9XCOM',
    },
    {
      cam: 'deer-valley-sterling',
      re: /sterling/i,
      camstreamer: '85gYTybAhS5pjj2NpJ6n93R4VQwgn6aLdHWhpFDx',
      seed: 'iNdfTLilLlU',
    },
    {
      cam: 'deer-valley-galena',
      re: /galena/i,
      camstreamer: 'lgOzg0AxWR6BOLOBlZnaN7hhB6RnEOUaaWErbdxH',
      seed: '0shWeR7Fvpg',
    },
    {
      cam: 'deer-valley-revelator',
      re: /revelator/i,
      camstreamer: 'cgVMhgI2Dht1tLyFW28p4r4uoCgka4wGNgL3npJ0',
      seed: 'XZjubaPbamE',
    },
    {
      cam: 'deer-valley-sultan',
      re: /sultan/i,
      camstreamer: 'WHHs0IGromJCpEcQUtsBvCiYCOQfueb4CM5nq6XC',
      seed: 'sAjdqw-lzgI',
      unlisted: true,
    },
    {
      cam: 'deer-valley-hoodoo',
      re: /hoodoo/i,
      camstreamer: 'r5HqNCcbTMOt3gyc1tFVYWWxhLSdTikzwsOxVrRY',
      seed: 'RaX_MhXETq4',
    },
  ],
} as const satisfies Record<YtResort, readonly YtSlot[]>;
