// App shell (spec §8.1): Header, route outlet, Footer. Routes other than the briefing are stubs for now.
// Header items still to come: base chip, "I am" chip, units and theme toggles (they need data/settings.ts).
import { globalBadge } from './data/health.ts';
import { offline, serverNow, snapshot } from './data/snapshot.ts';
import { Briefing } from './features/briefing/index.ts';
import { clock, shortDate } from './lib/format.ts';
import { type Route, route } from './router.ts';
import { Attribution } from './ui/Attribution.tsx';
import { FreshnessBadge } from './ui/FreshnessBadge.tsx';

const NAV: { href: string; label: string; name: Route['name'] }[] = [
  { href: '#/', label: 'Briefing', name: 'briefing' },
  { href: '#/wall', label: 'Wall', name: 'wall' },
  { href: '#/tracker', label: 'Tracker', name: 'tracker' },
  { href: '#/settings', label: 'Settings', name: 'settings' },
];
const GLOBAL_LABEL = { green: 'Data OK', amber: 'Data stale', red: 'Data down', grey: 'Off-season' } as const;

function Header({ current }: { current: Route['name'] }) {
  const now = serverNow.value;
  const g = globalBadge.value;
  return (
    <header class="app-header">
      <a class="app-brand" href="#/">
        Utah Snow
      </a>
      <nav class="app-nav" aria-label="Main">
        {NAV.map((n) => (
          <a key={n.name} href={n.href} aria-current={n.name === current ? 'page' : undefined}>
            {n.label}
          </a>
        ))}
      </nav>
      <p class="app-clock">
        <span>{shortDate(now)}</span> <span>{clock(now)}</span>
      </p>
      {g ? <FreshnessBadge badge={g} label={GLOBAL_LABEL[g]} /> : null}
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

function Stub({ title, detail }: { title: string; detail?: string }) {
  return (
    <section class="stub" data-testid="stub" aria-labelledby="stub-title">
      <h1 id="stub-title">{title}</h1>
      <p>{detail ?? 'Not built yet.'}</p>
    </section>
  );
}

function Outlet({ r }: { r: Route }) {
  switch (r.name) {
    case 'briefing':
      return <Briefing />;
    case 'resort':
      return <Stub title={`Resort: ${r.id}`} />;
    case 'wall':
      return <Stub title="Wall" detail={`rotate ${r.params.rotate}s · yt ${r.params.yt}s · set ${r.params.set}`} />;
    case 'tracker':
      return <Stub title="Tracker" />;
    case 'settings':
      return <Stub title="Settings" />;
  }
}

export function App() {
  const r = route.value;
  return (
    <>
      <Header current={r.name} />
      <OfflineBanner />
      <main id="main" class="app-main">
        <Outlet r={r} />
      </main>
      <footer class="app-footer">
        <Attribution />
      </footer>
    </>
  );
}
