import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type ContactKind } from '../api'
import { useAuth } from '../auth/AuthContext'
import { enqueue, pendingCount, type QueuedOp } from './queue'
import { cacheContacts, cacheConfig } from './cache'
import { syncQueue } from './sync'

// The offline write-queue's app-wide state (ADR-0031): online/offline status, the
// pending-sync count, and a "syncing" flag — plus the actions to enqueue a safe
// write, warm the read-cache, and flush the queue. Auto-flushes FIFO on reconnect
// and warms the cache whenever we're online and logged in.

interface OfflineState {
  online: boolean
  pending: number
  syncing: boolean
  syncedAt: number // bumps after each successful flush so screens can refresh balances
  enqueueWrite: (op: Omit<QueuedOp, 'seq'>) => Promise<void>
  syncNow: () => Promise<void>
  refreshPending: () => Promise<void>
}

// Default = "behaves online, no queue" — used when a component is rendered outside
// an OfflineProvider (e.g. isolated screen tests). Real offline behaviour needs the
// provider; this keeps unrelated trees working without wiring the whole stack.
const DEFAULT: OfflineState = {
  online: true,
  pending: 0,
  syncing: false,
  syncedAt: 0,
  enqueueWrite: async () => {},
  syncNow: async () => {},
  refreshPending: async () => {},
}

export const OfflineContext = createContext<OfflineState | null>(null)

const CONTACT_KINDS: ContactKind[] = ['zamindar', 'pakka', 'thekedar']

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [pending, setPending] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [syncedAt, setSyncedAt] = useState(0)

  const refreshPending = useCallback(async () => setPending(await pendingCount()), [])

  const refreshCaches = useCallback(async () => {
    try {
      const lists = await Promise.all(CONTACT_KINDS.map((k) => api.listContacts(k)))
      await cacheContacts(lists.flat())
      await cacheConfig(await api.getConfig())
    } catch {
      // Not logged in yet, or the fetch failed — best-effort; the cache keeps its
      // last-good snapshot ("as of last sync").
    }
  }, [])

  const syncNow = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return
    setSyncing(true)
    try {
      await syncQueue()
      await refreshCaches()
      setSyncedAt(Date.now())
    } finally {
      setSyncing(false)
      await refreshPending()
    }
  }, [refreshCaches, refreshPending])

  const enqueueWrite = useCallback(
    async (op: Omit<QueuedOp, 'seq'>) => {
      await enqueue(op)
      await refreshPending()
    },
    [refreshPending],
  )

  useEffect(() => {
    void refreshPending()
  }, [refreshPending])

  useEffect(() => {
    const goOnline = () => setOnline(true)
    const goOffline = () => setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  // Warm the cache and flush the queue whenever we're online and authenticated —
  // covers both a fresh login and a reconnect after being offline.
  useEffect(() => {
    if (user && online) void syncNow()
  }, [user, online, syncNow])

  const value: OfflineState = { online, pending, syncing, syncedAt, enqueueWrite, syncNow, refreshPending }
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
}

export function useOffline(): OfflineState {
  return useContext(OfflineContext) ?? DEFAULT
}
