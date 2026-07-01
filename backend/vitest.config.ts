import path from 'node:path'
import { defineConfig } from 'vitest/config'
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'

// Tests run inside the real Workers runtime (workerd) against Miniflare's D1, so
// integration tests exercise the same runtime we deploy to. Pure domain tests run
// here too — they just don't touch the DB. Generated migrations are loaded here and
// applied per test database via test/apply-migrations.ts.
export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(__dirname, 'drizzle/migrations'))

  return {
    plugins: [
      cloudflareTest({
        singleWorker: true,
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: { TEST_MIGRATIONS: migrations },
        },
      }),
    ],
    test: {
      include: ['test/**/*.test.ts'],
      setupFiles: ['./test/apply-migrations.ts'],
    },
  }
})
