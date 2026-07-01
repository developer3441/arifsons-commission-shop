import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

// Placeholder home screen for issue #15 (auth needs somewhere to route to).
// Issue #16 (App shell & Dashboard) replaces this with the real Cash in Hand /
// True Shop Value pillars and ledger cards (docs/design.md).
export function Dashboard() {
  const { user, logout } = useAuth()

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '2rem auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>SplitEase</h1>
        <div>
          <span style={{ marginRight: '1rem' }}>
            {user?.name} ({user?.role})
          </span>
          <button onClick={logout}>Log out</button>
        </div>
      </header>
      <p>Dashboard (Cash in Hand / True Shop Value) lands in issue #16.</p>
      {user?.role === 'owner' && <Link to="/users">Manage users</Link>}
    </main>
  )
}
