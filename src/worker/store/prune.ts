// D1 prune (spec §5.3, §6.3): once a day at the 08Z maintenance tick (slot 9, :45), the dispatcher appends these
// statements to its tick-start batch, so the prune costs no extra D1 call. KV frames expire by their own TTL.
//   stake_frames > 26 h (the KV TTL), counters past expires_at, drive_cache and histories older than 30 days.
import { DAY } from '../../shared/time.ts';
import { FRAME_TTL_S } from './frames.ts';
import { hourOf } from './history.ts';

const KEEP_MS = 30 * DAY;

export function pruneStmts(db: D1Database, now: number): D1PreparedStatement[] {
  const cutoff = now - KEEP_MS;
  return [
    db.prepare('DELETE FROM stake_frames WHERE t < ?1').bind(now - FRAME_TTL_S * 1000),
    db.prepare('DELETE FROM counters WHERE expires_at <= ?1').bind(now),
    db.prepare('DELETE FROM drive_cache WHERE created_at < ?1').bind(cutoff),
    db.prepare('DELETE FROM resort_history WHERE hour < ?1').bind(hourOf(cutoff)),
    db.prepare('DELETE FROM road_history WHERE at < ?1').bind(cutoff),
  ];
}
