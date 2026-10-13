// D1 `drive_cache` (key '{lat3},{lon3}', payload = the GET /api/drive JSON body, created_at ms; spec §7). Rows older
// than the cache window are ignored here and deleted by the daily prune (store/prune.ts).
import { OSRM } from '../../../config/bases.ts';
import { DAY } from '../../shared/time.ts';

const CACHE_MS = OSRM.cacheDays * DAY;

/** The cached body for `key` when it is younger than 30 days, as stored (no JSON.parse), else null. */
export async function readDrive(db: D1Database, key: string, now: number): Promise<string | null> {
  const row = await db
    .prepare('SELECT payload FROM drive_cache WHERE key = ?1 AND created_at > ?2')
    .bind(key, now - CACHE_MS)
    .first<{ payload: string }>();
  return row?.payload ?? null;
}

/** Stores a complete response body (partial ones are never cached). */
export async function writeDrive(db: D1Database, key: string, payload: string, now: number): Promise<void> {
  await db
    .prepare('INSERT OR REPLACE INTO drive_cache (key, payload, created_at) VALUES (?1, ?2, ?3)')
    .bind(key, payload, now)
    .run();
}
