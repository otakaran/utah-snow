// Cron schedule (spec §5.3): data only. The dispatcher (src/worker/cron/dispatcher.ts) reads it every 5 min tick.
// Job ids: 'resort:<id>', 'nws-grid:<resort>:<point>', 'avy', else the adapter file name. A job listed here but not
// registered in src/worker/sources/index.ts is skipped, so slots can name jobs before their adapters exist.

export const BUDGET = 45; // external subrequests per invocation (platform limit 50); redirects and caches.* count
export const INTERNAL_BUDGET = 25; // D1 + KV calls per invocation
export const MAX_CONN = 5; // concurrent outbound fetches; the platform's 6th header-wait slot stays free for KV
export const TICK_DEADLINE_MS = 45_000; // no fetch permit after scheduledTime + this
export const PROBE_TIMEOUT_MS = 6_000; // /api/debug/probe per-host timeout

// Admission order inside a tick. 'nws-grid' matches every 'nws-grid:*' job.
export const PRIORITY = [
  'stake-alta',
  'roads',
  'resort:snowbasin', // slowest upstream, so it starts first
  'resort:alta',
  'resort:snowbird',
  'resort:brighton',
  'resort:solitude',
  'resort:deer-valley',
  'nws-grid',
  'nws-obs',
  'avy',
  'nws-text',
  'youtube',
  'stake-skiutah',
  'snotel',
  'alta-weather',
  'cam-status',
  'maintenance',
] as const;

export interface SlotJobs {
  always: readonly string[];
  morning: readonly string[]; // added when the Denver hour is 04-10
}

// Index = slot = UTC minute / 5. Group A = alta, snowbird, snowbasin; group B = brighton, solitude, deer-valley.
export const SLOTS: readonly SlotJobs[] = [
  {
    always: ['stake-alta', 'stake-skiutah', 'roads', 'nws-grid:alta:base'],
    morning: ['resort:brighton', 'resort:solitude', 'resort:deer-valley'],
  },
  {
    always: ['stake-alta', 'resort:alta', 'resort:snowbird', 'resort:snowbasin', 'nws-grid:alta:summit'],
    morning: [],
  },
  {
    always: [
      'stake-alta',
      'roads',
      'nws-obs',
      'resort:brighton',
      'resort:solitude',
      'resort:deer-valley',
      'nws-grid:snowbird:base',
    ],
    morning: [],
  },
  {
    always: ['stake-alta', 'stake-skiutah', 'youtube', 'avy', 'nws-text', 'nws-grid:snowbird:summit'],
    morning: ['resort:alta', 'resort:snowbird', 'resort:snowbasin'],
  },
  {
    always: ['stake-alta', 'roads', 'nws-grid:brighton:base'],
    morning: ['resort:brighton', 'resort:solitude', 'resort:deer-valley'],
  },
  {
    always: [
      'stake-alta',
      'resort:alta',
      'resort:snowbird',
      'resort:snowbasin',
      'alta-weather',
      'snotel',
      'nws-grid:brighton:summit',
    ],
    morning: [],
  },
  {
    always: [
      'stake-alta',
      'stake-skiutah',
      'roads',
      'resort:brighton',
      'resort:solitude',
      'resort:deer-valley',
      'nws-grid:solitude:base',
    ],
    morning: [],
  },
  {
    always: ['stake-alta', 'youtube', 'nws-grid:solitude:summit'],
    morning: ['resort:alta', 'resort:snowbird', 'resort:snowbasin'],
  },
  {
    always: ['stake-alta', 'roads', 'nws-obs', 'nws-grid:deer-valley:base'],
    morning: ['resort:brighton', 'resort:solitude', 'resort:deer-valley'],
  },
  {
    always: [
      'stake-alta',
      'stake-skiutah',
      'resort:alta',
      'resort:snowbird',
      'resort:snowbasin',
      'nws-text',
      'nws-grid:deer-valley:summit',
    ],
    morning: [],
  },
  {
    always: [
      'stake-alta',
      'roads',
      'resort:brighton',
      'resort:solitude',
      'resort:deer-valley',
      'nws-grid:snowbasin:base',
      'maintenance',
    ],
    morning: [],
  },
  {
    always: ['stake-alta', 'youtube', 'cam-status', 'nws-grid:snowbasin:summit'],
    morning: ['resort:alta', 'resort:snowbird', 'resort:snowbasin'],
  },
];

export const MORNING_HOURS = { from: 4, to: 10 } as const; // Denver local, inclusive

// 'maintenance' runs only in this slot at these UTC hours (08Z prune + HDRelay, 09-11Z UDOT cams),
// plus Mondays at 12Z (NWS /points).
export const MAINT = { slot: 10, utcHours: [8, 9, 10, 11], mondayUtcHour: 12 } as const;

// counters key `cpu-suspect:{job}:{date}` lives this long; /api/health?strict=1 fails on any from the last 24 h.
export const CPU_SUSPECT_TTL_MS = 7 * 86_400_000;
export const CRON_STALE_MIN = 15; // /api/health?strict=1 fails when the last tick is older
