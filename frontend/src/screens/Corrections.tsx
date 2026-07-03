import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, type EntryRecord, type ChangeLogRow } from '../api'
import { formatPkr } from '../money'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Field, fieldClass } from '../components/ui/field'
import { cn } from '../lib/utils'

// Issue #30 / #57 — Corrections & audit log (ADR-0011, clarified; ADR-0021).
// An edit/delete never rewrites a posting: it appends a reversal (and, for an
// edit, a fresh corrected entry) plus a change-log row. Editing a settled
// entry warns and is Owner-only, but the change is still logged either way.
// Mobile-first, bilingual, tokens (ADR-0029/0030).

function summarisePostings(postings: { accountId: string; amount: number }[]): string {
  return postings.map((p) => `${p.accountId}: ${p.amount >= 0 ? '+' : ''}${formatPkr(p.amount)}`).join(', ')
}

export function Corrections() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [log, setLog] = useState<ChangeLogRow[] | null>(null)
  const [logLoading, setLogLoading] = useState(true)
  const [logError, setLogError] = useState<string | null>(null)

  const [entryId, setEntryId] = useState('')
  const [entry, setEntry] = useState<EntryRecord | null>(null)
  const [lookupBusy, setLookupBusy] = useState(false)
  const [lookupError, setLookupError] = useState<string | null>(null)

  const [postingsDraft, setPostingsDraft] = useState<{ accountId: string; amount: string }[]>([])
  const [actionBusy, setActionBusy] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [actionResult, setActionResult] = useState<{ kind: 'edit' | 'delete'; warning?: string } | null>(null)

  function reloadLog() {
    setLogLoading(true)
    setLogError(null)
    api
      .getChangeLog()
      .then(setLog)
      .catch(() => setLogError(t('corrections.logError')))
      .finally(() => setLogLoading(false))
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(reloadLog, [])

  async function onLookup(e: FormEvent) {
    e.preventDefault()
    setLookupError(null)
    setActionResult(null)
    setLookupBusy(true)
    try {
      const found = await api.getEntry(entryId)
      setEntry(found)
      setPostingsDraft(found.postings.map((p) => ({ accountId: p.accountId, amount: String(p.amount) })))
    } catch {
      setEntry(null)
      setLookupError(t('corrections.notFound'))
    } finally {
      setLookupBusy(false)
    }
  }

  async function onEdit(e: FormEvent) {
    e.preventDefault()
    if (!entry) return
    setActionError(null)
    setActionBusy(true)
    try {
      const stamp = Date.now()
      const postings = postingsDraft.map((p) => ({ accountId: p.accountId, amount: Number(p.amount) }))
      const result = await api.editEntry(entry.id, `${entry.id}-rev-${stamp}`, `${entry.id}-corrected-${stamp}`, postings)
      setActionResult({ kind: 'edit', warning: result.warning })
      reloadLog()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setActionError(message.includes('403') ? t('corrections.editForbidden') : t('corrections.editError'))
    } finally {
      setActionBusy(false)
    }
  }

  async function onDelete() {
    if (!entry) return
    setActionError(null)
    setActionBusy(true)
    try {
      const stamp = Date.now()
      const result = await api.deleteEntry(entry.id, `${entry.id}-rev-${stamp}`)
      setActionResult({ kind: 'delete', warning: result.warning })
      setEntry(null)
      setEntryId('')
      reloadLog()
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      setActionError(message.includes('403') ? t('corrections.deleteForbidden') : t('corrections.deleteError'))
    } finally {
      setActionBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">{t('corrections.title')}</h1>
      <p className="text-sm text-[var(--color-muted)]">{t('corrections.intro')}</p>

      <Card className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('corrections.lookupTitle')}</h2>
        <form onSubmit={onLookup} className="flex flex-col gap-3">
          <Field label={t('corrections.entryId')}>
            <input className={fieldClass} value={entryId} onChange={(e) => setEntryId(e.target.value)} disabled={lookupBusy} required />
          </Field>
          <Button type="submit" disabled={lookupBusy || !entryId}>
            {lookupBusy ? t('corrections.lookingUp') : t('corrections.lookup')}
          </Button>
        </form>
        {lookupError && (
          <p role="alert" className="text-sm" style={{ color: 'var(--color-you-owe)' }}>{lookupError}</p>
        )}

        {entry && (
          <form onSubmit={onEdit} className="flex flex-col gap-3 border-t border-[var(--color-border)] pt-3">
            <p className="text-sm">
              <span className="font-semibold">{t(`entryKind.${entry.kind}`, entry.kind)}</span>{' '}
              <span className="text-[var(--color-muted)]">({entry.id})</span>
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-start text-[var(--color-muted)]">
                    <th className="py-1 text-start font-medium">{t('corrections.account')}</th>
                    <th className="py-1 text-start font-medium">{t('corrections.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {postingsDraft.map((p, i) => (
                    <tr key={p.accountId} className="border-b border-[var(--color-border)]">
                      <td className="py-2 pe-3">{p.accountId}</td>
                      <td className="py-2">
                        <input
                          type="number"
                          className={cn(fieldClass, 'num')}
                          value={p.amount}
                          onChange={(e) => {
                            const next = [...postingsDraft]
                            next[i] = { ...next[i]!, amount: e.target.value }
                            setPostingsDraft(next)
                          }}
                          disabled={actionBusy}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2">
              <Button type="submit" disabled={actionBusy}>
                {actionBusy ? t('corrections.saving') : t('corrections.save')}
              </Button>
              <Button type="button" variant="outline" onClick={onDelete} disabled={actionBusy} style={{ color: 'var(--color-you-owe)' }}>
                {t('corrections.delete')}
              </Button>
            </div>
            {actionError && (
              <p role="alert" className="text-sm" style={{ color: 'var(--color-you-owe)' }}>{actionError}</p>
            )}
            {actionResult && (
              <p role="status" className="text-sm" style={{ color: actionResult.warning ? 'var(--color-you-owe)' : 'var(--color-rokar-fg)' }}>
                {actionResult.kind === 'edit' ? t('corrections.savedResult') : t('corrections.deletedResult')}
                {actionResult.warning && <> {actionResult.warning}</>}
              </p>
            )}
          </form>
        )}
      </Card>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('corrections.historyTitle')}</h2>
        {logLoading && <p role="status" className="py-8 text-center text-[var(--color-muted)]">{t('state.loading')}</p>}
        {!logLoading && logError && (
          <p role="alert" className="py-8 text-center" style={{ color: 'var(--color-you-owe)' }}>{logError}</p>
        )}
        {!logLoading && !logError && log && log.length === 0 && (
          <p className="py-8 text-center text-[var(--color-muted)]">{t('corrections.empty')}</p>
        )}
        {!logLoading && !logError && log && log.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-start text-[var(--color-muted)]">
                  <th className="py-1 text-start font-medium">{t('corrections.colWhen')}</th>
                  <th className="py-1 text-start font-medium">{t('corrections.colEntry')}</th>
                  <th className="py-1 text-start font-medium">{t('corrections.colAction')}</th>
                  <th className="py-1 text-start font-medium">{t('corrections.colBefore')}</th>
                  <th className="py-1 text-start font-medium">{t('corrections.colAfter')}</th>
                  <th className="py-1 text-start font-medium">{t('corrections.colActor')}</th>
                </tr>
              </thead>
              <tbody>
                {log.map((row) => (
                  <tr key={row.id} className="border-b border-[var(--color-border)] align-top">
                    <td className="whitespace-nowrap py-2 pe-3">{new Date(row.timestamp).toLocaleString()}</td>
                    <td className="py-2 pe-3">{row.entryId}</td>
                    <td className="py-2 pe-3">{row.action}</td>
                    <td className="num py-2 pe-3">{summarisePostings(row.before.postings)}</td>
                    <td className="num py-2 pe-3">{row.after ? summarisePostings(row.after.postings) : t('corrections.deletedPostings')}</td>
                    <td className="py-2">{row.actor}</td>
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
