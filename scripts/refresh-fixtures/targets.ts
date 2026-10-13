// Which job fills which fixture folder (src/worker/sources/fixtures/<dir>/), and CLI name resolution.
import type { Source } from '../../src/worker/sources/types.ts';
import { JOBS } from '../lib/jobs.ts';

/** Their fixtures are response sequences the tests replay through fetch(), not Raw payloads: refreshed by hand. */
export const REPLAYED: ReadonlySet<string> = new Set(['stake-alta', 'stake-skiutah', 'youtube']);
const DIRS: Readonly<Record<string, string>> = {
  avy: 'avalanche',
  'resort:solitude': 'mtnpowder',
  'resort:deer-valley': 'mtnpowder',
};
const ONE_JOB_DIRS: ReadonlySet<string> = new Set(['nws-grid']); // 12 grids, one parser: the folder name takes the first

export interface Target {
  src: Source;
  dir: string;
  suffix: string; // '-solitude', '-alta-base' where several jobs share the folder
}

const dirOf = (id: string): string =>
  DIRS[id] ?? (id.startsWith('nws-grid:') ? 'nws-grid' : id.replace(/^resort:/, ''));

function target(src: Source): Target {
  const dir = dirOf(src.id);
  const shared = JOBS.filter((s) => dirOf(s.id) === dir).length > 1;
  return { src, dir, suffix: shared ? `-${src.id.split(':').slice(1).join('-')}` : '' };
}

/** Folder names and/or job ids -> targets; no names = every refreshable folder. Throws on an unknown name. */
export function resolveTargets(names: readonly string[]): Target[] {
  const all = JOBS.filter((s) => !REPLAYED.has(s.id)).map(target);
  const byDir = (dir: string) => {
    const hits = all.filter((t) => t.dir === dir);
    return ONE_JOB_DIRS.has(dir) ? hits.slice(0, 1) : hits;
  };
  if (names.length === 0) return [...new Set(all.map((t) => t.dir))].flatMap(byDir);
  return names.flatMap((name) => {
    if (REPLAYED.has(name)) throw new Error(`${name}: its fixtures are replayed response sequences; edit them by hand`);
    const job = all.find((t) => t.src.id === name);
    const found = job ? [job] : byDir(name);
    if (found.length === 0) {
      throw new Error(
        `unknown target '${name}': use a folder (${[...new Set(all.map((t) => t.dir))].join(', ')}) or a job id`,
      );
    }
    return found;
  });
}
