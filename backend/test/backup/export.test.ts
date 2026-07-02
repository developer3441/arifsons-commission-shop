import { env, createScheduledController, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import worker from '../../src/index'
import { UserRepository } from '../../src/db/repository'
import { buildBackupSnapshot, backupObjectKey, runDailyBackup } from '../../src/backup/export'

// Issue #32 — the daily D1 -> R2 backup export (ADR-0024). Programmatic
// only: a Cron-triggered worker exports every table as one JSON snapshot,
// restorable by replay (ADR-0021). No HTTP route, no screen.

const json = (body: unknown, token?: string) => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
})

async function login(id: string): Promise<string> {
  await new UserRepository(env.DB).createUser(id, 'Staff', `staff-${id}`, 'password123', 'bookkeeper')
  const res = await worker.request('/auth/login', json({ username: `staff-${id}`, password: 'password123' }), env)
  const { token } = (await res.json()) as { token: string }
  return token
}

describe('backupObjectKey', () => {
  it('is one object per calendar day (UTC)', () => {
    expect(backupObjectKey(new Date('2026-07-02T13:45:00Z'))).toBe('backups/2026-07-02.json')
    expect(backupObjectKey(new Date('2026-07-02T23:59:59Z'))).toBe('backups/2026-07-02.json') // same day, same key
    expect(backupObjectKey(new Date('2026-07-03T00:00:01Z'))).toBe('backups/2026-07-03.json') // next day, new key
  })
})

describe('buildBackupSnapshot', () => {
  it('captures every table — the append-only stream plus the supporting state that is not a projection of it', async () => {
    const token = await login('backup-1')
    await worker.request('/rokar/opening', json({ amount: 100_000 }, token), env)
    await worker.request('/advances', json({ entryId: 'adv-backup-1', farmerId: 'farmer-backup-1', amount: 25_000 }, token), env)
    await worker.request('/contacts', json({ id: 'buyer-backup-1', kind: 'pakka' }, token), env)

    const snapshot = await buildBackupSnapshot(env.DB, new Date('2026-07-02T20:00:00Z'))

    expect(snapshot.exportedAt).toBe('2026-07-02T20:00:00.000Z')
    expect(snapshot.tables.entries.some((e) => e.id === 'adv-backup-1')).toBe(true)
    expect(snapshot.tables.postings.some((p) => p.entryId === 'adv-backup-1')).toBe(true)
    expect(snapshot.tables.accounts.some((a) => a.id === 'buyer-backup-1')).toBe(true)
    expect(snapshot.tables.accounts.some((a) => a.id === 'farmer-backup-1')).toBe(true)
    expect(snapshot.tables.users.some((u) => u.username === 'staff-backup-1')).toBe(true)
  })
})

describe('runDailyBackup', () => {
  it('writes a complete, valid, restorable JSON snapshot to R2 at the day-keyed object', async () => {
    const token = await login('backup-2')
    await worker.request('/rokar/opening', json({ amount: 50_000 }, token), env)
    await worker.request('/advances', json({ entryId: 'adv-backup-2', farmerId: 'farmer-backup-2', amount: 10_000 }, token), env)

    const now = new Date('2026-07-02T20:00:00Z')
    const { key, bytes } = await runDailyBackup(env.DB, env.BACKUP_BUCKET, now)

    expect(key).toBe('backups/2026-07-02.json')
    expect(bytes).toBeGreaterThan(0)

    const object = await env.BACKUP_BUCKET.get(key)
    expect(object).not.toBeNull()
    const restored = (await object!.json()) as {
      exportedAt: string
      tables: { entries: { id: string }[]; postings: { entryId: string }[] }
    }
    expect(restored.exportedAt).toBe('2026-07-02T20:00:00.000Z')
    expect(restored.tables.entries.some((e) => e.id === 'adv-backup-2')).toBe(true)
    expect(restored.tables.postings.some((p) => p.entryId === 'adv-backup-2')).toBe(true)
  })

  it('a same-day re-run overwrites the same object rather than duplicating it', async () => {
    const now = new Date('2026-07-05T20:00:00Z')
    const first = await runDailyBackup(env.DB, env.BACKUP_BUCKET, now)
    const second = await runDailyBackup(env.DB, env.BACKUP_BUCKET, now)
    expect(second.key).toBe(first.key)

    const listing = await env.BACKUP_BUCKET.list({ prefix: 'backups/2026-07-05' })
    expect(listing.objects).toHaveLength(1) // overwritten, not duplicated
  })
})

describe('the scheduled() handler (a manual/test invocation, per issue #32)', () => {
  it('runs the backup and produces a valid export object in R2', async () => {
    const token = await login('backup-3')
    await worker.request('/rokar/opening', json({ amount: 20_000 }, token), env)

    const controller = createScheduledController({ scheduledTime: new Date('2026-07-06T20:00:00Z').getTime() })
    const ctx = createExecutionContext()
    await worker.scheduled(controller, env, ctx)
    await waitOnExecutionContext(ctx)

    // The handler uses `new Date()` internally (not the controller's
    // scheduledTime) for the object key — assert an object landed under
    // today's UTC date instead of a fixed key.
    const todayKey = `backups/${new Date().toISOString().slice(0, 10)}.json`
    const object = await env.BACKUP_BUCKET.get(todayKey)
    expect(object).not.toBeNull()
    const restored = (await object!.json()) as { tables: { users: { username: string }[] } }
    expect(restored.tables.users.some((u) => u.username === 'staff-backup-3')).toBe(true)
  })
})
