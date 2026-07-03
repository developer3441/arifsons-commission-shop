import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api, type ContactKind } from '../api'
import { useAuth } from '../auth/AuthContext'
import {
  enqueue,
  pendingCount,
  needsAttentionCount,
  retryOp,
  discardOp,
  type QueuedOp,
} from './queue'
import { cacheContacts, cacheConfig } from './cache'
import { syncQueue } from './sync'

// The offline write-queue's app-wide state (ADR-0031): online/offline status, the
// pending + needs-attention counts, and a "syncing"/"authRequired" flag — plus
// the actions to enqueue a safe write, warm the read-cache, flush the queue, and
// resolve a parked item. Auto-flushes FIFO on reconnect with a backoff retry for
// transient failures; a 401 pauses the flush until the user re-logs (#61).

interface OfflineState {
  online: boolean
  pending: number
  needsAttention: number
  syncing: boolean
  authRequired: boolean
  syncedAt: number // bumps after a successful flush so screens can refresh balances
  enqueueWrite: (op: Omit<QueuedOp, 'seq' | 'status' | 'attempts' | 'lastError'>) => Promise<void>
  syncNow: () => Promise<void>
  refreshPending: () => Promise<void>
  retryItem: (seq: number) => Promise<void>
  discardItem: (seq: number, reason: string) => Promise<void>
}

const DEFAULT: OfflineState = {
  online: true,
  pending: 0,
  needsAttention: 0,
  syncing: false,
  authRequired: false,
  syncedAt: 0,
  enqueueWrite: async () => {},
  syncNow: async () => {},
  refreshPending: async () => {},
  retryItem: async () => {},
  discardItem: async () => {},
}

export const OfflineContext = createContext<OfflineState | null>(null)

const CONTACT_KINDS: ContactKind[] = ['zamindar', 'pakka', 'thekedar']
const MAX_BACKOFF_MS = 30_000

export function OfflineProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const [online, setOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine))
  const [pending, setPending] = useState(0)
  const [needsAttention, setNeedsAttention] = useState(0)
  const [syncing, setSyncing] = useState(false)
  const [authRequired, setAuthRequired] = useState(false)
  const [syncedAt, setSyncedAt] = useState(0)

  const retryTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const attemptRef = useRef(0)
  const syncRef = useRef<() => Promise<void>>(async () => {})

  const refreshPending = useCallback(async () => {
    setPending(await pendingCount())
    setNeedsAttention(await needsAttentionCount())
  }, [])

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
      const outcome = await syncQueue()
      await refreshCaches()
      setAuthRequired(outcome.authRequired)
      if (outcome.synced > 0) setSyncedAt(Date.now())

      clearTimeout(retryTimer.current)
      if (outcome.remaining > 0 && !outcome.authRequired && (typeof navigator === 'undefined' || navigator.onLine)) {
        // Transient failure — schedule an exponential-backoff retry so it lands.
        const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** attemptRef.current)
        attemptRef.current += 1
        retryTimer.current = setTimeout(() => void syncRef.current(), delay)
      } else {
        attemptRef.current = 0
      }
    } finally {
      setSyncing(false)
      await refreshPending()
    }
  }, [refreshCaches, refreshPending])

  // Keep a stable ref to the latest syncNow so the backoff timer can call it.
  useEffect(() => {
    syncRef.current = syncNow
  }, [syncNow])

  const enqueueWrite = useCallback(
    async (op: Omit<QueuedOp, 'seq' | 'status' | 'attempts' | 'lastError'>) => {
      await enqueue(op)
      await refreshPending()
    },
    [refreshPending],
  )

  const retryItem = useCallback(
    async (seq: number) => {
      await retryOp(seq)
      await refreshPending()
      void syncNow()
    },
    [refreshPending, syncNow],
  )

  const discardItem = useCallback(
    async (seq: number, reason: string) => {
      await discardOp(seq, reason, Date.now())
      await refreshPending()
    },
    [refreshPending],
  )

  useEffect(() => {
    void refreshPending()
    return () => clearTimeout(retryTimer.current)
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
  // covers a fresh login, a reconnect, and a re-login after a 401 pause (#61).
  useEffect(() => {
    if (user && online) void syncNow()
  }, [user, online, syncNow])

  const value: OfflineState = {
    online,
    pending,
    needsAttention,
    syncing,
    authRequired,
    syncedAt,
    enqueueWrite,
    syncNow,
    refreshPending,
    retryItem,
    discardItem,
  }
  return <OfflineContext.Provider value={value}>{children}</OfflineContext.Provider>
}

export function useOffline(): OfflineState {
  return useContext(OfflineContext) ?? DEFAULT
}
