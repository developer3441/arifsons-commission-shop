import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { Login } from './screens/Login'
import { Dashboard } from './screens/Dashboard'
import { Users } from './screens/Users'
import { IssueAdvance } from './screens/IssueAdvance'
import { NewTrade } from './screens/NewTrade'
import { RecordPayment } from './screens/RecordPayment'
import { Contacts, ContactDetail } from './screens/Contacts'
import { Config } from './screens/Config'
import { Genesis } from './screens/Genesis'
import { Bardana } from './screens/Bardana'
import { Cess } from './screens/Cess'
import { Godown } from './screens/Godown'

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
          <Route
            path="/advance"
            element={
              <RequireAuth>
                <IssueAdvance />
              </RequireAuth>
            }
          />
          <Route
            path="/trade"
            element={
              <RequireAuth>
                <NewTrade />
              </RequireAuth>
            }
          />
          <Route
            path="/payment"
            element={
              <RequireAuth>
                <RecordPayment />
              </RequireAuth>
            }
          />
          <Route
            path="/contacts"
            element={
              <RequireAuth>
                <Contacts />
              </RequireAuth>
            }
          />
          <Route
            path="/contacts/:id"
            element={
              <RequireAuth>
                <ContactDetail />
              </RequireAuth>
            }
          />
          <Route
            path="/config"
            element={
              <RequireOwner>
                <Config />
              </RequireOwner>
            }
          />
          <Route
            path="/genesis"
            element={
              <RequireOwner>
                <Genesis />
              </RequireOwner>
            }
          />
          <Route
            path="/bardana"
            element={
              <RequireAuth>
                <Bardana />
              </RequireAuth>
            }
          />
          <Route
            path="/cess"
            element={
              <RequireAuth>
                <Cess />
              </RequireAuth>
            }
          />
          <Route
            path="/godown"
            element={
              <RequireAuth>
                <Godown />
              </RequireAuth>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}
