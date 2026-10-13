// HDRelay player GUIDs of config/cams/ (Snowbird + Snowbasin) that manage.hdrelay.com answers 404 ('player not
// found'): the cam is gone and its replacement GUID is in the Snowbird/Snowbasin sections of the same report.
import { CAMS } from '../../config/cams/index.ts';
import type { CamDef } from '../../src/shared/types.ts';
import { newSite, type SiteResult } from './diff.ts';
import { get } from './http.ts';

const PLAYER_URL = 'https://manage.hdrelay.com/player/';

export async function checkHdrelay(): Promise<SiteResult> {
  const r = newSite('HDRelay players', PLAYER_URL);
  const players = (CAMS as readonly CamDef[]).flatMap((c) =>
    c.live?.playerGuid ? [{ id: c.id, guid: c.live.playerGuid }] : [],
  );
  const got = await Promise.all(players.map((p) => get(`${PLAYER_URL}${p.guid}`, { accept: 'application/json' })));
  const failed: string[] = [];
  players.forEach((p, i) => {
    const g = got[i];
    if (!g || g.ok) return;
    if (g.status === 404) r.problems.push(`${p.id}: player ${p.guid} returns 404 (player not found)`);
    else failed.push(`${p.id} (${g.reason})`);
  });
  if (failed.length === players.length) r.unreachable = `every player config failed, e.g. ${failed[0]}`;
  else if (failed.length > 0) r.notes.push(`not checked: ${failed.join(', ')}`);
  else if (r.problems.length === 0) r.notes.push(`all ${players.length} player GUIDs answer 200`);
  return r;
}
