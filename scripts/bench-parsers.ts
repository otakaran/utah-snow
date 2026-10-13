// pnpm bench [--refresh]: parser CPU on full-size payloads (spec §5.3, §14). Not a test: it needs the network.
// Each job's Raw comes from its own fetch() through the Node shim (the scraped pages from in-season Wayback captures)
// and is cached in .cache/bench/ (gitignored; --refresh refetches). A job whose fetch plan changes with the slot
// (snowbird trails, roads signs/traffic, youtube) gets one payload per plan. Every parse runs 5 times on a fresh
// copy; the medians are summed per cron slot (config/schedule.ts SLOTS with the morning jobs; maintenance counts its
// heaviest sub-job, since only one is due per tick). Exits 1 when any slot sums over 5 ms. Keyless UDOT /List/GetData
// answers a laptop but 403s Worker egress, so roads parses more here than it does deployed (a conservative bias).
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { SLOTS } from '../config/schedule.ts';
import { isObj } from '../src/shared/json.ts';
import { slotJobIds } from '../src/worker/cron/slots.ts';
import type { Source } from '../src/worker/sources/types.ts';
import { shimCtx, waybackMs } from './lib/fetch-shim.ts';
import { JOBS, MAINT_SUBS, MAINTENANCE, openedPrev } from './lib/jobs.ts';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const CACHE = join(ROOT, '.cache/bench');
const RUNS = 5;
const SLOT_MAX_MS = 5;
const POOL = 4; // payloads fetched at a time
// In-season captures for the regex-scraped pages: in October they are smaller than the winter pages the budget is for.
const IN_SEASON: Readonly<Record<string, string>> = {
  'resort:snowbasin': '20260209191006',
  'resort:alta': '20260212184624',
  'alta-weather': '20260218064604',
};

interface Variant {
  key: string; // `${job id}@${maxSubrequests}`
  src: Source;
  slot: number; // the first slot with this fetch plan
}
interface Payload {
  now: number;
  from: string;
  raw: unknown;
}
interface Timing {
  kb: number;
  from: string;
  median: number;
  min: number;
  max: number;
  err: string | null;
}

const { values: opts } = parseArgs({ options: { refresh: { type: 'boolean', default: false } } });

// JSON with ArrayBuffers (stake images) as base64.
const encode = (p: Payload) =>
  JSON.stringify(p, (_, v) => (v instanceof ArrayBuffer ? { $bytes: Buffer.from(v).toString('base64') } : v));
const decode = (s: string) =>
  JSON.parse(s, (_, v) =>
    isObj(v) && typeof v.$bytes === 'string' ? Uint8Array.from(Buffer.from(v.$bytes, 'base64')).buffer : v,
  ) as Payload;

/** The jobs a slot can run (morning and maintenance included); maintenance stands for its sub-jobs. */
const slotJobs = (slot: number): string[] => slotJobIds(slot, true, true);
const sourcesOf = (id: string): readonly Source[] =>
  id === MAINTENANCE ? MAINT_SUBS : JOBS.filter((j) => j.id === id);

/** One variant per job and distinct fetch plan over its slots; `bySlot` maps `${id}#${slot}` to the variant key. */
function plan(): { variants: Variant[]; bySlot: Map<string, string> } {
  const { ctx } = shimCtx({ now: Date.now() });
  const variants = new Map<string, Variant>();
  const bySlot = new Map<string, string>();
  for (let slot = 0; slot < SLOTS.length; slot++) {
    for (const src of slotJobs(slot).flatMap(sourcesOf)) {
      const key = `${src.id}@${src.maxSubrequests({ ...ctx, slot })}`;
      if (!variants.has(key)) variants.set(key, { key, src, slot });
      bySlot.set(`${src.id}#${slot}`, key);
    }
  }
  return { variants: [...variants.values()], bySlot };
}

async function payload(v: Variant): Promise<{ p: Payload; kb: number } | string> {
  const file = join(CACHE, `${v.key.replace(/[^\w@.-]/g, '_')}.json`);
  if (!opts.refresh && existsSync(file)) {
    const text = readFileSync(file, 'utf8');
    return { p: decode(text), kb: text.length / 1024 };
  }
  const ts = IN_SEASON[v.src.id];
  const now = (ts && waybackMs(ts)) || Date.now();
  const { ctx } = shimCtx({ now, wayback: ts, slot: v.slot });
  try {
    const p: Payload = { now, from: ts ? `wayback ${ts}` : 'live', raw: await v.src.fetch(ctx) };
    const text = encode(p);
    mkdirSync(CACHE, { recursive: true });
    writeFileSync(file, text);
    return { p, kb: text.length / 1024 };
  } catch (err) {
    return err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  }
}

function time(v: Variant, p: Payload, kb: number): Timing {
  const ctx = { now: p.now, prev: openedPrev(v.src, p.now) };
  const ms: number[] = [];
  let err: string | null = null;
  for (let i = 0; i < RUNS; i++) {
    const raw = structuredClone(p.raw); // keeps the runs independent should a parse() mutate its input
    const t0 = performance.now();
    try {
      v.src.parse(raw, ctx);
    } catch (e) {
      err = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
    ms.push(performance.now() - t0);
  }
  ms.sort((a, b) => a - b);
  return { kb, from: p.from, median: ms[RUNS >> 1] ?? 0, min: ms[0] ?? 0, max: ms[RUNS - 1] ?? 0, err };
}

const { variants, bySlot } = plan();
const loaded: ({ p: Payload; kb: number } | string)[] = new Array(variants.length);
let next = 0;
await Promise.all(
  Array.from({ length: POOL }, async () => {
    for (let i = next++; i < variants.length; i = next++) loaded[i] = await payload(variants[i] as Variant);
  }),
);

// Timed only after every fetch has settled, one parse at a time.
const timings = new Map<string, Timing>();
const f2 = (n: number) => n.toFixed(2).padStart(6);
console.log(
  `${'job (slot)'.padEnd(34)}${'payload'.padStart(10)}  ${'median'.padStart(6)} ${'min'.padStart(6)} ${'max'.padStart(6)}  source`,
);
for (const [i, v] of variants.entries()) {
  const got = loaded[i];
  const name = `${v.src.id} (${v.slot})`.padEnd(34);
  if (got === undefined || typeof got === 'string') {
    console.log(`${name}${'-'.padStart(10)}  fetch failed: ${got}`);
    continue;
  }
  const t = time(v, got.p, got.kb);
  timings.set(v.key, t);
  const note = t.err ? `  parse throws: ${t.err.slice(0, 80)}` : '';
  console.log(
    `${name}${`${t.kb.toFixed(0)} KB`.padStart(10)}  ${f2(t.median)} ${f2(t.min)} ${f2(t.max)}  ${t.from}${note}`,
  );
}

console.log(`\n${'slot'.padEnd(6)}${'jobs'.padStart(5)}  ${'sum ms'.padStart(7)}  heaviest`);
let over = 0;
for (let slot = 0; slot < SLOTS.length; slot++) {
  const ids = slotJobs(slot);
  const cost: [string, number][] = [];
  const missing: string[] = [];
  for (const id of ids) {
    const ms = sourcesOf(id).map((j) => timings.get(bySlot.get(`${j.id}#${slot}`) ?? '')?.median);
    const known = ms.filter((m): m is number => m !== undefined);
    if (known.length < ms.length || known.length === 0) missing.push(id);
    cost.push([id, id === MAINTENANCE ? Math.max(0, ...known) : known.reduce((a, b) => a + b, 0)]);
  }
  const sum = cost.reduce((a, [, ms]) => a + ms, 0);
  const top = [...cost].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const flag = sum > SLOT_MAX_MS ? '  OVER' : missing.length ? `  incomplete: ${missing.join(', ')}` : '';
  if (sum > SLOT_MAX_MS) over++;
  console.log(
    `${String(slot).padEnd(6)}${String(ids.length).padStart(5)}  ${f2(sum).padStart(7)}  ${top.map(([id, ms]) => `${id} ${ms.toFixed(2)}`).join(', ')}${flag}`,
  );
}
console.log(`\n${RUNS} runs per parser, median; morning jobs counted in every slot; limit ${SLOT_MAX_MS} ms per slot.`);
process.exit(over > 0 ? 1 : 0);
