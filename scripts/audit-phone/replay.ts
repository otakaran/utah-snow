// --snapshot <file> of scripts/audit-phone.ts: answers /api/snapshot from a saved body (e.g. the live site's), so a
// local `vite preview` (seeded with '{}' payloads) lays out like production. Date is "now" (the app's clock is the
// server Date), X-Build stays absent. Under the throttle the answer waits one RTT plus the gzip size at the
// download rate, because a fulfilled route skips the emulated network.
import { readFileSync } from 'node:fs';
import { setTimeout as sleep } from 'node:timers/promises';
import { gzipSync } from 'node:zlib';
import type { Page } from '@playwright/test';

export interface Replay {
  file: string;
  /** Raw body bytes and gzip bytes (what the wire would carry). */
  raw: number;
  wire: number;
  delayMs: number;
  served: number;
}

/** Wire time of `wireBytes` at `downKbps` (the CDP throttle's 1 kbps = 1024 bit/s) plus one round trip. */
export function wireDelay(wireBytes: number, t: { rttMs: number; downKbps: number } | null): number {
  return t ? Math.round(t.rttMs + (wireBytes * 8 * 1000) / (t.downKbps * 1024)) : 0;
}

export async function replaySnapshot(
  page: Page,
  file: string,
  t: { rttMs: number; downKbps: number } | null,
): Promise<Replay> {
  const body = readFileSync(file);
  const parsed = JSON.parse(body.toString('utf8')) as { v?: unknown; generatedAt?: unknown };
  if (parsed?.v !== 1) throw new Error(`${file}: not a v1 snapshot body`);
  const wire = gzipSync(body).length;
  const rec: Replay = { file, raw: body.length, wire, delayMs: wireDelay(wire, t), served: 0 };
  const etag = `W/"audit-${String(parsed.generatedAt ?? 'x')}"`;
  await page.route('**/api/snapshot', async (route) => {
    await sleep(rec.delayMs);
    rec.served++;
    await route.fulfill({
      status: 200,
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-cache',
        date: new Date().toUTCString(),
        etag,
      },
      body,
    });
  });
  return rec;
}
