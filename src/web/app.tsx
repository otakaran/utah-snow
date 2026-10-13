// App shell (spec §8.1): Header, route outlet, Footer.
// Header order: brand, Denver date + clock, global freshness dot (tap: every source with its age), base chip,
// "I am" chip, then units + theme (inside the ⋯ popover under 600 px), and the nav row.

import type { ComponentChildren } from 'preact';
import { useErrorBoundary } from 'preact/hooks';
import { ageMin, type Badge, badge } from '../shared/freshness.ts';
import { CLIENT_BUILD, globalBadge, sources } from './data/health.ts';
import { offline, serverNow, snapshot } from './data/snapshot.ts';
import { Briefing } from './features/briefing/index.ts';
import { CamsPage } from './features/cams/index.ts';
import { crewPick } from './features/pick-card/index.ts';
import { Resort } from './features/resort/index.ts';
import { BaseChip, IAmChip, Settings, ThemeToggle, UnitsToggle } from './features/settings/index.ts';
import { TrackerPage } from './features/tracker/index.ts';
import { clock, shortDate, tzAbbr } from './lib/format.ts';
import { type Route, type RouteName, route } from './router.ts';
import { Attribution } from './ui/Attribution.tsx';
import { FreshnessBadge } from './ui/FreshnessBadge.tsx';
import { Icon } from './ui/Icon.tsx';
import { SourceList, type SourceRow } from './ui/SourceList.tsx';

const NAV: { href: string; label: string; name: RouteName }[] = [
  { href: '#/', label: 'Briefing', name: 'briefing' },
  { href: '#/cams', label: 'Cams', name: 'cams' },
  { href: '#/tracker', label: 'Tracker', name: 'tracker' },
  { href: '#/settings', label: 'Settings', name: 'settings' },
  { href: '#/wall', label: 'Wall', name: 'wall' },
];
const GLOBAL_LABEL: Record<Badge, string> = {
  green: 'Data OK',
  amber: 'Data stale',
  red: 'Data down',
  grey: 'Off-season',
};
const RANK: Record<Badge, number> = { red: 0, amber: 1, green: 2, grey: 3 };

function GlobalFreshness({ now }: { now: number }) {
  const g = globalBadge.value;
  const rows: SourceRow[] = sources.value
    .map((m) => ({ id: m.source, badge: badge(m, now), age: ageMin(m, now), error: m.error }))
    .sort((a, b) => RANK[a.badge] - RANK[b.badge] || (a.id < b.id ? -1 : 1));
  return (
    <>
      <button type="button" class="hdr-fresh" popovertarget="fresh-pop" data-testid="global-fresh">
        <FreshnessBadge badge={g ?? 'grey'} label={g ? GLOBAL_LABEL[g] : 'No data yet'} />
      </button>
      <div id="fresh-pop" popover="auto" class="pop">
        <p class="pop-title">Sources · worst first</p>
        <SourceList rows={rows} />
      </div>
    </>
  );
}

function Header({ current, now }: { current: RouteName; now: number }) {
  return (
    <header class="app-header">
      <div class="hdr-row">
        <a class="app-brand" href="#/" aria-label="Utah Snow, briefing">
          <Icon name="mountain" size={24} />
          <span class="brand-word">
            <b>Utah</b> Snow
          </span>
        </a>
        <p class="app-clock" data-testid="header-clock">
          <span class="clock-time num">{clock(now)}</span>
          <span class="clock-date">
            {shortDate(now)}
            <span class="clock-tz"> · {tzAbbr(now)}</span>
          </span>
        </p>
        <GlobalFreshness now={now} />
        <BaseChip />
        <IAmChip />
        <button type="button" class="hdr-more btn-icon" popovertarget="hdr-menu" aria-label="Units and theme">
          <Icon name="more" />
        </button>
        <div id="hdr-menu" popover="auto" class="hdr-menu">
          <UnitsToggle />
          <ThemeToggle />
        </div>
      </div>
      <nav class="app-nav" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.name} href={n.href} aria-current={n.name === current ? 'page' : undefined}>
            {n.label}
          </a>
        ))}
      </nav>
    </header>
  );
}

function OfflineBanner() {
  if (!offline.value) return null;
  const snap = snapshot.value;
  return (
    <p class="app-banner" role="status">
      {snap ? `Offline – showing data from ${clock(snap.generatedAt)}` : 'Offline – no data yet'}
    </p>
  );
}

function Stub({ testid, title, detail }: { testid: string; title: string; detail: string }) {
  return (
    <section class="stub" data-testid={testid} aria-labelledby={`${testid}-title`}>
      <p class="stub-kicker">Coming soon</p>
      <h1 id={`${testid}-title`}>{title}</h1>
      <p>{detail}</p>
      <a class="btn" href="#/">
        Back to the briefing
      </a>
    </section>
  );
}

/** Keeps a crash inside one page from blanking the whole app; keyed per route so navigating resets it. */
function RouteBoundary({ children }: { children: ComponentChildren }) {
  const [error] = useErrorBoundary((err: unknown) => console.error('route render failed', err));
  if (!error) return <>{children}</>;
  return (
    <section class="stub" data-testid="route-error" role="alert" aria-labelledby="route-error-title">
      <p class="stub-kicker">Something broke</p>
      <h1 id="route-error-title">This page hit an error</h1>
      <p>{error instanceof Error ? error.message : String(error)}</p>
      <button type="button" class="btn" onClick={() => location.reload()}>
        Reload
      </button>
    </section>
  );
}

function Outlet({ r }: { r: Route }) {
  switch (r.name) {
    case 'briefing':
      return <Briefing />;
    case 'settings':
      return <Settings />;
    case 'resort':
      return <Resort id={r.id} />;
    case 'cams': // ★ on the crew pick's cams, as on the briefing and resort pages
      return <CamsPage pick={crewPick.value?.pick ?? null} />;
    case 'tracker':
      return <TrackerPage />;
    case 'wall': // TODO(assemble): features/wall (§8.4); render it without the header and footer
      return (
        <Stub
          testid="wall-stub"
          title="TV wall"
          detail={`Stake cams, pick and roads for the TV. Set ${r.params.set}, page every ${r.params.rotate} s.`}
        />
      );
  }
}

// A '#main' link would be read as a route, so the skip control focuses <main> directly.
function skipToMain() {
  document.getElementById('main')?.focus();
}

export function App() {
  const r = route.value;
  const now = serverNow.value;
  return (
    <>
      <button type="button" class="skip-link" onClick={skipToMain}>
        Skip to content
      </button>
      <Header current={r.name} now={now} />
      <OfflineBanner />
      <main id="main" class="app-main" tabIndex={-1}>
        <RouteBoundary key={r.name === 'resort' ? `resort:${r.id}` : r.name}>
          <Outlet r={r} />
        </RouteBoundary>
      </main>
      <footer class="app-footer" data-testid="footer">
        <Attribution build={CLIENT_BUILD} />
      </footer>
    </>
  );
}
