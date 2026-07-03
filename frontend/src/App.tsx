import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './auth/AuthContext'
import { OfflineProvider } from './offline/OfflineContext'
import { AppShell } from './components/AppShell'
import { Login } from './screens/Login'
import { Dashboard } from './screens/Dashboard'
import { More } from './screens/More'
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
import { Corrections } from './screens/Corrections'
import { Ledgers } from './screens/Ledgers'

// Issue #52 — the app shell (ADR-0029) wraps every authenticated screen so the
// bottom-tab navigation persists app-wide. Login is public and unwrapped.
// /users, /config, /genesis additionally require the Owner role (ADR-0020).

function RequireAuth({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  return <AppShell>{children}</AppShell>
}

function RequireOwner({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'owner') return <Navigate to="/" replace />
  return <AppShell>{children}</AppShell>
}

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <OfflineProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route path="/more" element={<RequireAuth><More /></RequireAuth>} />
          <Route path="/ledgers" element={<RequireAuth><Ledgers /></RequireAuth>} />
          <Route path="/contacts" element={<RequireAuth><Contacts /></RequireAuth>} />
          <Route path="/contacts/:id" element={<RequireAuth><ContactDetail /></RequireAuth>} />
          <Route path="/trade" element={<RequireAuth><NewTrade /></RequireAuth>} />
          <Route path="/advance" element={<RequireAuth><IssueAdvance /></RequireAuth>} />
          <Route path="/payment" element={<RequireAuth><RecordPayment /></RequireAuth>} />
          <Route path="/bardana" element={<RequireAuth><Bardana /></RequireAuth>} />
          <Route path="/cess" element={<RequireAuth><Cess /></RequireAuth>} />
          <Route path="/godown" element={<RequireAuth><Godown /></RequireAuth>} />
          <Route path="/corrections" element={<RequireAuth><Corrections /></RequireAuth>} />
          <Route path="/users" element={<RequireOwner><Users /></RequireOwner>} />
          <Route path="/config" element={<RequireOwner><Config /></RequireOwner>} />
          <Route path="/genesis" element={<RequireOwner><Genesis /></RequireOwner>} />
        </Routes>
        </OfflineProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
