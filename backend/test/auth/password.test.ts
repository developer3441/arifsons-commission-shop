import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword } from '../../src/auth/password'

// Issue #15 — password hashing (ADR-0025): PBKDF2-SHA256 via Web Crypto, no
// plaintext ever stored.

describe('hashPassword / verifyPassword', () => {
  it('a correct password verifies against its own hash', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true)
  })

  it('an incorrect password fails to verify', async () => {
    const hash = await hashPassword('correct horse battery staple')
    expect(await verifyPassword('wrong password', hash)).toBe(false)
  })

  it('the stored hash never contains the plaintext password', async () => {
    const password = 'super-secret-p@ssw0rd'
    const hash = await hashPassword(password)
    expect(hash).not.toContain(password)
  })

  it('hashing the same password twice yields different stored hashes (random salt)', async () => {
    const hash1 = await hashPassword('same-password')
    const hash2 = await hashPassword('same-password')
    expect(hash1).not.toBe(hash2)
    expect(await verifyPassword('same-password', hash1)).toBe(true)
    expect(await verifyPassword('same-password', hash2)).toBe(true)
  })

  it('a malformed stored hash fails closed rather than throwing', async () => {
    expect(await verifyPassword('anything', 'not-a-valid-hash')).toBe(false)
  })
})
