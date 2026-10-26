// Phone audit of one route (plan Stage 5). Run with plain node:
//   node scripts/audit-phone.ts [--url https://utah.otakar.dev] [--route '#/cams'] [--out file.json] [--webkit]
//     [--snapshot .cache/audit/snapshot.json]
// iPhone 15 (393x659 viewport, DPR 3) in Chromium with slow-4G (150 ms RTT, 1.6 Mbps) + 4x CPU, or WebKit
// unthrottled with --webkit; Open-Meteo answered in-page with a canned body. Measures page and section heights,
// tap targets < 44 px, text < 12 px, horizontal overflow, media started on load, long tasks, LCP, bytes above the
// fold vs on load vs after scrolling everything, the briefing jump bar's fit (with a 7th chip) and JS coverage.
// The default --url is a local `vite preview`, whose seeded payloads are `{}`: use the live site for real heights,
// or replay a saved live body (`curl -s https://utah.otakar.dev/api/snapshot > .cache/audit/snapshot.json`) with
// --snapshot (audit-phone/replay.ts).
// Writes JSON (default .cache/audit/phone-<iso>.json), prints a ~20-line summary; exit 0, or 2 on a script error.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { isoUtc } from '../src/shared/time.ts';
import { audit } from './audit-phone/collect.ts';
import { summary } from './audit-phone/summary.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));

try {
  const { values } = parseArgs({
    options: {
      url: { type: 'string', default: 'http://localhost:4173' },
      route: { type: 'string', default: '#/' },
      out: { type: 'string' },
      webkit: { type: 'boolean', default: false },
      snapshot: { type: 'string' },
    },
  });
  const route = values.route.startsWith('#') ? values.route : `#${values.route}`;
  const at = isoUtc(Date.now());
  const out = values.out ? resolve(values.out) : join(root, '.cache', 'audit', `phone-${at.replaceAll(':', '-')}.json`);
  const result = {
    ...(await audit({
      url: values.url,
      route,
      webkit: values.webkit,
      snapshot: values.snapshot ? resolve(values.snapshot) : undefined,
    })),
    at,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
  console.log(summary(result, out).join('\n'));
  process.exitCode = 0;
} catch (err) {
  console.error(`audit-phone: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}`);
  process.exitCode = 2;
}
