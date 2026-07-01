// Runs before the integration tests: applies the generated D1 migrations to the
// isolated test database so tables exist before the app touches them.
import { applyD1Migrations, env } from 'cloudflare:test'

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS)
