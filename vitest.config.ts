import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['packages/*/test/**/*.test.ts', 'scripts/**/*.test.ts'] } },
      {
        test: {
          name: 'server',
          include: ['apps/*/test/**/*.test.ts'],
          exclude: [...configDefaults.exclude, 'apps/web/**'],
          globalSetup: 'vitest.redis-setup.ts',
          testTimeout: 300_000,
        },
      },
      {
        extends: 'apps/web/vite.config.ts',
        test: {
          name: 'web',
          root: 'apps/web',
          environment: 'jsdom',
          include: ['test/**/*.test.{ts,tsx}'],
          setupFiles: ['test/setup.ts'],
          css: true, // jsdom getComputedStyle needs the real stylesheets
        },
      },
    ],
  },
})
