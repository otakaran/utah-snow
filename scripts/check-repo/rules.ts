// Rules 1, 2 and 4-8 of the repo contract (rule 3 lives in imports.ts).
import { posix } from 'node:path';
import { type Finding, findAll, isCode, isTest, type RepoFile, stripComments, under } from './files.ts';

const WARN_LINES = 250;
const MAX_LINES = 400;
const MAX_FIXTURE_BYTES = 30 * 1024;
const ALLOWED_MD = new Set(['README.md', 'CLAUDE.md', 'src/worker/CLAUDE.md', 'src/web/CLAUDE.md']);
const SIZE_EXEMPT = (p: string) =>
  p === 'pnpm-lock.yaml' || p === 'worker-configuration.d.ts' || under(p, 'migrations') || isFixture(p);
const isFixture = (p: string) => /(?:^|\/)fixtures\//.test(p);

const TIME_RE =
  /\bIntl\.|\.toLocale(?:Date|Time)?String\(|\.(?:get|set)(?:FullYear|Month|Date|Day|Hours|Minutes|Seconds|Milliseconds)\(|\.getTimezoneOffset\(|\bnew Date\([^()]*,/g;
const TEST_ESCAPE_RE = /\.(?:only|skip|todo)\s*\(|\btoMatch(?:Inline|File)?Snapshot\b/g;
const SECRET_RE = /AIza[0-9A-Za-z_-]{35}|(?:IP_HASH_SALT|PROBE_KEY)=[0-9a-f]|Bearer [A-Za-z0-9_-]{20,}|-{5}BEGIN/g;
const HEX_RE = /(?<!&)#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g;

function lineCount(text: string): number {
  if (text === '') return 0;
  const n = text.split('\n').length;
  return text.endsWith('\n') ? n - 1 : n;
}

// Rule 1: file size and CLAUDE.md caps. Rule 2: fixture size.
export function checkSizes(files: RepoFile[]): Finding[] {
  const found: Finding[] = [];
  for (const f of files) {
    if (isFixture(f.path) && f.size > MAX_FIXTURE_BYTES) {
      found.push({ path: f.path, msg: `fixture is ${Math.ceil(f.size / 1024)} KB (max 30 KB)` });
    }
    if (f.text === null || SIZE_EXEMPT(f.path)) continue;
    const lines = lineCount(f.text);
    if (posix.basename(f.path) === 'CLAUDE.md') {
      const cap = f.path === 'CLAUDE.md' ? 120 : 40;
      if (lines > cap) found.push({ path: f.path, msg: `${lines} lines (CLAUDE.md cap ${cap})` });
    } else if (lines > MAX_LINES) {
      found.push({ path: f.path, msg: `${lines} lines (hard cap ${MAX_LINES}); split it` });
    } else if (lines > WARN_LINES) {
      found.push({ path: f.path, msg: `${lines} lines (aim for <= ${WARN_LINES})`, warn: true });
    }
  }
  return found;
}

// Rule 4: all Date/Intl/time logic lives in src/shared/time.ts (and its body folder src/shared/time/).
const TIME_HOME = (p: string) =>
  p === 'src/shared/time.ts' || p === 'src/shared/time.test.ts' || under(p, 'src/shared/time');

export function checkTime(files: RepoFile[]): Finding[] {
  const found: Finding[] = [];
  for (const f of files) {
    if (f.text === null || !isCode(f.path) || f.path.endsWith('.d.ts')) continue;
    if (!(under(f.path, 'src') || under(f.path, 'config'))) continue;
    if (TIME_HOME(f.path)) continue;
    found.push(
      ...findAll(f.path, stripComments(f.text), TIME_RE, (m) => `time API '${m[0]}' outside src/shared/time.ts`),
    );
  }
  return found;
}

// Rule 5: no focused/skipped/todo tests, no snapshots.
export function checkTests(files: RepoFile[]): Finding[] {
  const found: Finding[] = [];
  for (const f of files) {
    if (f.path.split('/').includes('__snapshots__')) found.push({ path: f.path, msg: 'snapshot files are banned' });
    if (f.text === null || !isTest(f.path)) continue;
    found.push(...findAll(f.path, stripComments(f.text), TEST_ESCAPE_RE, (m) => `'${m[0].trim()}' left in a test`));
  }
  return found;
}

// Rule 6: files that must never be tracked; Markdown only in the four allowed files.
export function checkTracked(files: RepoFile[]): Finding[] {
  const found: Finding[] = [];
  for (const { path } of files) {
    const base = posix.basename(path);
    const segs = path.split('/');
    if ((base.startsWith('.dev.vars') && base !== '.dev.vars.example') || base.startsWith('.env')) {
      found.push({ path, msg: 'local secrets file must not be tracked' });
    } else if (segs[0] === 'design-sprint' || segs[0] === 'plan' || segs.slice(0, -1).includes('docs')) {
      found.push({ path, msg: 'design-sprint/, plan/ and docs/ are never committed' });
    } else if (/\.(?:md|mdx|markdown)$/i.test(base) && !ALLOWED_MD.has(path)) {
      found.push({ path, msg: 'Markdown is allowed only in README.md and the three CLAUDE.md files' });
    }
  }
  return found;
}

// Rule 7: key-shaped secrets anywhere in text files.
export function checkSecrets(files: RepoFile[]): Finding[] {
  const found: Finding[] = [];
  for (const f of files) {
    if (f.text === null) continue;
    found.push(...findAll(f.path, f.text, SECRET_RE, () => 'key-shaped secret (value not printed)'));
  }
  return found;
}

// Rule 8: colors only through src/web/styles/tokens.css.
export function checkColors(files: RepoFile[]): Finding[] {
  const found: Finding[] = [];
  for (const f of files) {
    if (f.text === null || !under(f.path, 'src/web') || f.path === 'src/web/styles/tokens.css') continue;
    if (!/\.(?:ts|tsx|css|html)$/.test(f.path)) continue;
    found.push(
      ...findAll(f.path, stripComments(f.text), HEX_RE, (m) => `raw hex color ${m[0]}; use a tokens.css variable`),
    );
  }
  return found;
}
