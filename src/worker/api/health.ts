// GET /api/health[?strict=1] (spec §7, §11). no-store. strict=1 -> 503 when a critical source is red, the last
// cron tick is older than 15 min (or never ran), any job was flagged cpu-suspect in the last 24 h, or the weekly
// NWS /points check found a grid or zone change (Appendix C.1).
import { CAMS } from '../../../config/cams/index.ts';
import { CRON_STALE_MIN } from '../../../config/schedule.ts';
import { ageMin, badge, isCritical } from '../../shared/freshness.ts';
import { isBetweenLocal, isoToMs, isoUtc, MIN } from '../../shared/time.ts';
import type { CamDef, CamKind, CamStatusEntry, Meta } from '../../shared/types.ts';
import { BUILD_ID, json } from '../http.ts';
import { redact } from '../lib/log.ts';
import { sourceOfRow, staleAfterMin } from '../sources/index.ts';
import { readHealthCounters } from '../store/counters.ts';
import { CRON_LAST, cronLastOf, type MetaRow, readMetaRows } from '../store/source-state.ts';

const YT_ANOMALY_UNITS = 1000;
const CAM_STALE_MS = 45 * MIN; // §6.4
const KIND = new Map<string, CamKind>((CAMS as readonly CamDef[]).map((c) => [c.id, c.kind]));
const iso = (ms: number | null) => (ms === null ? null : isoUtc(ms));

function payloadOf(rows: readonly MetaRow[], id: string): Record<string, unknown> | null {
  const p = rows.find((r) => r.source_id === id)?.payload;
  if (!p) return null;
  try {
    const v: unknown = JSON.parse(p);
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

type CamBucket = 'live' | 'ok' | 'stale' | 'offline';

/**
 * One cams:status entry (§6.4 and the /api/cams rules): online false -> offline; Ski Utah hiddenUntilFresh -> stale;
 * no asOf (HDRelay live-only snapshot) -> live while online; else asOf <= 45 min -> ok, except Roundshot at night.
 */
function camBucket(id: string, e: Partial<CamStatusEntry>, now: number): CamBucket {
  if (e.online === false) return 'offline';
  if (e.hidden === true) return 'stale';
  if (!e.asOf) return e.online === true ? 'live' : 'stale';
  const ms = isoToMs(e.asOf);
  if (ms !== null && now - ms <= CAM_STALE_MS) return 'ok';
  const kind = KIND.get(id);
  const night = (kind === 'roundshot' || kind === 'roundshot360') && !isBetweenLocal(now, '07:10', '17:30');
  return night ? 'ok' : 'stale';
}

function camCounts(row: Record<string, unknown> | null, now: number): Record<'total' | CamBucket, number> {
  const out = { total: 0, live: 0, ok: 0, stale: 0, offline: 0 };
  for (const [id, e] of Object.entries(row ?? {})) {
    if (!e || typeof e !== 'object') continue;
    out.total++;
    out[camBucket(id, e as Partial<CamStatusEntry>, now)]++;
  }
  return out;
}

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

  const tickAgeMin = cron ? (now - cron.startedAt) / MIN : null;
  const failures: string[] = [];
  if (tickAgeMin === null || tickAgeMin > CRON_STALE_MIN) failures.push('cron-stale');
  if (suspects.size) failures.push('cpu-suspect');
  const red = sources.filter((s) => isCritical(s.id, s.status) && s.badge === 'red').map((s) => s.id);
  if (red.length) failures.push(`red:${red.join(',')}`);
  const pointChanges = payloadOf(rows, 'nws:points')?.changes;
  if (Array.isArray(pointChanges) && pointChanges.length) failures.push(`nws-points:${pointChanges.length}`);

  const yt = payloadOf(rows, 'yt:state');
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
      // the last run's mode ('api' | 'keyless'); before the first run, the configured one
      mode: yt?.mode === 'api' || yt?.mode === 'keyless' ? yt.mode : ytKey ? 'api' : 'keyless',
      unitsToday: counters.ytUnitsToday,
      unmapped: Array.isArray(yt?.unmapped) ? yt.unmapped.length : 0,
      anomaly: counters.ytUnitsToday > YT_ANOMALY_UNITS,
    },
    cams: camCounts(payloadOf(rows, 'cams:status'), now), // the 26 cams cam-status checks (§6.4)
    quotas: {
      kvWritesToday: counters.kvWritesToday,
      ytUnitsToday: counters.ytUnitsToday,
      trackerWritesToday: counters.trackerWritesToday,
    },
  };
  const strict = url.searchParams.get('strict') === '1';
  return json(body, { status: strict && !body.ok ? 503 : 200 });
}
