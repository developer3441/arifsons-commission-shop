// Minimal typed client for the walking skeleton. ADR-0016 makes the backend's
// OpenAPI spec the contract; generating this client from that spec is the
// fast-follow — for now these few calls are hand-written against it.

const BASE = '/api'

async function post<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path)
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.json() as Promise<T>
}

export interface Balance {
  accountId: string
  balance: number
}

export const api = {
  createFarmer: (id: string, name?: string) =>
    post<{ id: string; kind: string }>('/accounts/farmers', { id, name }),
  setOpeningCash: (amount: number) => post<Balance>('/rokar/opening', { amount }),
  issueAdvance: (entryId: string, farmerId: string, amount: number) =>
    post<{ entryId: string }>('/advances', { entryId, farmerId, amount }),
  balanceOf: (id: string) => get<Balance>(`/accounts/${id}/balance`),
}
