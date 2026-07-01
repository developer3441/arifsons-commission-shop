import { defineConfig } from 'drizzle-kit'

// Migrations are the schema source of truth (ADR-0014); generated SQL lands in
// drizzle/migrations and is applied to D1 (local dev, tests, and deploy).
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
})
