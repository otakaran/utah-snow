// Pure core of the cam drift check (scripts/drift-check.ts): per-site set diffs and the markdown report. No I/O.

/** One comparison of what config/ expects with what the live page shows. */
export interface SetCheck {
  what: string; // 'HDRelay player GUIDs'
  expected: readonly string[];
  live: readonly string[];
  /** The page shows only part of the registry (UDOT): values in config but not on the page are fine. */
  subset?: boolean;
  /** Printed after a value: its cam id, YouTube title or UDOT alt text. */
  labels?: Readonly<Record<string, string>>;
}

export interface SiteResult {
  site: string;
  url: string;
  /** The host blocked or failed the runner: nothing was compared and the site never fails the run. */
  unreachable?: string;
  checks: SetCheck[];
  /** Mismatches that are not set diffs (a player GUID answering 404, a moved milepost). Each one is drift. */
  problems: string[];
  /** Context only; never drift. */
  notes: string[];
}

export const newSite = (site: string, url: string): SiteResult => ({ site, url, checks: [], problems: [], notes: [] });

export function diffSet(c: SetCheck): { missing: string[]; extra: string[] } {
  const expected = new Set(c.expected);
  const live = new Set(c.live);
  return {
    missing: c.subset ? [] : [...expected].filter((v) => !live.has(v)).sort(),
    extra: [...live].filter((v) => !expected.has(v)).sort(),
  };
}

export function drifted(r: SiteResult): boolean {
  if (r.unreachable) return false;
  if (r.problems.length > 0) return true;
  return r.checks.some((c) => {
    const d = diffSet(c);
    return d.missing.length + d.extra.length > 0;
  });
}

const show = (c: SetCheck, v: string): string => {
  const label = c.labels?.[v];
  return label ? `\`${v}\` (${label})` : `\`${v}\``;
};

function checkLines(c: SetCheck): string[] {
  if (c.live.length === 0 && (c.subset || c.expected.length === 0)) return [];
  const { missing, extra } = diffSet(c);
  const live = new Set(c.live).size;
  const expected = new Set(c.expected).size;
  const head = c.subset
    ? `${live} on the page, ${live - extra.length} of them in config`
    : `${expected - missing.length} of ${expected} match`;
  const lines = [`- ${c.what}: ${head}`];
  if (extra.length > 0) lines.push(`  - on the page, not in config: ${extra.map((v) => show(c, v)).join(', ')}`);
  if (missing.length > 0) lines.push(`  - in config, not on the page: ${missing.map((v) => show(c, v)).join(', ')}`);
  return lines;
}

function siteLines(r: SiteResult): string[] {
  const state = r.unreachable ? `unreachable (${r.unreachable})` : drifted(r) ? 'drift' : 'ok';
  const lines = ['', `## ${r.site}: ${state}`, '', `<${r.url}>`];
  if (r.unreachable) return lines;
  lines.push('');
  for (const p of r.problems) lines.push(`- **${p}**`);
  for (const c of r.checks) lines.push(...checkLines(c));
  for (const n of r.notes) lines.push(`- note: ${n}`);
  return lines;
}

/** The markdown report; `drift` decides the exit code. Unreachable sites are listed but never drift. */
export function renderReport(results: readonly SiteResult[], checkedAt: string): { markdown: string; drift: boolean } {
  const bad = results.filter(drifted).map((r) => r.site);
  const down = results.filter((r) => r.unreachable).map((r) => r.site);
  const lines = [`# Cam drift: ${bad.length > 0 ? `drift at ${bad.join(', ')}` : 'no drift'}`, ''];
  lines.push(`Checked ${checkedAt} against config/cams/ and config/youtube.ts.`);
  if (down.length > 0) lines.push(`Unreachable from this runner (not checked): ${down.join(', ')}.`);
  for (const r of results) lines.push(...siteLines(r));
  return { markdown: `${lines.join('\n')}\n`, drift: bad.length > 0 };
}
