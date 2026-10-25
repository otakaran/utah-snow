// UDOT road cams, spec Appendix A.7 (52 = 49 Cctv + 3 VMS). Data only; config/roads.ts references these ids.
// Array order is the maintenance offline-check order (§5.3: 09Z/10Z/11Z batches of 17/16/16 Cctv ids; VMS not checked).
// Plain <img> only, never crossorigin (malformed CORS headers). ★ = briefing cam (config/roads.ts briefingCams).
// GIF = animated RWIS image, 0.5–1.3 MB, tap-to-load in data saver. Excluded: VMS 100109 (stale since 2024-03-13).
// UDOT re-issues every Cctv id now and then (all 49 on 2026-10-21; old ids keep serving the same image for weeks):
// `pnpm drift` flags it; remap by byte-identical images against /List/GetData/Cameras (see the 2026-10-25 commit).
import type { CamDef } from '../../src/shared/types.ts';

const CCTV = 'https://www.udottraffic.utah.gov/map/Cctv';
const GIF = 'https://www.udottraffic.utah.gov/AnimatedGifs';
const BASE = {
  resort: null,
  kind: 'udot',
  pageUrl: 'https://www.udottraffic.utah.gov/',
  refreshS: 60,
  isStake: false,
  hero: false,
  timelapse: { provider: 'none' },
  credit: 'UDOT',
} as const;
const LCC = { ...BASE, corridor: 'lcc' } as const;
const BCC = { ...BASE, corridor: 'bcc' } as const;
const PARLEYS = { ...BASE, corridor: 'parleys' } as const;
const SNOWBASIN = { ...BASE, corridor: 'snowbasin' } as const;

// biome-ignore format: dense registry, one cam per 2 lines
export const UDOT_CAMS = [
  // 1–12 LCC → alta, snowbird
  { ...LCC, id: 'udot-171387', name: 'SR-210 @ SR-209 (canyon mouth)', // ★ briefing
    still: { card: `${CCTV}/171387?t={m}`, detail: `${CCTV}/171387?t={m}`, wall: `${CCTV}/171387?t={m}` } },
  { ...LCC, id: 'udot-170639', name: 'SR-210 RWIS @ Powerhouse MP 5.67',
    still: { card: `${CCTV}/170639?t={m}`, detail: `${CCTV}/170639?t={m}`, wall: `${CCTV}/170639?t={m}` } },
  { ...LCC, id: 'udot-170448', name: 'Upper Vault MP 5.96',
    still: { card: `${CCTV}/170448?t={m}`, detail: `${CCTV}/170448?t={m}`, wall: `${CCTV}/170448?t={m}` } },
  { ...LCC, id: 'udot-170487', name: 'Lisa Falls MP 6.5',
    still: { card: `${CCTV}/170487?t={m}`, detail: `${CCTV}/170487?t={m}`, wall: `${CCTV}/170487?t={m}` } },
  { ...LCC, id: 'udot-171450', name: 'Seven Turns MP 7.4', // ★ briefing
    still: { card: `${CCTV}/171450?t={m}`, detail: `${CCTV}/171450?t={m}`, wall: `${CCTV}/171450?t={m}` } },
  { ...LCC, id: 'udot-172050', name: 'Tanners Flat MP 7.94',
    still: { card: `${CCTV}/172050?t={m}`, detail: `${CCTV}/172050?t={m}`, wall: `${CCTV}/172050?t={m}` } },
  { ...LCC, id: 'udot-171134', name: 'White Pine MP 8.7',
    still: { card: `${CCTV}/171134?t={m}`, detail: `${CCTV}/171134?t={m}`, wall: `${CCTV}/171134?t={m}` } },
  { ...LCC, id: 'udot-172125', name: 'White Pine Parking MP 9.2',
    still: { card: `${CCTV}/172125?t={m}`, detail: `${CCTV}/172125?t={m}`, wall: `${CCTV}/172125?t={m}` } },
  { ...LCC, id: 'udot-170600', name: 'Upper White Pine MP 9.7',
    still: { card: `${CCTV}/170600?t={m}`, detail: `${CCTV}/170600?t={m}`, wall: `${CCTV}/170600?t={m}` } },
  { ...LCC, id: 'udot-170413', name: 'Entry 2 (Snowbird)', offlineGated: true,
    still: { card: `${CCTV}/170413?t={m}`, detail: `${CCTV}/170413?t={m}`, wall: `${CCTV}/170413?t={m}` } },
  { ...LCC, id: 'udot-171137', name: 'Alta Bypass MP 10.95',
    still: { card: `${CCTV}/171137?t={m}`, detail: `${CCTV}/171137?t={m}`, wall: `${CCTV}/171137?t={m}` } },
  { ...LCC, id: 'udot-172445', name: 'Alta MP 12.16', // ★ briefing
    still: { card: `${CCTV}/172445?t={m}`, detail: `${CCTV}/172445?t={m}`, wall: `${CCTV}/172445?t={m}` } },
  // 13–19 LCC approach → alta, snowbird (detailOnly)
  { ...LCC, id: 'udot-170476', name: 'Wasatch Blvd @ 7700 S', detailOnly: true,
    still: { card: `${CCTV}/170476?t={m}`, detail: `${CCTV}/170476?t={m}`, wall: `${CCTV}/170476?t={m}` } },
  { ...LCC, id: 'udot-171139', name: 'Wasatch Blvd @ 7800 S/Bengal', detailOnly: true,
    still: { card: `${CCTV}/171139?t={m}`, detail: `${CCTV}/171139?t={m}`, wall: `${CCTV}/171139?t={m}` } },
  { ...LCC, id: 'udot-172145', name: 'Wasatch Blvd @ 8900 S', detailOnly: true,
    still: { card: `${CCTV}/172145?t={m}`, detail: `${CCTV}/172145?t={m}`, wall: `${CCTV}/172145?t={m}` } },
  { ...LCC, id: 'udot-171415', name: '9400 S @ 2000 E', detailOnly: true,
    still: { card: `${CCTV}/171415?t={m}`, detail: `${CCTV}/171415?t={m}`, wall: `${CCTV}/171415?t={m}` } },
  { ...LCC, id: 'udot-172123', name: '9400 S @ 2300 E', detailOnly: true,
    still: { card: `${CCTV}/172123?t={m}`, detail: `${CCTV}/172123?t={m}`, wall: `${CCTV}/172123?t={m}` } },
  { ...LCC, id: 'udot-171185', name: 'SR-209 @ Old Wasatch/9710 S', detailOnly: true,
    still: { card: `${CCTV}/171185?t={m}`, detail: `${CCTV}/171185?t={m}`, wall: `${CCTV}/171185?t={m}` } },
  { ...LCC, id: 'udot-171613', name: 'SR-209 @ Wasatch Blvd/3400 E', detailOnly: true,
    still: { card: `${CCTV}/171613?t={m}`, detail: `${CCTV}/171613?t={m}`, wall: `${CCTV}/171613?t={m}` } },
  // 20–22 LCC VMS → alta, snowbird (animated GIFs; not offline-checked)
  { ...LCC, id: 'udot-vms-100032', name: 'Mouth of LCC', kind: 'udot_vms',
    still: { card: `${GIF}/100032.gif?t={m}`, detail: `${GIF}/100032.gif?t={m}`, wall: `${GIF}/100032.gif?t={m}` } },
  { ...LCC, id: 'udot-vms-100083', name: 'LCC @ 3335 E', kind: 'udot_vms',
    still: { card: `${GIF}/100083.gif?t={m}`, detail: `${GIF}/100083.gif?t={m}`, wall: `${GIF}/100083.gif?t={m}` } },
  { ...LCC, id: 'udot-vms-100219', name: 'Avalanche Warning, Town of Alta', kind: 'udot_vms',
    still: { card: `${GIF}/100219.gif?t={m}`, detail: `${GIF}/100219.gif?t={m}`, wall: `${GIF}/100219.gif?t={m}` } },
  // 23–29 BCC → brighton, solitude
  { ...BCC, id: 'udot-171933', name: 'Wasatch Blvd @ BCC Rd/Fort Union (mouth)', // ★ briefing
    still: { card: `${CCTV}/171933?t={m}`, detail: `${CCTV}/171933?t={m}`, wall: `${CCTV}/171933?t={m}` } },
  { ...BCC, id: 'udot-170563', name: 'Dogwood MP 4.1',
    still: { card: `${CCTV}/170563?t={m}`, detail: `${CCTV}/170563?t={m}`, wall: `${CCTV}/170563?t={m}` } },
  { ...BCC, id: 'udot-171447', name: 'S-Curves MP 6.38',
    still: { card: `${CCTV}/171447?t={m}`, detail: `${CCTV}/171447?t={m}`, wall: `${CCTV}/171447?t={m}` } },
  { ...BCC, id: 'udot-170564', name: 'Cardiff Fork MP 10.74',
    still: { card: `${CCTV}/170564?t={m}`, detail: `${CCTV}/170564?t={m}`, wall: `${CCTV}/170564?t={m}` } },
  { ...BCC, id: 'udot-172047', name: 'Silver Fork MP 12.54', // ★ briefing
    still: { card: `${CCTV}/172047?t={m}`, detail: `${CCTV}/172047?t={m}`, wall: `${CCTV}/172047?t={m}` } },
  { ...BCC, id: 'udot-171063', name: 'Solitude MP 14.53',
    still: { card: `${CCTV}/171063?t={m}`, detail: `${CCTV}/171063?t={m}`, wall: `${CCTV}/171063?t={m}` } },
  { ...BCC, id: 'udot-171751', name: 'Brighton MP 16.07', // ★ briefing; GIF
    still: { card: `${CCTV}/171751?t={m}`, detail: `${CCTV}/171751?t={m}`, wall: `${CCTV}/171751?t={m}` } },
  // 30–35 Parleys → deer-valley
  { ...PARLEYS, id: 'udot-171244', name: 'I-80 EB mouth MP 128.23', // ★ briefing
    still: { card: `${CCTV}/171244?t={m}`, detail: `${CCTV}/171244?t={m}`, wall: `${CCTV}/171244?t={m}` } },
  { ...PARLEYS, id: 'udot-171313', name: 'Chain Up Area East MP 129.5',
    still: { card: `${CCTV}/171313?t={m}`, detail: `${CCTV}/171313?t={m}`, wall: `${CCTV}/171313?t={m}` } },
  { ...PARLEYS, id: 'udot-171325', name: 'East Canyon/SR-65 MP 133.96',
    still: { card: `${CCTV}/171325?t={m}`, detail: `${CCTV}/171325?t={m}`, wall: `${CCTV}/171325?t={m}` } },
  { ...PARLEYS, id: 'udot-170903', name: 'Parleys Summit MP 139.24', // ★ briefing
    still: { card: `${CCTV}/170903?t={m}`, detail: `${CCTV}/170903?t={m}`, wall: `${CCTV}/170903?t={m}` } },
  { ...PARLEYS, id: 'udot-170838', name: 'Jeremy Ranch MP 141.8',
    still: { card: `${CCTV}/170838?t={m}`, detail: `${CCTV}/170838?t={m}`, wall: `${CCTV}/170838?t={m}` } },
  { ...PARLEYS, id: 'udot-170495', name: 'Kimball Jct MP 144.22', // ★ briefing
    still: { card: `${CCTV}/170495?t={m}`, detail: `${CCTV}/170495?t={m}`, wall: `${CCTV}/170495?t={m}` } },
  // 36–45 Park City / DV → deer-valley (corridor parleys)
  { ...PARLEYS, id: 'udot-171570', name: 'SR-224 @ Ute Blvd',
    still: { card: `${CCTV}/171570?t={m}`, detail: `${CCTV}/171570?t={m}`, wall: `${CCTV}/171570?t={m}` } },
  { ...PARLEYS, id: 'udot-172000', name: 'SR-224 @ Olympic Pkwy',
    still: { card: `${CCTV}/172000?t={m}`, detail: `${CCTV}/172000?t={m}`, wall: `${CCTV}/172000?t={m}` } },
  { ...PARLEYS, id: 'udot-170644', name: 'Park Ave @ Holiday Ranch Loop',
    still: { card: `${CCTV}/170644?t={m}`, detail: `${CCTV}/170644?t={m}`, wall: `${CCTV}/170644?t={m}` } },
  { ...PARLEYS, id: 'udot-170603', name: 'Park Ave @ Kearns Blvd',
    still: { card: `${CCTV}/170603?t={m}`, detail: `${CCTV}/170603?t={m}`, wall: `${CCTV}/170603?t={m}` } },
  { ...PARLEYS, id: 'udot-171707', name: 'SR-224/Marsac RWIS @ Ontario Mine', // GIF
    still: { card: `${CCTV}/171707?t={m}`, detail: `${CCTV}/171707?t={m}`, wall: `${CCTV}/171707?t={m}` } },
  { ...PARLEYS, id: 'udot-171731', name: 'US-40 @ Deer Hollow/Mayflower',
    still: { card: `${CCTV}/171731?t={m}`, detail: `${CCTV}/171731?t={m}`, wall: `${CCTV}/171731?t={m}` } },
  { ...PARLEYS, id: 'udot-172120', name: 'Deer Valley Dr @ Swede Alley', offlineGated: true, // displayed 5th when online
    still: { card: `${CCTV}/172120?t={m}`, detail: `${CCTV}/172120?t={m}`, wall: `${CCTV}/172120?t={m}` } },
  { ...PARLEYS, id: 'udot-170536', name: 'Deer Valley Dr @ Bonanza', offlineGated: true,
    still: { card: `${CCTV}/170536?t={m}`, detail: `${CCTV}/170536?t={m}`, wall: `${CCTV}/170536?t={m}` } },
  { ...PARLEYS, id: 'udot-172460', name: 'Deer Valley Dr @ Empire Ave', offlineGated: true,
    still: { card: `${CCTV}/172460?t={m}`, detail: `${CCTV}/172460?t={m}`, wall: `${CCTV}/172460?t={m}` } },
  { ...PARLEYS, id: 'udot-171179', name: 'Canyon Resort Dr/Park West', offlineGated: true,
    still: { card: `${CCTV}/171179?t={m}`, detail: `${CCTV}/171179?t={m}`, wall: `${CCTV}/171179?t={m}` } },
  // 46–52 Snowbasin route → snowbasin
  { ...SNOWBASIN, id: 'udot-170709', name: 'US-89 @ Park Ln Farmington',
    still: { card: `${CCTV}/170709?t={m}`, detail: `${CCTV}/170709?t={m}`, wall: `${CCTV}/170709?t={m}` } },
  { ...SNOWBASIN, id: 'udot-172440', name: 'US-89 @ I-84 South Weber',
    still: { card: `${CCTV}/172440?t={m}`, detail: `${CCTV}/172440?t={m}`, wall: `${CCTV}/172440?t={m}` } },
  { ...SNOWBASIN, id: 'udot-171492', name: 'I-84 EB Weber Canyon mouth MP 88.18', // ★ briefing
    still: { card: `${CCTV}/171492?t={m}`, detail: `${CCTV}/171492?t={m}`, wall: `${CCTV}/171492?t={m}` } },
  { ...SNOWBASIN, id: 'udot-172128', name: 'I-84 WB @ SR-167 MP 92.42',
    still: { card: `${CCTV}/172128?t={m}`, detail: `${CCTV}/172128?t={m}`, wall: `${CCTV}/172128?t={m}` } },
  { ...SNOWBASIN, id: 'udot-172087', name: 'SR-167 Trappers Loop RWIS @ SR-226', // ★ briefing; GIF
    still: { card: `${CCTV}/172087?t={m}`, detail: `${CCTV}/172087?t={m}`, wall: `${CCTV}/172087?t={m}` } },
  { ...SNOWBASIN, id: 'udot-172091', name: 'SR-226 @ Snow Basin MP 0.7', // ★ briefing; GIF
    still: { card: `${CCTV}/172091?t={m}`, detail: `${CCTV}/172091?t={m}`, wall: `${CCTV}/172091?t={m}` } },
  { ...SNOWBASIN, id: 'udot-171884', name: 'SR-39 RWIS @ SR-167, Huntsville', alternate: true, // GIF; shown only while a Snowbasin-route cam is offline
    still: { card: `${CCTV}/171884?t={m}`, detail: `${CCTV}/171884?t={m}`, wall: `${CCTV}/171884?t={m}` } },
] as const satisfies readonly CamDef[];
