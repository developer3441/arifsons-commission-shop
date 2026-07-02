#!/usr/bin/env node
// One-off bootstrap: create the first Owner account for SplitEase.
//
// There is no seeded default login. POST /users (ADR-0020) itself requires
// an existing Owner to call it, so the very first account can't be created
// through the API — it has to be inserted directly into D1.
//
// Usage (from the backend/ directory):
//   node scripts/create-owner.mjs <id> <name> <username> <password> [--local]
//
// Example:
//   node scripts/create-owner.mjs owner-1 "Arif" arif MySecurePass123
//
// `npm run dev` runs `wrangler dev --remote`, so this targets --remote by
// default (the real D1 database). Pass --local to target the local D1
// simulator instead. Once this first Owner exists, use the app's Users
// screen (or POST /users) to create everyone else.

import { pbkdf2Sync, randomBytes } from 'node:crypto'
import { execSync } from 'node:child_process'

const [id, name, username, password, mode] = process.argv.slice(2)

if (!id || !name || !username || !password) {
  console.error('Usage: node scripts/create-owner.mjs <id> <name> <username> <password> [--local]')
  process.exit(1)
}

// Must match backend/src/auth/password.ts exactly: PBKDF2-SHA256,
// 100,000 iterations, 256-bit key, stored as hex `salt:hash`.
const ITERATIONS = 100_000
const KEY_LENGTH_BYTES = 32

const salt = randomBytes(16)
const hash = pbkdf2Sync(password, salt, ITERATIONS, KEY_LENGTH_BYTES, 'sha256')
const passwordHash = `${salt.toString('hex')}:${hash.toString('hex')}`

const esc = (s) => s.replace(/'/g, "''")
const sql = `INSERT INTO users (id, name, username, password_hash, role, active) VALUES ('${esc(id)}', '${esc(name)}', '${esc(username)}', '${passwordHash}', 'owner', 1);`

const target = mode === '--local' ? '--local' : '--remote'

console.log('SQL to run:\n')
console.log(sql)
console.log(`\nRunning: wrangler d1 execute splitease ${target} --command "..."\n`)

try {
  execSync(`wrangler d1 execute splitease ${target} --command "${sql.replace(/"/g, '\\"')}"`, {
    stdio: 'inherit',
  })
  console.log(`\nDone. Log in at /login with username "${username}" and the password you passed in.`)
} catch {
  console.error('\nCould not run wrangler automatically — copy the SQL above and run it yourself, e.g.:')
  console.error(`  wrangler d1 execute splitease ${target} --command "<SQL above>"`)
}
