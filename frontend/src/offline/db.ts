// Minimal IndexedDB wrapper for the offline write-queue (ADR-0031). Two stores:
//  - `queue`: pending safe-write submissions (FIFO via an autoIncrement `seq`),
//    durable across app close / refresh / phone restart.
//  - `cache`: read-cache (contact list, shop config) so New Trade composes offline.
// No runtime dependency — a thin promise wrapper over the platform IndexedDB.

const DB_NAME = 'splitease-offline'
const DB_VERSION = 2
export const QUEUE_STORE = 'queue'
export const CACHE_STORE = 'cache'
export const DISCARDED_STORE = 'discarded'

let dbPromise: Promise<IDBDatabase> | null = null

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'seq', autoIncrement: true })
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE, { keyPath: 'key' })
      // v2 (#61): items the user explicitly discarded, with a recorded reason —
      // nothing is ever silently lost (ADR-0031).
      if (!db.objectStoreNames.contains(DISCARDED_STORE)) db.createObjectStore(DISCARDED_STORE, { keyPath: 'seq' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
  return dbPromise
}

function run<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const req = fn(db.transaction(store, mode).objectStore(store))
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      }),
  )
}

export function idbGetAll<T>(store: string): Promise<T[]> {
  return run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
}
export function idbGet<T>(store: string, key: IDBValidKey): Promise<T | undefined> {
  return run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>)
}
/** Insert (auto-keyed stores) or upsert (keyPath stores). Returns the record key. */
export function idbPut(store: string, value: unknown): Promise<IDBValidKey> {
  return run<IDBValidKey>(store, 'readwrite', (s) => s.put(value as never))
}
export function idbDelete(store: string, key: IDBValidKey): Promise<undefined> {
  return run<undefined>(store, 'readwrite', (s) => s.delete(key) as IDBRequest<undefined>)
}

/** Test-only: drop the whole database so each test starts from a clean queue/cache. */
export async function _resetOfflineDb(): Promise<void> {
  // Close the live connection first, otherwise deleteDatabase is blocked forever.
  if (dbPromise) {
    try {
      ;(await dbPromise).close()
    } catch {
      // ignore — nothing to close
    }
    dbPromise = null
  }
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME)
    req.onsuccess = req.onerror = req.onblocked = () => resolve()
  })
}
