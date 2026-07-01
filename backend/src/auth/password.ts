// Password hashing (ADR-0025): PBKDF2-SHA256 via Web Crypto, available natively
// in the Workers runtime (`crypto.subtle`) — no extra dependency. No plaintext
// password is ever stored, only `salt:hash`, both hex-encoded.

const ITERATIONS = 100_000
const KEY_LENGTH_BITS = 256
const SALT_BYTES = 16

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return [...arr].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  }
  return bytes
}

async function deriveHash(password: string, salt: Uint8Array): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  )
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations: ITERATIONS, hash: 'SHA-256' },
    keyMaterial,
    KEY_LENGTH_BITS,
  )
  return toHex(bits)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/** Hash a password for storage: `salt:hash`, both hex. */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES))
  const hash = await deriveHash(password, salt)
  return `${toHex(salt)}:${hash}`
}

/** Verify a password against a stored `salt:hash`. Fails closed on a malformed stored value. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(':')
  if (parts.length !== 2) return false
  const [saltHex, hashHex] = parts
  if (!saltHex || !hashHex || !/^[0-9a-f]+$/i.test(saltHex)) return false
  const candidate = await deriveHash(password, fromHex(saltHex))
  return timingSafeEqual(candidate, hashHex)
}
