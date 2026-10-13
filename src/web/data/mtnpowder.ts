// MtnPowder browser fallback (spec §5.4 last row, O1). Imperva challenges the Worker's egress, so the Worker's
// resort:solitude / resort:deer-valley rows end 'blocked'. While a Worker row is blocked, missing or red, the browser
// fetches the feed itself (it sends ACAO *): at most every 40 min per resort, only while the page is visible, parsed by
// the shared parser with prev = the snapshot's resort data. snapshot.ts lays each browser row over the Worker's block
// (meta.via = 'browser') while it is newer than the Worker's last good fetch, so every view reads it unchanged.
// One localStorage cache (`utahsnow.mtn`) is shared by every tab, with open-meteo.ts's discipline: on 429 every tab
// waits 60 min, other errors back off 5/15/30 min. Times are server time (Date.now() + skew), passed in by snapshot.ts.
import { effect, type ReadonlySignal, signal } from '@preact/signals';
import { badge } from '../../shared/freshness.ts';
import { MTNPOWDER, type MtnResort, mtnpowderUrl, parseMtnPowder } from '../../shared/mtnpowder.ts';
import { isoToMs, isoUtc, MIN } from '../../shared/time.ts';
import type { Block, Meta, ResortSnapshot, Snapshot } from '../../shared/types.ts';
import { onPageVisibility, pageVisible } from '../lib/visibility.ts';

export interface BrowserRow {
  okAt: string; // server-time ISO of the browser's successful fetch
  data: ResortSnapshot;
}
export type BrowserRows = Partial<Record<MtnResort, BrowserRow>>;

interface Stored {
  v: 1;
  rows: BrowserRows;
  retryAfter: number; // 429: nobody fetches before this
  nextTry: number; // other errors: 5/15/30 min backoff
  fails: number;
  claimAt: number; // a tab is fetching since then; others wait up to CLAIM_MS
}

const KEY = 'utahsnow.mtn';
const RESORTS = Object.keys(MTNPOWDER) as MtnResort[];
const PERIOD_MS = 40 * MIN;
const STALE_AFTER_MIN = 40; // the Worker row's staleAfterMin, for a block the snapshot lacks
const CHECK_MS = 60_000;
const CLAIM_MS = 60_000;
const RATE_LIMIT_MS = 60 * MIN;
const BACKOFF_MS = [5 * MIN, 15 * MIN, 30 * MIN] as const;
const EMPTY: Stored = { v: 1, rows: {}, retryAfter: 0, nextTry: 0, fails: 0, claimAt: 0 };

/** The trigger: the Worker's row is blocked, missing or red. Off-season (grey) rows never trigger. */
export function wantsBrowser(block: Block<ResortSnapshot> | undefined, nowMs: number): boolean {
  if (!block) return true;
  return block.meta.status === 'blocked' || badge(block.meta, nowMs) === 'red';
}

/** Mirrors the Worker's meta for a fresh row (store/row-meta.ts): asOf = snow.reportAt, preseason -> 'offseason'. */
function browserMeta(r: MtnResort, base: Meta | undefined, row: BrowserRow): Meta {
  return {
    source: base?.source ?? `resort:${r}`,
    fetchedAt: row.okAt,
    okAt: row.okAt,
    asOf: row.data.snow?.reportAt ?? null,
    status: row.data.season === 'preseason' ? 'offseason' : 'ok',
    failCount: 0,
    staleAfterMin: base?.staleAfterMin ?? STALE_AFTER_MIN,
    via: 'browser',
  };
}

/**
 * Lays each browser row over its resort block and its `sources` entry while it is newer than the Worker's last good
 * fetch (a recovered Worker row wins again). Returns `snap` itself when nothing changes.
 */
export function overlayBrowser(snap: Snapshot | null, rows: BrowserRows): Snapshot | null {
  if (!snap) return snap;
  let out = snap;
  for (const r of RESORTS) {
    const row = rows[r];
    const block = snap.resorts[r];
    const at = isoToMs(row?.okAt);
    if (!row || at === null || (isoToMs(block?.meta.okAt) ?? Number.NEGATIVE_INFINITY) >= at) continue;
    const meta = browserMeta(r, block?.meta, row);
    const listed = out.sources.some((m) => m.source === meta.source);
    out = {
      ...out,
      resorts: { ...out.resorts, [r]: { data: row.data, meta } },
      sources: listed ? out.sources.map((m) => (m.source === meta.source ? meta : m)) : [...out.sources, meta],
    };
  }
  return out;
}

let mem: Stored = EMPTY; // fallback when localStorage is unavailable (private mode, quota)
let started = false;
let inflight = false;

const isRow = (v: unknown): v is BrowserRow => {
  const row = v as Partial<BrowserRow> | null;
  return isoToMs(row?.okAt) !== null && typeof row?.data === 'object' && row.data !== null;
};

function load(): Stored {
  try {
    const raw = localStorage.getItem(KEY);
    const s = raw ? (JSON.parse(raw) as Partial<Stored>) : null;
    if (s?.v === 1) {
      const rows: BrowserRows = {};
      for (const r of RESORTS) {
        const row = s.rows?.[r];
        if (isRow(row)) rows[r] = row;
      }
      return { ...EMPTY, ...s, rows };
    }
  } catch {
    // Unreadable or corrupt: fall back to this tab's memory copy.
  }
  return mem;
}

function save(s: Stored): void {
  mem = s;
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // Quota or private mode: this tab keeps its memory copy.
  }
}

/** Browser-fetched rows, by resort; snapshot.ts overlays them. */
export const browserRows = signal<BrowserRows>(typeof localStorage === 'undefined' ? {} : load().rows);

function publish(s: Stored): void {
  const cur = browserRows.peek();
  if (RESORTS.some((r) => cur[r]?.okAt !== s.rows[r]?.okAt)) browserRows.value = s.rows;
}

const due = (s: Stored, snap: Snapshot, now: number): MtnResort[] =>
  now < s.retryAfter || now < s.nextTry || now - s.claimAt < CLAIM_MS
    ? []
    : RESORTS.filter((r) => wantsBrowser(snap.resorts[r], now) && now - (isoToMs(s.rows[r]?.okAt) ?? 0) >= PERIOD_MS);

async function refresh(server: ReadonlySignal<Snapshot | null>, nowMs: () => number): Promise<void> {
  const snap = server.peek();
  if (inflight || !snap || !pageVisible.peek()) return;
  const s = load();
  publish(s);
  const todo = due(s, snap, nowMs());
  if (todo.length === 0) return;
  inflight = true;
  save({ ...s, claimAt: nowMs() });
  try {
    for (const r of todo) {
      const res = await fetch(mtnpowderUrl(r, nowMs()), {
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      if (res.status === 429) {
        void res.body?.cancel();
        save({ ...load(), retryAfter: nowMs() + RATE_LIMIT_MS, claimAt: 0 });
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      // prev = the resort data views see now (the newer of the two), so a seasonOpenedAt the browser set survives.
      const prev = overlayBrowser(server.peek(), s.rows)?.resorts[r]?.data ?? null;
      const out = parseMtnPowder(await res.json(), r, nowMs(), prev);
      if (!out.ok) throw new Error(out.error);
      const cur = load();
      const next: Stored = { ...cur, rows: { ...cur.rows, [r]: { okAt: isoUtc(nowMs()), data: out.data } } };
      save({ ...next, fails: 0, nextTry: 0 });
      publish(next);
    }
    save({ ...load(), claimAt: 0 });
  } catch {
    // Network, CORS (an Imperva page has no ACAO), HTTP or validation error: keep the last rows, back off.
    const cur = load();
    const fails = cur.fails + 1;
    const wait = BACKOFF_MS[Math.min(fails, BACKOFF_MS.length) - 1] ?? BACKOFF_MS[0];
    save({ ...cur, fails, nextTry: nowMs() + wait, claimAt: 0 });
  } finally {
    inflight = false;
  }
}

/**
 * Starts the fallback once (snapshot.ts calls it from startSnapshot). `server` is the Worker's snapshot (never the
 * overlaid one, so a browser row cannot silence the trigger); checks run on every new snapshot, every minute, and
 * when the page becomes visible.
 */
export function startMtnPowder(server: ReadonlySignal<Snapshot | null>, nowMs: () => number): void {
  if (started) return;
  started = true;
  const run = () => void refresh(server, nowMs);
  setInterval(run, CHECK_MS);
  onPageVisibility((visible) => {
    if (visible) run();
  });
  addEventListener('storage', (e) => {
    if (e.key === KEY) publish(load()); // another tab fetched
  });
  effect(() => {
    if (server.value) run();
  });
}
