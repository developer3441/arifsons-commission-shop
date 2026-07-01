import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api, type ContactKind, type ContactRecord, type CostBearer } from '../api'
import { MoneyLabel } from '../money'

// Issue #17 — Contacts: search farmers/buyers/contractors by role, create or
// edit one (with per-customer commission/cost-bearer/Katt overrides —
// ADR-0001/0003/0012), and open a contact to see its running balance
// (design.md: colour + "owes you"/"you owe", never a bare +/− sign).

const KIND_LABEL: Record<ContactKind, string> = {
  zamindar: 'Farmers (Zamindar)',
  pakka: 'Buyers (Pakka)',
  thekedar: 'Contractors (Thekedar)',
}

function ContactForm({ kind, onSaved }: { kind: ContactKind; onSaved: () => void }) {
  const [id, setId] = useState('')
  const [name, setName] = useState('')
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
        commissionRate: commissionRate ? Number(commissionRate) : undefined,
        buyerCommissionRate: buyerCommissionRate ? Number(buyerCommissionRate) : undefined,
        bagBearer: bagBearer || undefined,
        labourBearer: labourBearer || undefined,
        kattKgPerBag: kattKgPerBag ? Number(kattKgPerBag) : undefined,
      })
      setId('')
      setName('')
      setCommissionRate('')
      setBuyerCommissionRate('')
      setBagBearer('')
      setLabourBearer('')
      setKattKgPerBag('')
      onSaved()
    } catch {
      setError('Could not save this contact.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ margin: '1rem 0', padding: '1rem', background: '#f5f5f5', borderRadius: 10 }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
        <label>
          Id
          <input value={id} onChange={(e) => setId(e.target.value)} disabled={busy} required style={{ display: 'block' }} />
        </label>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} disabled={busy} style={{ display: 'block' }} />
        </label>
        {kind === 'zamindar' && (
          <>
            <label>
              Commission rate override
              <input
                type="number"
                step="0.01"
                value={commissionRate}
                onChange={(e) => setCommissionRate(e.target.value)}
                disabled={busy}
                style={{ display: 'block' }}
              />
            </label>
            <label>
              Bag-cost bearer override
              <select value={bagBearer} onChange={(e) => setBagBearer(e.target.value as CostBearer | '')} disabled={busy} style={{ display: 'block' }}>
                <option value="">(shop default)</option>
                <option value="farmer">Farmer</option>
                <option value="buyer">Buyer</option>
              </select>
            </label>
            <label>
              Labour-cost bearer override
              <select value={labourBearer} onChange={(e) => setLabourBearer(e.target.value as CostBearer | '')} disabled={busy} style={{ display: 'block' }}>
                <option value="">(shop default)</option>
                <option value="farmer">Farmer</option>
                <option value="buyer">Buyer</option>
              </select>
            </label>
            <label>
              Katt (kg/bag) override
              <input
                type="number"
                step="0.1"
                value={kattKgPerBag}
                onChange={(e) => setKattKgPerBag(e.target.value)}
                disabled={busy}
                style={{ display: 'block' }}
              />
            </label>
          </>
        )}
        {kind === 'pakka' && (
          <label>
            Buyer commission rate override
            <input
              type="number"
              step="0.01"
              value={buyerCommissionRate}
              onChange={(e) => setBuyerCommissionRate(e.target.value)}
              disabled={busy}
              style={{ display: 'block' }}
            />
          </label>
        )}
      </div>
      <button type="submit" disabled={busy || !id} style={{ marginTop: '0.75rem' }}>
        {busy ? 'Saving…' : 'Save contact'}
      </button>
      {error && (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}
    </form>
  )
}

export function Contacts() {
  const [kind, setKind] = useState<ContactKind>('zamindar')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ContactRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  function reload() {
    setLoading(true)
    setError(null)
    api
      .listContacts(kind, query || undefined)
      .then(setResults)
      .catch(() => setError('Could not load contacts. Try again in a moment.'))
      .finally(() => setLoading(false))
  }

  useEffect(reload, [kind]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 720, margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/">&larr; Dashboard</Link>
      </p>
      <h1>Contacts</h1>

      <div style={{ display: 'flex', gap: '0.5rem', margin: '1rem 0' }}>
        {(Object.keys(KIND_LABEL) as ContactKind[]).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            disabled={kind === k}
            style={{ fontWeight: kind === k ? 700 : 400 }}
          >
            {KIND_LABEL[k]}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          reload()
        }}
        style={{ margin: '0.5rem 0' }}
      >
        <input
          placeholder="Search by name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ width: '100%', maxWidth: 320 }}
        />
        <button type="submit" style={{ marginLeft: '0.5rem' }}>
          Search
        </button>
      </form>

      <ContactForm kind={kind} onSaved={reload} />

      {loading && <p>Loading…</p>}
      {!loading && error && (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}
      {!loading && !error && results && results.length === 0 && <p>No contacts yet for {KIND_LABEL[kind]}.</p>}
      {!loading && !error && results && results.length > 0 && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid #ddd' }}>
              <th>Id</th>
              <th>Name</th>
              <th>Balance</th>
            </tr>
          </thead>
          <tbody>
            {results.map((c) => (
              <tr key={c.id} style={{ borderBottom: '1px solid #eee', cursor: 'pointer' }} onClick={() => navigate(`/contacts/${c.id}`)}>
                <td>{c.id}</td>
                <td>{c.name ?? '—'}</td>
                <td>
                  <MoneyLabel kind={c.kind} balance={c.balance} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}

export function ContactDetail() {
  const { id } = useParams<{ id: string }>()
  const [contact, setContact] = useState<ContactRecord | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    api
      .getContact(id)
      .then(setContact)
      .catch(() => setError('Could not load this contact.'))
      .finally(() => setLoading(false))
  }, [id])

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 480, margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/contacts">&larr; Contacts</Link>
      </p>
      {loading && <p>Loading…</p>}
      {!loading && error && (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}
      {!loading && !error && !contact && <p>No such contact.</p>}
      {!loading && !error && contact && (
        <>
          <h1>{contact.name ?? contact.id}</h1>
          <p>{KIND_LABEL[contact.kind]}</p>
          <p style={{ fontSize: '1.4rem' }}>
            <MoneyLabel kind={contact.kind} balance={contact.balance} />
          </p>
          {contact.kind === 'zamindar' && (
            <ul>
              {contact.commissionRate !== undefined && <li>Commission override: {contact.commissionRate}</li>}
              {contact.bagBearer && <li>Bag-cost bearer override: {contact.bagBearer}</li>}
              {contact.labourBearer && <li>Labour-cost bearer override: {contact.labourBearer}</li>}
              {contact.kattKgPerBag !== undefined && <li>Katt override: {contact.kattKgPerBag} kg/bag</li>}
            </ul>
          )}
          {contact.kind === 'pakka' && contact.buyerCommissionRate !== undefined && (
            <p>Buyer commission override: {contact.buyerCommissionRate}</p>
          )}
        </>
      )}
    </main>
  )
}
