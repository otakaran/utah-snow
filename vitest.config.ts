import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          environment: 'node',
          include: [
            'src/shared/**/*.test.ts',
            'src/worker/sources/**/*.test.ts',
            'src/worker/lib/**/*.test.ts',
            'config/**/*.test.ts',
            'src/web/**/*.test.ts',
            'scripts/**/*.test.ts',
          ],
        },
      },
      {
        plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
        // Vitest 5's default fs module cache is unreadable from workerd (plugin 1.4.0): "readAll .vitest-cache/...".
        test: {
          name: 'worker',
          include: ['src/worker/{api,cron,frames}/**/*.test.ts', 'src/worker/*.test.ts'],
          fsModuleCache: false,
        },
      },
    ],
    passWithNoTests: true,
  },
});
