import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      { test: { name: 'unit', include: ['packages/*/test/**/*.test.ts', 'scripts/**/*.test.ts'] } },
      {
        test: {
          name: 'server',
          include: ['apps/*/test/**/*.test.ts'],
          globalSetup: 'vitest.redis-setup.ts',
          testTimeout: 300_000,
        },
      },
    ],
  },
})
