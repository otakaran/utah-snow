// Entry: styles, router, data stores, then render the shell (spec §8.1, §8.8).
import { render } from 'preact';
import './styles/tokens.css';
import './styles/base.css';
import { App } from './app.tsx';
import { startHealth } from './data/health.ts';
import { startSnapshot } from './data/snapshot.ts';
import { route, startRouter } from './router.ts';

startRouter();
startSnapshot(() => (route.peek().name === 'wall' ? 60_000 : 120_000));
startHealth();

const root = document.getElementById('app');
if (root) render(<App />, root);
