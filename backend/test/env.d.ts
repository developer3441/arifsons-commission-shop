/// <reference types="@cloudflare/vitest-pool-workers/types" />
import type { D1Migration } from '@cloudflare/vitest-pool-workers'

// The test env (from 'cloudflare:test') is typed by Cloudflare.Env. Declare the
// bindings our tests use: the D1 database and the migrations we inject.
declare global {
  namespace Cloudflare {
    interface Env {
      DB: D1Database
      TEST_MIGRATIONS: D1Migration[]
      AUTH_SECRET: string
      BACKUP_BUCKET: R2Bucket
    }
  }
}

export {}
