import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, setAuthToken, type CurrentUser } from '../api'

// Issue #15 — auth state for the SPA (ADR-0025). Token + user persist in
// localStorage so a page refresh doesn't log the user out (until the token's
// own 24h expiry) — logout simply clears both, client-side only.

const STORAGE_KEY = 'splitease.auth'

interface StoredAuth {
  token: string
  user: CurrentUser
}

interface AuthState {
  user: CurrentUser | null
  login: (username: string, password: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState | null>(null)

function loadStored(): StoredAuth | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredAuth) : null
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)

  useEffect(() => {
    const stored = loadStored()
    if (stored) {
      setAuthToken(stored.token)
      setUser(stored.user)
    }
  }, [])

  async function login(username: string, password: string) {
    const { token, user: loggedInUser } = await api.login(username, password)
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, user: loggedInUser }))
    setAuthToken(token)
    setUser(loggedInUser)
  }

  function logout() {
    localStorage.removeItem(STORAGE_KEY)
    setAuthToken(null)
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
