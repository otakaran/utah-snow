// pnpm fixtures [target...] [--wayback <YYYYMMDDhhmmss>] [--tag <tag>]
// Runs each adapter's own fetch() (live, or against a Wayback id_ snapshot), trims the Raw payload
// (refresh-fixtures/trim.ts), writes src/worker/sources/fixtures/<dir>/<YYYYMMDD>-<tag>[-<job>].<ext> (refusing
// anything over 30 KB), then re-parses the written file and compares it with the full payload's parse().
// Targets: fixture folders (alta, mtnpowder, nws-grid, roads, ...) or job ids (nws-grid:snowbasin:summit); none = all.
// A new file is not used by any test until <id>.test.ts imports it; delete the file it replaces in the same commit.
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { isoUtc, localDate } from '../src/shared/time.ts';
import { fullestSlot, type Hit, shimCtx, waybackMs } from './lib/fetch-shim.ts';
import { checkFixture, MAX_BYTES, toFixture } from './refresh-fixtures/fixture.ts';
import { resolveTargets, type Target } from './refresh-fixtures/targets.ts';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const FIXTURES = join(ROOT, 'src/worker/sources/fixtures');

const { values: opts, positionals } = parseArgs({
  allowPositionals: true,
  options: { wayback: { type: 'string' }, tag: { type: 'string' } },
});
const ts = opts.wayback;
const tsMs = ts === undefined ? Date.now() : waybackMs(ts);
if (tsMs === null) {
  console.error('--wayback takes a 14-digit Wayback timestamp, e.g. 20260209191006');
  process.exit(2);
}
const now: number = tsMs;
const day = ts ? ts.slice(0, 8) : localDate(now).replaceAll('-', '');
const tag = opts.tag ?? (ts ? 'inseason' : 'live');
const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

function showHits(hits: Hit[]): void {
  for (const h of hits)
    console.log(
      `    ${String(h.status).padStart(3)} ${kb(h.bytes).padStart(9)} ${String(h.ms).padStart(6)} ms  ${h.url}`,
    );
}

/** One target: fetch, trim, write, re-parse. Returns false when nothing usable was written. */
async function refresh(t: Target): Promise<boolean> {
  const { ctx, hits } = shimCtx({ now, wayback: ts });
  ctx.slot = fullestSlot(t.src, ctx);
  const label = `${t.src.id} (slot ${ctx.slot})`;
  try {
    const raw = await t.src.fetch(ctx);
    const from = ts ? `Wayback ${ts}` : `fetched ${isoUtc(now)}`;
    const fx = toFixture(
      t.dir,
      raw,
      `${hits[0]?.url ?? t.src.id} ${from} by pnpm fixtures, trimmed to what parse() reads`,
    );
    const file = join(FIXTURES, t.dir, `${day}-${tag}${t.suffix}.${fx.ext}`);
    const name = relative(ROOT, file);
    if (fx.bytes > MAX_BYTES) {
      console.log(
        `FAIL ${label}: ${name} would be ${kb(fx.bytes)} (max 30 KB); extend its trim in refresh-fixtures/trim.ts`,
      );
      return false;
    }
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, fx.text);
    const check = checkFixture(t.src, raw, readFileSync(file, 'utf8'), now);
    if (!check.ok) rmSync(file);
    console.log(
      `${check.ok ? 'ok  ' : 'FAIL'} ${label}: ${name} ${kb(fx.bytes)}; ${check.msg}${check.ok ? '' : ' (removed)'}`,
    );
    return check.ok;
  } catch (err) {
    console.log(`FAIL ${label}: ${err instanceof Error ? `${err.name}: ${err.message}` : String(err)}`);
    return false;
  } finally {
    showHits(hits);
  }
}

let targets: Target[];
try {
  targets = resolveTargets(positionals);
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(2);
}
let failed = 0;
for (const t of targets) if (!(await refresh(t))) failed++; // one at a time: Wayback asks for polite spacing
console.log(`${targets.length - failed}/${targets.length} fixture(s) written to ${relative(ROOT, FIXTURES)}`);
process.exit(failed > 0 ? 1 : 0);
