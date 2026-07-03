import { Fragment, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { api, type ContactKind, type ContactRecord, type CostBearer, type FarmerStatement, type StatementLine } from '../api'
import { MoneyLabel, formatPkr } from '../money'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'

// Issue #17 / #53 — Contacts: search farmers/buyers/contractors by role and by
// name / id / phone (all three via GET /contacts?q — design.md ContactPicker
// seam), create or edit one (with per-customer overrides — ADR-0001/0003/0012),
// and open a contact to see its running balance. Mobile-first, bilingual, tokens
// (ADR-0027/0029/0030); money shown as colour + "owes you"/"you owe", never a
// bare +/− sign (ADR-0010).

const KINDS: ContactKind[] = ['zamindar', 'pakka', 'thekedar']

// Shared field styling so form inputs match the reference standard (tokens, tall
// enough for a thumb + Nastaliq, visible focus ring).
const fieldClass =
  'min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 ' +
  'focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50'

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[var(--color-muted)]">{label}</span>
      {children}
    </label>
  )
}

function ContactForm({ kind, onSaved }: { kind: ContactKind; onSaved: () => void }) {
  const { t } = useTranslation()
  const [id, setId] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [commissionRate, setCommissionRate] = useState('')
  const [buyerCommissionRate, setBuyerCommissionRate] = useState('')
  const [bagBearer, setBagBearer] = useState<CostBearer | ''>('')
  const [labourBearer, setLabourBearer] = useState<CostBearer | ''>('')
  const [kattKgPerBag, setKattKgPerBag] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await api.upsertContact({
        id,
        kind,
        name: name || undefined,
        phone: phone || undefined,
        commissionRate: commissionRate ? Number(commissionRate) : undefined,
        buyerCommissionRate: buyerCommissionRate ? Number(buyerCommissionRate) : undefined,
        bagBearer: bagBearer || undefined,
        labourBearer: labourBearer || undefined,
        kattKgPerBag: kattKgPerBag ? Number(kattKgPerBag) : undefined,
      })
      setId('')
      setName('')
      setPhone('')
      setCommissionRate('')
      setBuyerCommissionRate('')
      setBagBearer('')
      setLabourBearer('')
      setKattKgPerBag('')
      onSaved()
    } catch {
      setError(t('contacts.saveError'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('contacts.formTitle')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={t('contacts.id')}>
            <input value={id} onChange={(e) => setId(e.target.value)} disabled={busy} required className={cn(fieldClass, 'num')} />
          </Field>
          <Field label={t('contacts.name')}>
            <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} className={fieldClass} />
          </Field>
          <Field label={t('contacts.phone')}>
            <input
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
              className={cn(fieldClass, 'num')}
            />
          </Field>
          {kind === 'zamindar' && (
            <>
              <Field label={t('contacts.commission')}>
                <input type="number" step="0.01" value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} disabled={busy} className={cn(fieldClass, 'num')} />
              </Field>
              <Field label={t('contacts.bagBearer')}>
                <select value={bagBearer} onChange={(e) => setBagBearer(e.target.value as CostBearer | '')} disabled={busy} className={fieldClass}>
                  <option value="">{t('contacts.bearerDefault')}</option>
                  <option value="farmer">{t('contacts.bearerFarmer')}</option>
                  <option value="buyer">{t('contacts.bearerBuyer')}</option>
                </select>
              </Field>
              <Field label={t('contacts.labourBearer')}>
                <select value={labourBearer} onChange={(e) => setLabourBearer(e.target.value as CostBearer | '')} disabled={busy} className={fieldClass}>
                  <option value="">{t('contacts.bearerDefault')}</option>
                  <option value="farmer">{t('contacts.bearerFarmer')}</option>
                  <option value="buyer">{t('contacts.bearerBuyer')}</option>
                </select>
              </Field>
              <Field label={t('contacts.katt')}>
                <input type="number" step="0.1" value={kattKgPerBag} onChange={(e) => setKattKgPerBag(e.target.value)} disabled={busy} className={cn(fieldClass, 'num')} />
              </Field>
            </>
          )}
          {kind === 'pakka' && (
            <Field label={t('contacts.buyerCommission')}>
              <input type="number" step="0.01" value={buyerCommissionRate} onChange={(e) => setBuyerCommissionRate(e.target.value)} disabled={busy} className={cn(fieldClass, 'num')} />
            </Field>
          )}
        </div>
        <Button type="submit" disabled={busy || !id} className="w-full">
          {busy ? t('contacts.saving') : t('contacts.save')}
        </Button>
        {error && (
          <p role="alert" className="text-sm" style={{ color: 'var(--color-you-owe)' }}>
            {error}
          </p>
        )}
      </form>
    </Card>
  )
}


function ContactRow({ contact, onOpen }: { contact: ContactRecord; onOpen: () => void }) {
  const { t } = useTranslation()
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-3 text-start shadow-sm hover:bg-[var(--color-surface)]"
    >
      <span className="min-w-0">
        <span className="block truncate font-medium">{contact.name ?? contact.id}</span>
        <span className="num block truncate text-sm text-[var(--color-muted)]">
          {contact.phone ?? t('contacts.noPhone')}
        </span>
      </span>
      <span className="shrink-0 text-sm">
        <MoneyLabel kind={contact.kind} balance={contact.balance} />
      </span>
    </button>
  )
}

export function Contacts() {
  const { t } = useTranslation()
  const [kind, setKind] = useState<ContactKind>('zamindar')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactRecord[] | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const navigate = useNavigate()

  function reload() {
    setLoading(true)
    setError(false)
    api
      .listContacts(kind, query || undefined)
      .then(setResults)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [kind]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">{t('contacts.title')}</h1>

      <div className="flex gap-2" role="tablist">
        {KINDS.map((k) => (
          <button
            key={k}
            role="tab"
            aria-selected={kind === k}
            onClick={() => setKind(k)}
            className={cn(
              'min-h-10 flex-1 rounded-lg border px-2 text-sm font-medium',
              kind === k
                ? 'border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
                : 'border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-muted)]',
            )}
          >
            {t(`contacts.roles.${k}`)}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          reload()
        }}
        className="flex gap-2"
      >
        <input
          type="search"
          placeholder={t('contacts.searchPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={fieldClass}
        />
        <Button type="submit" variant="outline" className="shrink-0">
          {t('contacts.search')}
        </Button>
      </form>

      <Button type="button" variant="outline" onClick={() => setShowForm((v) => !v)} className="w-full">
        {t('contacts.addToggle')}
      </Button>
      {showForm && <ContactForm kind={kind} onSaved={reload} />}

      {loading && (
        <p role="status" className="py-8 text-center text-[var(--color-muted)]">
          {t('state.loading')}
        </p>
      )}
      {!loading && error && (
        <p role="alert" className="py-8 text-center" style={{ color: 'var(--color-you-owe)' }}>
          {t('contacts.loadError')}
        </p>
      )}
      {!loading && !error && results && results.length === 0 && (
        <p className="py-8 text-center text-[var(--color-muted)]">{t('contacts.empty')}</p>
      )}
      {!loading && !error && results && results.length > 0 && (
        <div className="flex flex-col gap-2">
          {results.map((c) => (
            <ContactRow key={c.id} contact={c} onOpen={() => navigate(`/contacts/${c.id}`)} />
          ))}
        </div>
      )}
    </div>
  )
}

function StatementTable({ statement }: { statement: FarmerStatement }) {
  const { t } = useTranslation()
  if (statement.entries.length === 0) {
    return <p className="text-[var(--color-muted)]">{t('contacts.noStatement')}</p>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="text-start text-[var(--color-muted)]">
            <th className="py-1 text-start font-medium">{t('contacts.entryHeader')}</th>
            <th className="py-1 text-start font-medium">{t('contacts.amountHeader')}</th>
            <th className="py-1 text-start font-medium">{t('contacts.balanceHeader')}</th>
          </tr>
        </thead>
        <tbody>
          {statement.entries.map((line: StatementLine) => (
            <Fragment key={line.entryId}>
              <tr className={cn(!line.settlement && 'border-b border-[var(--color-border)]')}>
                <td className="py-1">{t(`contacts.entryKind.${line.kind}`, line.kind)}</td>
                <td
                  className="num py-1"
                  style={{ color: line.amount < 0 ? 'var(--color-owed-to-you)' : 'var(--color-you-owe)' }}
                >
                  {line.amount < 0 ? '−' : '+'}
                  {formatPkr(line.amount)}
                </td>
                <td className="py-1">
                  <MoneyLabel kind="zamindar" balance={line.balanceAfter} />
                </td>
              </tr>
              {line.settlement && (
                <tr className="border-b border-[var(--color-border)]">
                  <td colSpan={3} className="pb-2 ps-4 text-xs text-[var(--color-muted)]">
                    {t('contacts.settlement', {
                      debt: formatPkr(line.settlement.debtRepaid),
                      surplus: formatPkr(line.settlement.heldSurplus),
                    })}
                    {line.settlement.remainingDebt > 0 &&
                      t('contacts.remainingDebt', { amount: formatPkr(line.settlement.remainingDebt) })}
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ContactDetail() {
  const { t } = useTranslation()
  const { id } = useParams<{ id: string }>()
  const [contact, setContact] = useState<ContactRecord | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)

  const [statement, setStatement] = useState<FarmerStatement | null>(null)
  const [statementError, setStatementError] = useState(false)
  const [statementLoading, setStatementLoading] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(false)
    api
      .getContact(id)
      .then(setContact)
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [id])

  // The running statement + settlement cascade breakdown only applies to
  // Zamindar (farmer) accounts (issue #26, ADR-0008).
  useEffect(() => {
    if (!id || !contact || contact.kind !== 'zamindar') return
    setStatementLoading(true)
    setStatementError(false)
    api
      .getFarmerStatement(id)
      .then(setStatement)
      .catch(() => setStatementError(true))
      .finally(() => setStatementLoading(false))
  }, [id, contact])

  return (
    <div className="flex flex-col gap-4">
      <Link to="/contacts" className="text-sm text-[var(--color-accent)]">
        ← {t('contacts.title')}
      </Link>

      {loading && (
        <p role="status" className="py-8 text-center text-[var(--color-muted)]">
          {t('state.loading')}
        </p>
      )}
      {!loading && error && (
        <p role="alert" className="py-8 text-center" style={{ color: 'var(--color-you-owe)' }}>
          {t('contacts.detailError')}
        </p>
      )}
      {!loading && !error && !contact && (
        <p className="py-8 text-center text-[var(--color-muted)]">{t('contacts.notFound')}</p>
      )}
      {!loading && !error && contact && (
        <>
          <Card className="flex flex-col gap-1">
            <h1 className="text-xl font-bold">{contact.name ?? contact.id}</h1>
            <p className="text-sm text-[var(--color-muted)]">{t(`contacts.roles.${contact.kind}`)}</p>
            <p className="num text-sm text-[var(--color-muted)]">{contact.phone ?? t('contacts.noPhone')}</p>
            <p className="mt-2 text-lg">
              <MoneyLabel kind={contact.kind} balance={contact.balance} />
            </p>
          </Card>

          {contact.kind === 'zamindar' &&
            (contact.commissionRate !== undefined ||
              contact.bagBearer ||
              contact.labourBearer ||
              contact.kattKgPerBag !== undefined) && (
              <Card>
                <h2 className="mb-1 text-sm font-semibold text-[var(--color-muted)]">{t('contacts.overrides')}</h2>
                <ul className="text-sm">
                  {contact.commissionRate !== undefined && (
                    <li>
                      {t('contacts.commission')}: <span className="num">{contact.commissionRate}</span>
                    </li>
                  )}
                  {contact.bagBearer && <li>{t('contacts.bagBearer')}: {t(`contacts.bearer${contact.bagBearer === 'farmer' ? 'Farmer' : 'Buyer'}`)}</li>}
                  {contact.labourBearer && <li>{t('contacts.labourBearer')}: {t(`contacts.bearer${contact.labourBearer === 'farmer' ? 'Farmer' : 'Buyer'}`)}</li>}
                  {contact.kattKgPerBag !== undefined && (
                    <li>
                      {t('contacts.katt')}: <span className="num">{contact.kattKgPerBag}</span>
                    </li>
                  )}
                </ul>
              </Card>
            )}
          {contact.kind === 'pakka' && contact.buyerCommissionRate !== undefined && (
            <Card>
              <p className="text-sm">
                {t('contacts.buyerCommission')}: <span className="num">{contact.buyerCommissionRate}</span>
              </p>
            </Card>
          )}

          {contact.kind === 'zamindar' && (
            <>
              <div className="flex gap-2">
                <Link to={`/advance?farmerId=${encodeURIComponent(contact.id)}`} className="flex-1">
                  <Button type="button" className="w-full">
                    {t('contacts.issueAdvance')}
                  </Button>
                </Link>
                <Link to={`/payment?farmerId=${encodeURIComponent(contact.id)}`} className="flex-1">
                  <Button type="button" variant="outline" className="w-full">
                    {t('contacts.withdraw')}
                  </Button>
                </Link>
              </div>

              <section>
                <h2 className="mb-2 text-sm font-semibold text-[var(--color-muted)]">{t('contacts.runningStatement')}</h2>
                {statementLoading && (
                  <p role="status" className="text-[var(--color-muted)]">
                    {t('state.loading')}
                  </p>
                )}
                {!statementLoading && statementError && (
                  <p role="alert" style={{ color: 'var(--color-you-owe)' }}>
                    {t('contacts.statementError')}
                  </p>
                )}
                {!statementLoading && !statementError && statement && <StatementTable statement={statement} />}
              </section>
            </>
          )}
        </>
      )}
    </div>
  )
}
