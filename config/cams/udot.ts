// UDOT road cams, spec Appendix A.7 (52 = 49 Cctv + 3 VMS). Data only; config/roads.ts references these ids.
// Array order is the maintenance offline-check order (§5.3: 09Z/10Z/11Z batches of 17/16/16 Cctv ids; VMS not checked).
// Plain <img> only, never crossorigin (malformed CORS headers). ★ = briefing cam (config/roads.ts briefingCams).
// GIF = animated RWIS image, 0.5–1.3 MB, tap-to-load in data saver. Excluded: VMS 100109 (stale since 2024-03-13).
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
  { ...LCC, id: 'udot-164559', name: 'SR-210 @ SR-209 (canyon mouth)', // ★ briefing
    still: { card: `${CCTV}/164559?t={m}`, detail: `${CCTV}/164559?t={m}`, wall: `${CCTV}/164559?t={m}` } },
  { ...LCC, id: 'udot-164806', name: 'SR-210 RWIS @ Powerhouse MP 5.67',
    still: { card: `${CCTV}/164806?t={m}`, detail: `${CCTV}/164806?t={m}`, wall: `${CCTV}/164806?t={m}` } },
  { ...LCC, id: 'udot-164767', name: 'Upper Vault MP 5.96',
    still: { card: `${CCTV}/164767?t={m}`, detail: `${CCTV}/164767?t={m}`, wall: `${CCTV}/164767?t={m}` } },
  { ...LCC, id: 'udot-164768', name: 'Lisa Falls MP 6.5',
    still: { card: `${CCTV}/164768?t={m}`, detail: `${CCTV}/164768?t={m}`, wall: `${CCTV}/164768?t={m}` } },
  { ...LCC, id: 'udot-166033', name: 'Seven Turns MP 7.4', // ★ briefing
    still: { card: `${CCTV}/166033?t={m}`, detail: `${CCTV}/166033?t={m}`, wall: `${CCTV}/166033?t={m}` } },
  { ...LCC, id: 'udot-166000', name: 'Tanners Flat MP 7.94',
    still: { card: `${CCTV}/166000?t={m}`, detail: `${CCTV}/166000?t={m}`, wall: `${CCTV}/166000?t={m}` } },
  { ...LCC, id: 'udot-165999', name: 'White Pine MP 8.7',
    still: { card: `${CCTV}/165999?t={m}`, detail: `${CCTV}/165999?t={m}`, wall: `${CCTV}/165999?t={m}` } },
  { ...LCC, id: 'udot-165998', name: 'White Pine Parking MP 9.2',
    still: { card: `${CCTV}/165998?t={m}`, detail: `${CCTV}/165998?t={m}`, wall: `${CCTV}/165998?t={m}` } },
  { ...LCC, id: 'udot-165174', name: 'Upper White Pine MP 9.7',
    still: { card: `${CCTV}/165174?t={m}`, detail: `${CCTV}/165174?t={m}`, wall: `${CCTV}/165174?t={m}` } },
  { ...LCC, id: 'udot-155967', name: 'Entry 2 (Snowbird)', offlineGated: true,
    still: { card: `${CCTV}/155967?t={m}`, detail: `${CCTV}/155967?t={m}`, wall: `${CCTV}/155967?t={m}` } },
  { ...LCC, id: 'udot-165175', name: 'Alta Bypass MP 10.95',
    still: { card: `${CCTV}/165175?t={m}`, detail: `${CCTV}/165175?t={m}`, wall: `${CCTV}/165175?t={m}` } },
  { ...LCC, id: 'udot-165271', name: 'Alta MP 12.16', // ★ briefing
    still: { card: `${CCTV}/165271?t={m}`, detail: `${CCTV}/165271?t={m}`, wall: `${CCTV}/165271?t={m}` } },
  // 13–19 LCC approach → alta, snowbird (detailOnly)
  { ...LCC, id: 'udot-165574', name: 'Wasatch Blvd @ 7700 S', detailOnly: true,
    still: { card: `${CCTV}/165574?t={m}`, detail: `${CCTV}/165574?t={m}`, wall: `${CCTV}/165574?t={m}` } },
  { ...LCC, id: 'udot-164804', name: 'Wasatch Blvd @ 7800 S/Bengal', detailOnly: true,
    still: { card: `${CCTV}/164804?t={m}`, detail: `${CCTV}/164804?t={m}`, wall: `${CCTV}/164804?t={m}` } },
  { ...LCC, id: 'udot-164835', name: 'Wasatch Blvd @ 8900 S', detailOnly: true,
    still: { card: `${CCTV}/164835?t={m}`, detail: `${CCTV}/164835?t={m}`, wall: `${CCTV}/164835?t={m}` } },
  { ...LCC, id: 'udot-164335', name: '9400 S @ 2000 E', detailOnly: true,
    still: { card: `${CCTV}/164335?t={m}`, detail: `${CCTV}/164335?t={m}`, wall: `${CCTV}/164335?t={m}` } },
  { ...LCC, id: 'udot-164812', name: '9400 S @ 2300 E', detailOnly: true,
    still: { card: `${CCTV}/164812?t={m}`, detail: `${CCTV}/164812?t={m}`, wall: `${CCTV}/164812?t={m}` } },
  { ...LCC, id: 'udot-164567', name: 'SR-209 @ Old Wasatch/9710 S', detailOnly: true,
    still: { card: `${CCTV}/164567?t={m}`, detail: `${CCTV}/164567?t={m}`, wall: `${CCTV}/164567?t={m}` } },
  { ...LCC, id: 'udot-165939', name: 'SR-209 @ Wasatch Blvd/3400 E', detailOnly: true,
    still: { card: `${CCTV}/165939?t={m}`, detail: `${CCTV}/165939?t={m}`, wall: `${CCTV}/165939?t={m}` } },
  // 20–22 LCC VMS → alta, snowbird (animated GIFs; not offline-checked)
  { ...LCC, id: 'udot-vms-100032', name: 'Mouth of LCC', kind: 'udot_vms',
    still: { card: `${GIF}/100032.gif?t={m}`, detail: `${GIF}/100032.gif?t={m}`, wall: `${GIF}/100032.gif?t={m}` } },
  { ...LCC, id: 'udot-vms-100083', name: 'LCC @ 3335 E', kind: 'udot_vms',
    still: { card: `${GIF}/100083.gif?t={m}`, detail: `${GIF}/100083.gif?t={m}`, wall: `${GIF}/100083.gif?t={m}` } },
  { ...LCC, id: 'udot-vms-100219', name: 'Avalanche Warning, Town of Alta', kind: 'udot_vms',
    still: { card: `${GIF}/100219.gif?t={m}`, detail: `${GIF}/100219.gif?t={m}`, wall: `${GIF}/100219.gif?t={m}` } },
  // 23–29 BCC → brighton, solitude
  { ...BCC, id: 'udot-164333', name: 'Wasatch Blvd @ BCC Rd/Fort Union (mouth)', // ★ briefing
    still: { card: `${CCTV}/164333?t={m}`, detail: `${CCTV}/164333?t={m}`, wall: `${CCTV}/164333?t={m}` } },
  { ...BCC, id: 'udot-164416', name: 'Dogwood MP 4.1',
    still: { card: `${CCTV}/164416?t={m}`, detail: `${CCTV}/164416?t={m}`, wall: `${CCTV}/164416?t={m}` } },
  { ...BCC, id: 'udot-164788', name: 'S-Curves MP 6.38',
    still: { card: `${CCTV}/164788?t={m}`, detail: `${CCTV}/164788?t={m}`, wall: `${CCTV}/164788?t={m}` } },
  { ...BCC, id: 'udot-165945', name: 'Cardiff Fork MP 10.74',
    still: { card: `${CCTV}/165945?t={m}`, detail: `${CCTV}/165945?t={m}`, wall: `${CCTV}/165945?t={m}` } },
  { ...BCC, id: 'udot-164818', name: 'Silver Fork MP 12.54', // ★ briefing
    still: { card: `${CCTV}/164818?t={m}`, detail: `${CCTV}/164818?t={m}`, wall: `${CCTV}/164818?t={m}` } },
  { ...BCC, id: 'udot-165123', name: 'Solitude MP 14.53',
    still: { card: `${CCTV}/165123?t={m}`, detail: `${CCTV}/165123?t={m}`, wall: `${CCTV}/165123?t={m}` } },
  { ...BCC, id: 'udot-165825', name: 'Brighton MP 16.07', // ★ briefing; GIF
    still: { card: `${CCTV}/165825?t={m}`, detail: `${CCTV}/165825?t={m}`, wall: `${CCTV}/165825?t={m}` } },
  // 30–35 Parleys → deer-valley
  { ...PARLEYS, id: 'udot-166089', name: 'I-80 EB mouth MP 128.23', // ★ briefing
    still: { card: `${CCTV}/166089?t={m}`, detail: `${CCTV}/166089?t={m}`, wall: `${CCTV}/166089?t={m}` } },
  { ...PARLEYS, id: 'udot-166167', name: 'Chain Up Area East MP 129.5',
    still: { card: `${CCTV}/166167?t={m}`, detail: `${CCTV}/166167?t={m}`, wall: `${CCTV}/166167?t={m}` } },
  { ...PARLEYS, id: 'udot-166150', name: 'East Canyon/SR-65 MP 133.96',
    still: { card: `${CCTV}/166150?t={m}`, detail: `${CCTV}/166150?t={m}`, wall: `${CCTV}/166150?t={m}` } },
  { ...PARLEYS, id: 'udot-165548', name: 'Parleys Summit MP 139.24', // ★ briefing
    still: { card: `${CCTV}/165548?t={m}`, detail: `${CCTV}/165548?t={m}`, wall: `${CCTV}/165548?t={m}` } },
  { ...PARLEYS, id: 'udot-166134', name: 'Jeremy Ranch MP 141.8',
    still: { card: `${CCTV}/166134?t={m}`, detail: `${CCTV}/166134?t={m}`, wall: `${CCTV}/166134?t={m}` } },
  { ...PARLEYS, id: 'udot-166233', name: 'Kimball Jct MP 144.22', // ★ briefing
    still: { card: `${CCTV}/166233?t={m}`, detail: `${CCTV}/166233?t={m}`, wall: `${CCTV}/166233?t={m}` } },
  // 36–45 Park City / DV → deer-valley (corridor parleys)
  { ...PARLEYS, id: 'udot-165044', name: 'SR-224 @ Ute Blvd',
    still: { card: `${CCTV}/165044?t={m}`, detail: `${CCTV}/165044?t={m}`, wall: `${CCTV}/165044?t={m}` } },
  { ...PARLEYS, id: 'udot-164545', name: 'SR-224 @ Olympic Pkwy',
    still: { card: `${CCTV}/164545?t={m}`, detail: `${CCTV}/164545?t={m}`, wall: `${CCTV}/164545?t={m}` } },
  { ...PARLEYS, id: 'udot-164247', name: 'Park Ave @ Holiday Ranch Loop',
    still: { card: `${CCTV}/164247?t={m}`, detail: `${CCTV}/164247?t={m}`, wall: `${CCTV}/164247?t={m}` } },
  { ...PARLEYS, id: 'udot-164303', name: 'Park Ave @ Kearns Blvd',
    still: { card: `${CCTV}/164303?t={m}`, detail: `${CCTV}/164303?t={m}`, wall: `${CCTV}/164303?t={m}` } },
  { ...PARLEYS, id: 'udot-164918', name: 'SR-224/Marsac RWIS @ Ontario Mine', // GIF
    still: { card: `${CCTV}/164918?t={m}`, detail: `${CCTV}/164918?t={m}`, wall: `${CCTV}/164918?t={m}` } },
  { ...PARLEYS, id: 'udot-165212', name: 'US-40 @ Deer Hollow/Mayflower',
    still: { card: `${CCTV}/165212?t={m}`, detail: `${CCTV}/165212?t={m}`, wall: `${CCTV}/165212?t={m}` } },
  { ...PARLEYS, id: 'udot-164385', name: 'Deer Valley Dr @ Swede Alley', offlineGated: true, // displayed 5th when online
    still: { card: `${CCTV}/164385?t={m}`, detail: `${CCTV}/164385?t={m}`, wall: `${CCTV}/164385?t={m}` } },
  { ...PARLEYS, id: 'udot-141123', name: 'Deer Valley Dr @ Bonanza', offlineGated: true,
    still: { card: `${CCTV}/141123?t={m}`, detail: `${CCTV}/141123?t={m}`, wall: `${CCTV}/141123?t={m}` } },
  { ...PARLEYS, id: 'udot-142189', name: 'Deer Valley Dr @ Empire Ave', offlineGated: true,
    still: { card: `${CCTV}/142189?t={m}`, detail: `${CCTV}/142189?t={m}`, wall: `${CCTV}/142189?t={m}` } },
  { ...PARLEYS, id: 'udot-154500', name: 'Canyon Resort Dr/Park West', offlineGated: true,
    still: { card: `${CCTV}/154500?t={m}`, detail: `${CCTV}/154500?t={m}`, wall: `${CCTV}/154500?t={m}` } },
  // 46–52 Snowbasin route → snowbasin
  { ...SNOWBASIN, id: 'udot-165500', name: 'US-89 @ Park Ln Farmington',
    still: { card: `${CCTV}/165500?t={m}`, detail: `${CCTV}/165500?t={m}`, wall: `${CCTV}/165500?t={m}` } },
  { ...SNOWBASIN, id: 'udot-164499', name: 'US-89 @ I-84 South Weber',
    still: { card: `${CCTV}/164499?t={m}`, detail: `${CCTV}/164499?t={m}`, wall: `${CCTV}/164499?t={m}` } },
  { ...SNOWBASIN, id: 'udot-165318', name: 'I-84 EB Weber Canyon mouth MP 88.18', // ★ briefing
    still: { card: `${CCTV}/165318?t={m}`, detail: `${CCTV}/165318?t={m}`, wall: `${CCTV}/165318?t={m}` } },
  { ...SNOWBASIN, id: 'udot-164722', name: 'I-84 WB @ SR-167 MP 92.42',
    still: { card: `${CCTV}/164722?t={m}`, detail: `${CCTV}/164722?t={m}`, wall: `${CCTV}/164722?t={m}` } },
  { ...SNOWBASIN, id: 'udot-164505', name: 'SR-167 Trappers Loop RWIS @ SR-226', // ★ briefing; GIF
    still: { card: `${CCTV}/164505?t={m}`, detail: `${CCTV}/164505?t={m}`, wall: `${CCTV}/164505?t={m}` } },
  { ...SNOWBASIN, id: 'udot-165868', name: 'SR-226 @ Snow Basin MP 0.7', // ★ briefing; GIF
    still: { card: `${CCTV}/165868?t={m}`, detail: `${CCTV}/165868?t={m}`, wall: `${CCTV}/165868?t={m}` } },
  { ...SNOWBASIN, id: 'udot-166007', name: 'SR-39 RWIS @ SR-167, Huntsville', alternate: true, // GIF; shown only while a Snowbasin-route cam is offline
    still: { card: `${CCTV}/166007?t={m}`, detail: `${CCTV}/166007?t={m}`, wall: `${CCTV}/166007?t={m}` } },
] as const satisfies readonly CamDef[];
