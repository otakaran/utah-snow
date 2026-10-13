// GET /api/health[?strict=1] (spec §7, §11). no-store. strict=1 -> 503 when a critical source is red, the last
// cron tick is older than 15 min (or never ran), or any job was flagged cpu-suspect in the last 24 h.
import { CRON_STALE_MIN } from '../../../config/schedule.ts';
import { ageMin, badge, isCritical } from '../../shared/freshness.ts';
import type { Meta } from '../../shared/types.ts';
import { BUILD_ID, json } from '../http.ts';
import { redact } from '../lib/log.ts';
import { sourceOfRow, staleAfterMin } from '../sources/index.ts';
import { readHealthCounters } from '../store/counters.ts';
import { CRON_LAST, cronLastOf, type MetaRow, readMetaRows } from '../store/source-state.ts';

const YT_ANOMALY_UNITS = 1000;
const iso = (ms: number | null) => (ms === null ? null : new Date(ms).toISOString());

function metaOf(r: MetaRow): Meta {
  return {
    source: r.source_id,
    fetchedAt: iso(r.fetched_at),
    okAt: iso(r.ok_at),
    asOf: r.source_as_of,
    status: r.status,
    failCount: r.fail_count,
    staleAfterMin: staleAfterMin(r.source_id),
  };
}

function unmappedCount(payload: string | null | undefined): number {
  if (!payload) return 0;
  try {
    const u = (JSON.parse(payload) as { unmapped?: unknown }).unmapped;
    return Array.isArray(u) ? u.length : 0;
  } catch {
    return 0;
  }
}

export async function health(_req: Request, env: Env, _ctx: ExecutionContext, url: URL): Promise<Response> {
  const now = Date.now();
  const [rows, counters] = await Promise.all([readMetaRows(env.DB), readHealthCounters(env.DB, now)]);
  const cron = cronLastOf(rows);
  const suspects = new Set(counters.cpuSuspects);

  const sources = rows
    .filter((r) => r.source_id !== CRON_LAST)
    .sort((a, b) => (a.source_id < b.source_id ? -1 : 1))
    .map((r) => {
      const meta = metaOf(r);
      const age = ageMin(meta, now);
      const job = sourceOfRow(r.source_id)?.id ?? r.source_id;
      return {
        id: r.source_id,
        status: r.status,
        okAt: meta.okAt,
        ageMin: age === null ? null : Math.round(age),
        staleAfterMin: meta.staleAfterMin,
        failCount: r.fail_count,
        error: r.error ? redact(r.error) : null,
        cpuSuspect: suspects.has(job),
        badge: badge(meta, now),
      };
    });

  const tickAgeMin = cron ? (now - cron.startedAt) / 60_000 : null;
  const failures: string[] = [];
  if (tickAgeMin === null || tickAgeMin > CRON_STALE_MIN) failures.push('cron-stale');
  if (suspects.size) failures.push('cpu-suspect');
  const red = sources.filter((s) => isCritical(s.id) && s.badge === 'red').map((s) => s.id);
  if (red.length) failures.push(`red:${red.join(',')}`);

  const ytKey = (env as { YT_API_KEY?: string }).YT_API_KEY;
  const body = {
    ok: failures.length === 0,
    version: BUILD_ID,
    generatedAt: iso(now),
    failures,
    cron: {
      lastTickAt: cron ? iso(cron.startedAt) : null,
      lastSlot: cron?.slot ?? null,
      jobs: cron?.jobs ?? [],
      deferred: cron?.deferred ?? [],
    },
    sources,
    youtube: {
      mode: ytKey ? 'keyed' : 'keyless',
      unitsToday: counters.ytUnitsToday,
      unmapped: unmappedCount(rows.find((r) => r.source_id === 'yt:state')?.payload),
      anomaly: counters.ytUnitsToday > YT_ANOMALY_UNITS,
    },
    // Filled from the cams:status row once the cam-status adapter lands.
    cams: { total: 0, live: 0, ok: 0, stale: 0, offline: 0 },
    quotas: {
      kvWritesToday: counters.kvWritesToday,
      ytUnitsToday: counters.ytUnitsToday,
      trackerWritesToday: counters.trackerWritesToday,
    },
  };
  const strict = url.searchParams.get('strict') === '1';
  return json(body, { status: strict && !body.ok ? 503 : 200 });
}
