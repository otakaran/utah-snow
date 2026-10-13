// Entry (spec §8.1, §8.4, §8.6, §8.8): redeploy guard, router, data stores (snapshot, health, tracker), theme sync,
// then render the shell.
import { effect } from '@preact/signals';
import { render } from 'preact';
import './styles/fonts.css';
import './styles/tokens.css';
import './styles/base.css';
import './ui/ui.css';
import './ui/forms.css';
import './ui/overlays.css';
import './ui/shell.css';
import { App } from './app.tsx';
import { health, startHealth } from './data/health.ts';
import { resolvedTheme, wallDefaults } from './data/settings.ts';
import { startSnapshot } from './data/snapshot.ts';
import { startTracker } from './data/tracker.ts';
import { noteBuild, startBuildGuard } from './lib/build-guard.ts';
import { route, startRouter } from './router.ts';

startBuildGuard();
startRouter(() => wallDefaults.peek());
startSnapshot(() => (route.peek().name === 'wall' ? 60_000 : 120_000));
startHealth();
startTracker(); // crew + ski days feed the pick on every page (10 min; 30 s while #/tracker is open)

// /api/health reports the Worker's build id; a mismatch means a redeploy happened (reload rules in build-guard.ts).
effect(() => noteBuild(health.value?.version));

// <html data-theme> follows settings (auto resolved via matchMedia); the wall is always dark and wall-scaled.
effect(() => {
  const root = document.documentElement;
  const wall = route.value.name === 'wall';
  root.dataset.theme = wall ? 'dark' : resolvedTheme.value;
  if (wall) root.dataset.scale = 'wall';
  else delete root.dataset.scale;
});

const root = document.getElementById('app');
if (root) render(<App />, root);
