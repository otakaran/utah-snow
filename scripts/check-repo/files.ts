import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

export interface RepoFile {
  path: string; // repo-relative, posix
  size: number;
  text: string | null; // null for binary files
}

export interface Finding {
  path: string;
  line?: number;
  msg: string;
  warn?: boolean;
}

// Tracked files plus untracked files that are not gitignored (so node_modules, dist,
// .wrangler, design-sprint/ and .dev.vars are skipped unless someone force-adds them).
export function listFiles(root: string): RepoFile[] {
  const out = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const paths = [...new Set(out.split('\0').filter(Boolean))].sort();
  const files: RepoFile[] = [];
  for (const path of paths) {
    const abs = `${root}/${path}`;
    if (!existsSync(abs)) continue; // deleted in the working tree
    const buf = readFileSync(abs);
    const binary = buf.subarray(0, 8000).includes(0);
    files.push({ path, size: buf.length, text: binary ? null : buf.toString('utf8') });
  }
  return files;
}

export const under = (path: string, dir: string): boolean => path === dir || path.startsWith(`${dir}/`);

export const isTest = (path: string): boolean => /\.(?:test|spec)\.tsx?$/.test(path);

export const isCode = (path: string): boolean => /\.(?:ts|tsx|js|mjs)$/.test(path);

export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

// Blanks comments but keeps line numbers. Heuristic: `//` after `:` or a quote is kept (URLs).
export function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' ')).replace(/(^|[^:'"`\\])\/\/[^\n]*/gm, '$1');
}

export function findAll(path: string, text: string, re: RegExp, msg: (m: RegExpExecArray) => string): Finding[] {
  const found: Finding[] = [];
  for (const m of text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))) {
    found.push({ path, line: lineAt(text, m.index), msg: msg(m as RegExpExecArray) });
  }
  return found;
}
