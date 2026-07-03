import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, type Role, type UserRecord } from '../api'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Field, fieldClass } from '../components/ui/field'

// Issue #15 / #57 — Owner-only Users admin: create / list / deactivate.
// Mobile-first, bilingual, tokens (ADR-0029/0030).
export function Users() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [users, setUsers] = useState<UserRecord[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const [name, setName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState<Role>('bookkeeper')

  async function refresh() {
    setLoading(true)
    setError(null)
    try {
      setUsers(await api.listUsers())
    } catch {
      setError(t('users.loadError'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      setError(t('users.createError'))
    } finally {
      setBusy(false)
    }
  }

  async function onDeactivate(id: string) {
    setBusy(true)
    setError(null)
    try {
      await api.deactivateUser(id)
      await refresh()
    } catch {
      setError(t('users.deactivateError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">{t('users.title')}</h1>

      <Card>
        <form onSubmit={onCreate} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('users.addTitle')}</h2>
          <Field label={t('users.name')}>
            <input className={fieldClass} value={name} onChange={(e) => setName(e.target.value)} required disabled={busy} />
          </Field>
          <Field label={t('users.username')}>
            <input className={fieldClass} value={username} onChange={(e) => setUsername(e.target.value)} required disabled={busy} />
          </Field>
          <Field label={t('users.password')}>
            <input type="password" className={fieldClass} value={password} onChange={(e) => setPassword(e.target.value)} required disabled={busy} />
          </Field>
          <Field label={t('users.role')}>
            <select className={fieldClass} value={role} onChange={(e) => setRole(e.target.value as Role)} disabled={busy}>
              <option value="owner">{t('users.roleOwner')}</option>
              <option value="bookkeeper">{t('users.roleBookkeeper')}</option>
              <option value="viewer">{t('users.roleViewer')}</option>
            </select>
          </Field>
          <Button type="submit" disabled={busy}>
            {busy ? t('users.adding') : t('users.add')}
          </Button>
        </form>
      </Card>

      {error && (
        <p role="alert" className="text-sm" style={{ color: 'var(--color-you-owe)' }}>
          {error}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('users.listTitle')}</h2>
        {loading && <p role="status" className="py-8 text-center text-[var(--color-muted)]">{t('state.loading')}</p>}
        {!loading && users && users.length === 0 && (
          <p className="py-8 text-center text-[var(--color-muted)]">{t('users.empty')}</p>
        )}
        {!loading && users && users.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-start text-[var(--color-muted)]">
                  <th className="py-1 text-start font-medium">{t('users.colName')}</th>
                  <th className="py-1 text-start font-medium">{t('users.colUsername')}</th>
                  <th className="py-1 text-start font-medium">{t('users.colRole')}</th>
                  <th className="py-1 text-start font-medium">{t('users.colStatus')}</th>
                  <th className="py-1" />
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-[var(--color-border)]">
                    <td className="py-2">{u.name}</td>
                    <td className="py-2">{u.username}</td>
                    <td className="py-2">{t(`users.role${u.role.charAt(0).toUpperCase()}${u.role.slice(1)}`, u.role)}</td>
                    <td className="py-2">{u.active ? t('users.active') : t('users.deactivated')}</td>
                    <td className="py-2 text-end">
                      {u.active && (
                        <Button type="button" variant="outline" size="md" onClick={() => onDeactivate(u.id)} disabled={busy}>
                          {t('users.deactivate')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <button type="button" onClick={() => navigate('/')} className="text-center text-sm text-[var(--color-accent)]">
        ← {t('nav.dashboard')}
      </button>
    </div>
  )
}
