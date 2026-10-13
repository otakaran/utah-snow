import { execSync } from 'node:child_process';
import { cloudflare } from '@cloudflare/vite-plugin';
import preact from '@preact/preset-vite';
import { defineConfig } from 'vite';

function buildId(command: string): string {
  if (command === 'serve') return 'dev';
  const sha = process.env.GITHUB_SHA;
  if (sha) return sha.slice(0, 7);
  try {
    return execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim();
  } catch {
    return 'dev';
  }
}

export default defineConfig(({ command }) => ({
  plugins: [preact(), cloudflare()],
  define: { __BUILD_ID__: JSON.stringify(buildId(command)) },
}));
