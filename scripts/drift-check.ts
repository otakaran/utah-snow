// Weekly cam drift check (spec §11; .github/workflows/drift.yml, `pnpm drift`). Run with plain node:
// `node scripts/drift-check.ts`. Scrapes the resort and UDOT webcam pages with plain fetch and regexes (no secrets,
// no DOM parser) and diffs them against config/cams/ and config/youtube.ts. Prints a markdown report on stdout and
// exits 1 on any drift, 0 with "no drift" otherwise. A host that blocks the runner is reported as unreachable only.
import { isoUtc } from '../src/shared/time.ts';
import { checkAlta } from './drift-check/alta.ts';
import { newSite, renderReport, type SiteResult } from './drift-check/diff.ts';
import { checkHdrelay } from './drift-check/hdrelay.ts';
import { checkSnowbasin } from './drift-check/snowbasin.ts';
import { checkSnowbird } from './drift-check/snowbird.ts';
import { checkUdot } from './drift-check/udot.ts';
import { checkYoutube } from './drift-check/youtube.ts';

const SITES: [string, () => Promise<SiteResult>][] = [
  ['Alta', checkAlta],
  ['Snowbird', checkSnowbird],
  ['Snowbasin', checkSnowbasin],
  ['Solitude', () => checkYoutube('solitude')],
  ['Brighton', () => checkYoutube('brighton')],
  ['Deer Valley', () => checkYoutube('deer-valley')],
  ['UDOT Cottonwood Canyons', checkUdot],
  ['HDRelay players', checkHdrelay],
];

// Network failures are handled per request; a throw here is a bug or an unexpected page, so it counts as drift.
const results = await Promise.all(
  SITES.map(async ([site, check]) => {
    try {
      return await check();
    } catch (err) {
      const r = newSite(site, '(check crashed)');
      r.problems.push(`the check threw: ${err instanceof Error ? err.message : String(err)}`);
      return r;
    }
  }),
);

const { markdown, drift } = renderReport(results, isoUtc(Date.now()));
process.stdout.write(markdown);
process.exitCode = drift ? 1 : 0;
