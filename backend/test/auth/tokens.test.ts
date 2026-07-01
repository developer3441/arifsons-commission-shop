import { describe, it, expect } from 'vitest'
import { issueToken, verifyToken } from '../../src/auth/tokens'

// Issue #15 — signed bearer tokens (ADR-0025): stateless HMAC-SHA256, 24h TTL.

const SECRET = 'test-secret-do-not-use-in-prod'

describe('issueToken / verifyToken', () => {
  it('a freshly issued token verifies and carries the right subject and role', async () => {
    const token = await issueToken('user-1', 'owner', SECRET)
    const result = await verifyToken(token, SECRET)
    expect(result.valid).toBe(true)
    expect(result.payload?.sub).toBe('user-1')
    expect(result.payload?.role).toBe('owner')
  })

  it('a token signed with a different secret fails verification', async () => {
    const token = await issueToken('user-1', 'owner', SECRET)
    const result = await verifyToken(token, 'a-different-secret')
    expect(result.valid).toBe(false)
  })

  it('a tampered payload fails verification', async () => {
    const token = await issueToken('user-1', 'viewer', SECRET)
    const [header, , sig] = token.split('.')
    const raw = JSON.stringify({ sub: 'user-1', role: 'owner', iat: 0, exp: 9_999_999_999 })
    const tamperedPayload = btoa(raw).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    const tampered = `${header}.${tamperedPayload}.${sig}`
    const result = await verifyToken(tampered, SECRET)
    expect(result.valid).toBe(false)
  })

  it('an expired token fails verification', async () => {
    const issuedLongAgo = 1_000_000 // unix seconds, way in the past
    const token = await issueToken('user-1', 'bookkeeper', SECRET, issuedLongAgo)
    const result = await verifyToken(token, SECRET, issuedLongAgo + 25 * 60 * 60) // 25h later
    expect(result.valid).toBe(false)
    expect(result.reason).toMatch(/expired/i)
  })

  it('a malformed token fails closed', async () => {
    const result = await verifyToken('not-a-real-token', SECRET)
    expect(result.valid).toBe(false)
  })
})
