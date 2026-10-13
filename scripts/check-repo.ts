// Repo rules (pnpm check, step 1). Run with plain node: `node scripts/check-repo.ts`.
// Scans git-tracked and untracked-but-not-ignored files. Exits 1 on any error; size warnings do not fail.
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { type Finding, listFiles } from './check-repo/files.ts';
import { checkImports } from './check-repo/imports.ts';
import { checkColors, checkSecrets, checkSizes, checkTests, checkTime, checkTracked } from './check-repo/rules.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const files = listFiles(root);

const rules: [string, (f: typeof files) => Finding[]][] = [
  ['size', checkSizes],
  ['imports', checkImports],
  ['time', checkTime],
  ['tests', checkTests],
  ['tracked', checkTracked],
  ['secrets', checkSecrets],
  ['colors', checkColors],
];

let errors = 0;
let warnings = 0;
for (const [name, rule] of rules) {
  for (const f of rule(files)) {
    const where = f.line ? `${f.path}:${f.line}` : f.path;
    if (f.warn) {
      warnings++;
      console.warn(`warn  [${name}] ${where} ${f.msg}`);
    } else {
      errors++;
      console.error(`error [${name}] ${where} ${f.msg}`);
    }
  }
}

console.log(`check-repo: ${files.length} files, ${errors} error(s), ${warnings} warning(s)`);
if (errors > 0) process.exit(1);
