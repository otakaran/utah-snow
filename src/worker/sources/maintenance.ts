// Maintenance job (spec §5.3): slot 10 at 08-11Z plus Mondays 12Z. One job id over three sub-jobs, each with its
// own row and due gate: hdrelay-config 08Z (12 subrequests), udot-cam-check 09/10/11Z (17/16/16), nws-points
// Mondays 12Z (17). The gates never overlap, so a tick spends at most 17. `rowsDue` tells the dispatcher which rows
// a run writes, so a failed or deferred sub never marks the other subs' rows. The 08Z D1 prune is store work.
// check-repo lets this file (and only this file) import those three adapters.
import { hdrelayConfig, hdrelayConfigDue } from './hdrelay-config.ts';
import { nwsPoints, nwsPointsDue } from './nws-points.ts';
import { type FetchCtx, type Output, type ParseCtx, type Source, ValidationError } from './types.ts';
import { udotCamCheck, udotCamCheckDue } from './udot-cam-check.ts';

interface Sub {
  src: Source;
  due(now: number): boolean;
}

const SUBS: readonly Sub[] = [
  { src: hdrelayConfig, due: hdrelayConfigDue },
  { src: udotCamCheck, due: udotCamCheckDue },
  { src: nwsPoints, due: nwsPointsDue },
];
const BY_ID = new Map(SUBS.map((s) => [s.src.id, s]));

/** Raw: sub-job id -> that sub's raw, for the subs whose fetch succeeded. */
export type MaintenanceRaw = Record<string, unknown>;

const dueSubs = (now: number): Source[] => SUBS.filter((s) => s.due(now)).map((s) => s.src);

export const maintenance: Source<MaintenanceRaw> = {
  id: 'maintenance',
  staleAfterMin: 2880,
  rows: SUBS.flatMap((s) => s.src.rows),
  staleByRow: Object.fromEntries(SUBS.flatMap((s) => s.src.rows.map((r) => [r, s.src.staleAfterMin]))),
  rowsDue: (now) => dueSubs(now).flatMap((s) => s.rows),
  maxSubrequests: (ctx) => dueSubs(ctx.now).reduce((n, s) => n + s.maxSubrequests(ctx), 0),
  probes: SUBS.flatMap((s) => s.src.probes),

  /** Each due sub in its own try; rethrows the first error only when every due sub failed. */
  async fetch(ctx: FetchCtx): Promise<MaintenanceRaw> {
    const raw: MaintenanceRaw = {};
    let failed: unknown = null;
    for (const src of dueSubs(ctx.now)) {
      try {
        raw[src.id] = await src.fetch(ctx);
      } catch (err) {
        failed ??= err;
      }
    }
    if (failed !== null && Object.keys(raw).length === 0) throw failed;
    return raw;
  },

  /** Merges the subs' rows. A sub's ValidationError drops only its row; throws when every sub that ran failed. */
  parse(raw: MaintenanceRaw, ctx: ParseCtx): Output {
    const rows: Output['rows'] = {};
    let failed: ValidationError | null = null;
    for (const [id, subRaw] of Object.entries(raw)) {
      const sub = BY_ID.get(id);
      if (!sub) continue;
      try {
        Object.assign(rows, sub.src.parse(subRaw, ctx).rows);
      } catch (err) {
        if (!(err instanceof ValidationError)) throw err;
        failed ??= err;
      }
    }
    if (failed && Object.keys(rows).length === 0) throw failed;
    return { rows };
  },
};
