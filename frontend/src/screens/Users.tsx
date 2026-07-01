import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type Role, type UserRecord } from '../api'

// Issue #15 — Owner-only Users admin screen: create / list / deactivate.
export function Users() {
  const [users, setUsers] = useState<UserRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('bookkeeper')

  async function refresh() {
    setError(null)
    try {
      setUsers(await api.listUsers())
    } catch {
      setError('Could not load users')
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const id = `u-${Date.now()}`
      await api.createUser(id, name, username, password, role)
      setName('')
      setUsername('')
      setPassword('')
      setRole('bookkeeper')
      await refresh()
    } catch {
      setError('Could not create user — username may already be taken')
    } finally {
      setBusy(false)
    }
  }

  async function onDeactivate(id: string) {
    setBusy(true)
    try {
      await api.deactivateUser(id)
      await refresh()
    } catch {
      setError('Could not deactivate user')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '2rem auto' }}>
      <p>
        <Link to="/">← Dashboard</Link>
      </p>
      <h1>Users</h1>

      <form onSubmit={onCreate} style={{ marginBottom: '2rem' }}>
        <h2>Add a user</h2>
        <label style={{ display: 'block', margin: '0.5rem 0' }}>
          Name <input value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} />
        </label>
        <label style={{ display: 'block', margin: '0.5rem 0' }}>
          Username <input value={username} onChange={(e) => setUsername(e.target.value)} required disabled={busy} />
        </label>
        <label style={{ display: 'block', margin: '0.5rem 0' }}>
          Password{' '}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={busy}
          />
        </label>
        <label style={{ display: 'block', margin: '0.5rem 0' }}>
          Role{' '}
          <select value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={busy}>
            <option value="owner">Owner</option>
            <option value="bookkeeper">Bookkeeper</option>
            <option value="viewer">Viewer</option>
          </select>
        </label>
        <button type="submit" disabled={busy}>
          Add user
        </button>
      </form>

      {error && (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}

      <h2>All users</h2>
      {users === null && !error && <p>Loading…</p>}
      {users?.length === 0 && <p>No users yet.</p>}
      {users && users.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>Name</th>
              <th style={{ textAlign: 'left' }}>Username</th>
              <th style={{ textAlign: 'left' }}>Role</th>
              <th style={{ textAlign: 'left' }}>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.username}</td>
                <td>{u.role}</td>
                <td>{u.active ? 'Active' : 'Deactivated'}</td>
                <td>
                  {u.active && (
                    <button onClick={() => onDeactivate(u.id)} disabled={busy}>
                      Deactivate
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
