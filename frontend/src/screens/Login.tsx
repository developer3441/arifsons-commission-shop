import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Field, fieldClass } from '../components/ui/field'
import { LanguageSwitcher } from '../components/LanguageSwitcher'

// Issue #15 / #57 — Login: authenticates and routes to the Dashboard. Renders
// OUTSIDE AppShell (public route), so it carries its own centred card and the
// LanguageSwitcher. Mobile-first, bilingual, tokens (ADR-0029/0030).
export function Login() {
  const { t } = useTranslation()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)
  const [busy, setBusy] = useState(false)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(false)
    setBusy(true)
    try {
      await login(username, password)
      navigate('/')
    } catch {
      setError(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 p-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--color-accent)]">{t('app.name')}</h1>
        <LanguageSwitcher />
      </div>
      <Card>
        <form onSubmit={onSubmit} className="flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('login.title')}</h2>
          <Field label={t('login.username')}>
            <input
              className={fieldClass}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              disabled={busy}
              required
            />
          </Field>
          <Field label={t('login.password')}>
            <input
              type="password"
              className={fieldClass}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              disabled={busy}
              required
            />
          </Field>
          <Button type="submit" disabled={busy || !username || !password}>
            {busy ? t('login.signingIn') : t('login.signIn')}
          </Button>
          {error && (
            <p role="alert" className="text-sm" style={{ color: 'var(--color-you-owe)' }}>
              {t('login.error')}
            </p>
          )}
        </form>
      </Card>
    </div>
  )
}
