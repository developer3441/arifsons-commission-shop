import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import app from '../../src/index'
import { UserRepository } from '../../src/db/repository'

// Issue #15 — Auth, users & RBAC (ADR-0020, ADR-0025). Full stack against
// real Miniflare D1.

const json = (body: unknown, token?: string) => ({
  method: 'POST',
  body: JSON.stringify(body),
  headers: {
    'content-type': 'application/json',
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  },
})

async function login(username: string, password: string) {
  const res = await app.request('/auth/login', json({ username, password }), env)
  return { status: res.status, body: (await res.json()) as { token?: string; user?: unknown; error?: string } }
}

describe('login (issue #15)', () => {
  it('a valid username/password returns a token that reaches the API', async () => {
    await new UserRepository(env.DB).createUser('u-owner-1', 'Umar', 'umar-owner', 'hunter2', 'owner')
    const { status, body } = await login('umar-owner', 'hunter2')

    expect(status).toBe(200)
    expect(body.token).toBeTypeOf('string')
    expect(body.user).toMatchObject({ id: 'u-owner-1', name: 'Umar', role: 'owner' })
  })

  it('an incorrect password is rejected', async () => {
    await new UserRepository(env.DB).createUser('u-owner-2', 'Umar2', 'umar-owner-2', 'correct-password', 'owner')
    const { status } = await login('umar-owner-2', 'wrong-password')
    expect(status).toBe(401)
  })

  it('a deactivated user cannot log in', async () => {
    const repo = new UserRepository(env.DB)
    await repo.createUser('u-deact-1', 'Old Staff', 'old-staff', 'password123', 'bookkeeper')
    await repo.deactivateUser('u-deact-1')
    const { status } = await login('old-staff', 'password123')
    expect(status).toBe(401)
  })
})

describe('RBAC on the Users admin endpoints (issue #15, ADR-0020)', () => {
  it('an Owner-only endpoint refuses a Bookkeeper token (403)', async () => {
    await new UserRepository(env.DB).createUser('u-bk-2', 'Bookkeeper Bob', 'bk-bob', 'password123', 'bookkeeper')
    const { body } = await login('bk-bob', 'password123')

    const res = await app.request('/users', json({ id: 'u-new', name: 'New', username: 'newu', password: 'p', role: 'viewer' }, body.token), env)
    expect(res.status).toBe(403)
  })

  it('refuses an unauthenticated request to the Users endpoint (401)', async () => {
    const res = await app.request('/users', {}, env)
    expect(res.status).toBe(401)
  })

  it('an Owner can create, list, and deactivate users; Bookkeeper/Viewer cannot', async () => {
    await new UserRepository(env.DB).createUser('u-owner-3', 'Owner', 'owner-3', 'ownerpass', 'owner')
    const { body: ownerLogin } = await login('owner-3', 'ownerpass')

    let res = await app.request(
      '/users',
      json({ id: 'u-created', name: 'New Bookkeeper', username: 'new-bk', password: 'p', role: 'bookkeeper' }, ownerLogin.token),
      env,
    )
    expect(res.status).toBe(201)

    res = await app.request('/users', { headers: { authorization: `Bearer ${ownerLogin.token}` } }, env)
    expect(res.status).toBe(200)
    const list = (await res.json()) as { id: string }[]
    expect(list.some((u) => u.id === 'u-created')).toBe(true)

    res = await app.request(
      '/users/u-created/deactivate',
      { method: 'PATCH', headers: { authorization: `Bearer ${ownerLogin.token}` } },
      env,
    )
    expect(res.status).toBe(200)

    // now a Viewer tries the same — refused
    await new UserRepository(env.DB).createUser('u-viewer-1', 'Viewer', 'viewer-1', 'viewpass', 'viewer')
    const { body: viewerLogin } = await login('viewer-1', 'viewpass')
    res = await app.request('/users', { headers: { authorization: `Bearer ${viewerLogin.token}` } }, env)
    expect(res.status).toBe(403)
  })
})

describe('every posting/change-log row records the acting user id (issue #15, ADR-0020)', () => {
  it('an advance posted while authenticated stamps the entry with the actor', async () => {
    await new UserRepository(env.DB).createUser('u-actor-1', 'Actor', 'actor-1', 'password123', 'bookkeeper')
    const { body: loginBody } = await login('actor-1', 'password123')

    await app.request('/accounts/farmers', json({ id: 'farmer-actor-1' }, loginBody.token), env)
    await app.request('/rokar/opening', json({ amount: 100_000 }, loginBody.token), env)
    await app.request(
      '/advances',
      json({ entryId: 'adv-actor-1', farmerId: 'farmer-actor-1', amount: 1_000 }, loginBody.token),
      env,
    )

    const row = await env.DB.prepare(`SELECT actor_user_id FROM entries WHERE id = ?`)
      .bind('adv-actor-1')
      .first<{ actor_user_id: string }>()
    expect(row?.actor_user_id).toBe('u-actor-1')
  })
})
