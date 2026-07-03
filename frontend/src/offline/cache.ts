import { CACHE_STORE, idbGet, idbPut } from './db'
import type { ContactKind, ContactRecord, ShopConfig } from '../api'

// Local read-cache (ADR-0031) so New Trade composes offline: the ContactPicker
// searches the cached contact list, and the bill preview uses the cached shop
// config + per-contact overrides. Refreshed each online session.

interface Cached<T> {
  key: string
  value: T
}

const CONTACTS_KEY = 'contacts'
const CONFIG_KEY = 'config'

export async function cacheContacts(contacts: ContactRecord[]): Promise<void> {
  await idbPut(CACHE_STORE, { key: CONTACTS_KEY, value: contacts })
}

/** Search the cached contacts by kind + (name/id/phone substring) — the offline ContactPicker. */
export async function searchCachedContacts(kind: ContactKind, q?: string): Promise<ContactRecord[]> {
  const rec = await idbGet<Cached<ContactRecord[]>>(CACHE_STORE, CONTACTS_KEY)
  const all = rec?.value ?? []
  const needle = (q ?? '').toLowerCase()
  return all.filter(
    (c) =>
      c.kind === kind &&
      (!needle || [c.name, c.id, c.phone].some((f) => f?.toLowerCase().includes(needle))),
  )
}

/** One cached contact by id (for per-contact overrides in the offline preview). */
export async function getCachedContact(id: string): Promise<ContactRecord | undefined> {
  const rec = await idbGet<Cached<ContactRecord[]>>(CACHE_STORE, CONTACTS_KEY)
  return (rec?.value ?? []).find((c) => c.id === id)
}

export async function cacheConfig(config: ShopConfig): Promise<void> {
  await idbPut(CACHE_STORE, { key: CONFIG_KEY, value: config })
}

export async function getCachedConfig(): Promise<ShopConfig | undefined> {
  const rec = await idbGet<Cached<ShopConfig>>(CACHE_STORE, CONFIG_KEY)
  return rec?.value
}
