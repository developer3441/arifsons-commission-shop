// Minimal typed client for the walking skeleton. ADR-0016 makes the backend's
// OpenAPI spec the contract; generating this client from that spec is the
// fast-follow — for now these few calls are hand-written against it.
//
// Issue #15: every data call attaches the bearer token (ADR-0025) from
// wherever it's currently stored (see auth.tsx).

const BASE = '/api'

let currentToken: string | null = null

/** Set (or clear) the token every subsequent request attaches. auth.tsx owns this. */
export function setAuthToken(token: string | null): void {
  currentToken = token
}

function authHeaders(): Record<string, string> {
  return currentToken ? { authorization: `Bearer ${currentToken}` } : {}
}

async function post<T>(path: string, body: unknown, auth = true): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? authHeaders() : {}) },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

async function patch<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { method: 'PATCH', headers: authHeaders() })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { headers: authHeaders() })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

export interface Balance {
  accountId: string
  balance: number
}

export type Role = 'owner' | 'bookkeeper' | 'viewer'

export interface CurrentUser {
  id: string
  name: string
  role: Role
}

export interface UserRecord {
  id: string
  name: string
  username: string
  role: Role
  active: boolean
}

export const api = {
  createFarmer: (id: string, name?: string) =>
    post<{ id: string; kind: string }>('/accounts/farmers', { id, name }),
  setOpeningCash: (amount: number) => post<Balance>('/rokar/opening', { amount }),
  issueAdvance: (entryId: string, farmerId: string, amount: number) =>
    post<{ entryId: string }>('/advances', { entryId, farmerId, amount }),
  balanceOf: (id: string) => get<Balance>(`/accounts/${id}/balance`),

  login: (username: string, password: string) =>
    post<{ token: string; user: CurrentUser }>('/auth/login', { username, password }, false),
  listUsers: () => get<UserRecord[]>('/users'),
  createUser: (id: string, name: string, username: string, password: string, role: Role) =>
    post<UserRecord>('/users', { id, name, username, password, role }),
  deactivateUser: (id: string) => patch<{ id: string; active: boolean }>(`/users/${id}/deactivate`),
}
