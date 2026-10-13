// Rule 3: import boundaries, explicit extensions, file naming, and "only store/ touches D1/KV".
import { posix } from 'node:path';
import { type Finding, findAll, isCode, isTest, lineAt, type RepoFile, stripComments, under } from './files.ts';

interface Imp {
  spec: string;
  target: string | null; // repo-relative path for relative specifiers, null for packages
  typeOnly: boolean;
  line: number;
}

const STATIC_RE = /(?<=^|[\s;])(?:import|export)\s+(type\s+)?(?:[^'";()=]*?\s*from\s*)?['"]([^'"\n]+)['"]/gm;
const DYNAMIC_RE = /\bimport\s*\(\s*['"]([^'"\n]+)['"]\s*\)/g;
const STORE_ONLY_RE = /\b(?:DB|FRAMES)\s*\.\s*\w+\s*\(|\.prepare\s*\(\s*['"`]/;

function parseImports(path: string, src: string): Imp[] {
  const imps: Imp[] = [];
  const add = (spec: string, typeOnly: boolean, index: number) => {
    const target = spec.startsWith('.')
      ? posix.normalize(posix.join(posix.dirname(path), spec.replace(/\?.*$/, '')))
      : null;
    imps.push({ spec, target, typeOnly, line: lineAt(src, index) });
  };
  for (const m of src.matchAll(STATIC_RE)) add(m[2] ?? '', Boolean(m[1]), m.index);
  for (const m of src.matchAll(DYNAMIC_RE)) add(m[1] ?? '', false, m.index);
  return imps;
}

function adapterRule(file: string, imp: Imp, test: boolean): string | null {
  const t = imp.target;
  if (t === null) return null;
  for (const d of ['store', 'api', 'cron']) {
    if (under(t, `src/worker/${d}`)) return `adapters may not import src/worker/${d}/`;
  }
  if (test || file === 'src/worker/sources/types.ts' || file === 'src/worker/sources/index.ts') return null;
  if (under(t, 'src/shared') || under(t, 'config') || t === 'src/worker/sources/types.ts') return null;
  if (imp.typeOnly && under(t, 'src/worker/lib')) return null;
  const rel = file.slice('src/worker/sources/'.length);
  const id = rel.includes('/') ? rel.split('/')[0] : rel.replace(/(?:\.test)?\.ts$/, '');
  if (under(t, `src/worker/sources/${id}`)) return null;
  return 'adapters may import only src/shared/, config/, sources/types.ts and their own helper folder';
}

function boundaryRule(file: string, imp: Imp): string | null {
  const t = imp.target;
  if (t !== null) {
    if (t.startsWith('..')) return 'import escapes the repo';
    if (!/\.[A-Za-z]+$/.test(t)) return 'relative imports need an explicit extension (.ts/.tsx)';
  }
  const test = isTest(file);
  if (test && t !== null && /^migrations\/[^/]+\.sql$/.test(t) && imp.spec.endsWith('?raw')) return null;
  if (under(file, 'config')) {
    if (test) return t && (under(t, 'src/worker') || under(t, 'src/web')) ? 'config tests stay pure' : null;
    if (t === null) return 'config/ may not import packages';
    if (under(t, 'config') || (t === 'src/shared/types.ts' && imp.typeOnly)) return null;
    return 'config/ may import only config/ and `import type` from src/shared/types.ts';
  }
  if (under(file, 'src/shared')) {
    if (t === null) return test ? null : 'src/shared/ may not import packages';
    if (under(t, 'src/shared') || under(t, 'config')) return null;
    return 'src/shared/ may import only src/shared/ and config/';
  }
  if (under(file, 'src/web')) {
    if (t === null) return null;
    if (!(under(t, 'src/web') || under(t, 'src/shared') || under(t, 'config'))) {
      return 'src/web/ may import only src/web/, src/shared/ and config/';
    }
    const feat = /^src\/web\/features\/([^/]+)\//.exec(t)?.[1];
    if (feat && !file.startsWith(`src/web/features/${feat}/`) && t !== `src/web/features/${feat}/index.ts`) {
      return `import feature "${feat}" only through its index.ts`;
    }
    return null;
  }
  if (under(file, 'src/worker')) {
    if (t !== null && under(t, 'src/web')) return 'worker code may not import src/web/';
    if (under(file, 'src/worker/sources')) return adapterRule(file, imp, test);
  }
  return null;
}

function namingRule(path: string): string | null {
  const base = posix.basename(path);
  if (base.endsWith('.tsx')) {
    const stem = base.slice(0, -4);
    if (posix.dirname(path) === 'src/web' || /^[A-Z][A-Za-z0-9]*$/.test(stem)) return null;
    return 'components are PascalCase .tsx';
  }
  if (base.endsWith('.ts')) {
    const stem = base.slice(0, -3).replace(/\.(?:d|test|spec|config)$/, '');
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(stem) ? null : 'files are kebab-case .ts';
  }
  return null;
}

export function checkImports(files: RepoFile[]): Finding[] {
  const found: Finding[] = [];
  for (const f of files) {
    if (!isCode(f.path) || f.text === null || f.path.endsWith('.d.ts') || under(f.path, 'node_modules')) continue;
    const naming = namingRule(f.path);
    if (naming) found.push({ path: f.path, msg: naming });
    const src = stripComments(f.text);
    for (const imp of parseImports(f.path, src)) {
      const msg = boundaryRule(f.path, imp);
      if (msg) found.push({ path: f.path, line: imp.line, msg: `${msg} ('${imp.spec}')` });
    }
    if (under(f.path, 'src') && !under(f.path, 'src/worker/store') && !isTest(f.path)) {
      found.push(...findAll(f.path, src, STORE_ONLY_RE, () => 'only src/worker/store/ touches D1/KV'));
    }
  }
  return found;
}
