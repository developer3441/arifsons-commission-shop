// Signed bearer tokens (ADR-0025): base64url(header).base64url(payload).base64url(hmac-sha256).
// Stateless — verification only needs AUTH_SECRET, never a server-side session store.

export type Role = 'owner' | 'bookkeeper' | 'viewer'

export interface TokenPayload {
  sub: string // user id
  role: Role
  iat: number // issued-at, unix seconds
  exp: number // expiry, unix seconds
}

const HEADER = { alg: 'HS256', typ: 'JWT' }
const TOKEN_TTL_SECONDS = 24 * 60 * 60 // ADR-0025: 24h

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  for (const byte of arr) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function base64urlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/').padEnd(s.length + ((4 - (s.length % 4)) % 4), '=')
  const binary = atob(padded)
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

function encodeJson(obj: unknown): string {
  return base64url(new TextEncoder().encode(JSON.stringify(obj)))
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

/** Issue a signed token for a user. `nowSeconds` is overridable for tests. */
export async function issueToken(
  userId: string,
  role: Role,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<string> {
  const payload: TokenPayload = { sub: userId, role, iat: nowSeconds, exp: nowSeconds + TOKEN_TTL_SECONDS }
  const unsigned = `${encodeJson(HEADER)}.${encodeJson(payload)}`
  const key = await hmacKey(secret)
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(unsigned))
  return `${unsigned}.${base64url(signature)}`
}

export interface VerifiedToken {
  valid: boolean
  payload?: TokenPayload
  reason?: string
}

/** Verify a token's signature and expiry. Fails closed on any malformed input. */
export async function verifyToken(
  token: string,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): Promise<VerifiedToken> {
  const parts = token.split('.')
  if (parts.length !== 3) return { valid: false, reason: 'malformed token' }
  const [headerB64, payloadB64, sigB64] = parts as [string, string, string]

  let sigBytes: Uint8Array
  let payload: TokenPayload
  try {
    sigBytes = base64urlToBytes(sigB64)
    payload = JSON.parse(new TextDecoder().decode(base64urlToBytes(payloadB64))) as TokenPayload
  } catch {
    return { valid: false, reason: 'malformed token' }
  }

  const key = await hmacKey(secret)
  const unsigned = `${headerB64}.${payloadB64}`
  const ok = await crypto.subtle.verify('HMAC', key, sigBytes as BufferSource, new TextEncoder().encode(unsigned))
  if (!ok) return { valid: false, reason: 'bad signature' }
  if (payload.exp < nowSeconds) return { valid: false, reason: 'expired' }
  return { valid: true, payload }
}
