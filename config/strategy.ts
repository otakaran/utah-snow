// Pick constants (spec §10.1-10.2, §4.8) and Appendix C.9 exceedance tables. Read by src/shared/pick/.
// Exceedance: P(daily new snow >= ladder[i]) for Dec 27-Jan 31, seasons 2005/06-2025/26, computed 2026-10-12 from
// AWDB DAILY PREC increments x 12 (assumed snow-to-liquid ratio). Stations: RESORTS[id].exceedanceStation.
import type { ResortId } from '../src/shared/types.ts';

export const STRATEGY = {
  skiDayFraction: 0.85, // share of remaining trip days actually skied (utahsnow.skiFraction overrides)
  forecastDiscount: 0.8, // weight on forecast-only overnight snow
  daytimeWeight: 0.5, // NWS snow 08-16 on the target day
  extra24Weight: 0.5, // 24 h snow beyond overnight
  saveBasePen: 2, // in; charged when eff < save-threshold
  useBonus: 2, // in; group with R >= Sx (use-it-or-lose-it)
  driveInPerMin: 1 / 15, // 15 extra minutes ~ 1" ...
  drivePenMax: 3, // ... capped, so drive stays a minor term
  gust: [
    { gteMph: 50, pen: 3 },
    { gteMph: 35, pen: 1 },
  ],
  holdPen: 3, // x hold/(open+hold)
  allHoldExcludeFrom: '09:30',
  avyHighPen: 1, // UAC level >= 4
  eto: { freeBy: '08:30', penBy: '10:00', pen: 2 }, // later or unknown -> exclude
  busPen: 1.5, // required parking not booked -> UTA ski bus (alta, brighton, solitude)
  snowbirdBusy: { pen: 1, minEffIn: 6 }, // Fri-Sun + holidays (§4.7)
  tieEps: 0.5,
  divergenceMin: 2,
  tomorrowFrom: '15:00',
  tiers: { deep: 10, good: 6, soft: 3 },
  ladder: [0, 1, 3, 6, 10, 14], // C.9 points 1.2/3/6/9.6/14.4" used as 1/3/6/10/14
  exceedance: {
    'alta-snowbird': [1, 0.386, 0.269, 0.169, 0.094, 0.033],
    brighton: [1, 0.328, 0.209, 0.122, 0.054, 0.021],
    'deer-valley': [1, 0.324, 0.205, 0.094, 0.044, 0.013],
    snowbasin: [1, 0.357, 0.236, 0.172, 0.119, 0.07], // 332 Ben Lomond Peak, proxy
  },
} as const;

// Solitude is uncapped, so its row is display only (not used by the pick).
export const EXCEEDANCE_DISPLAY = { solitude: [1, 0.34, 0.213, 0.124, 0.045, 0.011] } as const;

// "Save Alta/Snowbird for the deepest days": a tunable design default, not a measured fact. The only copy.
export const POWDER_MULT = {
  alta: 1.15,
  snowbird: 1.15,
  brighton: 1.0,
  solitude: 1.0,
  'deer-valley': 0.85,
  snowbasin: 0.95,
} as const satisfies Record<ResortId, number>;
