import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Login } from './screens/Login'
import { Dashboard } from './screens/Dashboard'
import { Users } from './screens/Users'

// Issue #15 — routing shell: Login is public; everything else requires a
// session, and /users additionally requires the Owner role (ADR-0020).

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  return user ? <>{children}</> : <Navigate to="/login" replace />
}

function RequireOwner({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return user.role === 'owner' ? <>{children}</> : <Navigate to="/" replace />
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <Dashboard />
              </RequireAuth>
            }
          />
          <Route
            path="/users"
            element={
              <RequireOwner>
                <Users />
              </RequireOwner>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
