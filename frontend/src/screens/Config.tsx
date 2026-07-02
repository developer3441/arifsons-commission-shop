import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { api, type CostBearer, type ShopConfig } from '../api'

// Issue #18 — Owner-only Config screen: the global shop defaults that seed
// the trade engine (ADR-0001/0003/0004/0012). Any authenticated user can
// reach this route in principle, but the backend rejects a save from anyone
// but an Owner (403) — this screen is only linked from the Dashboard for
// Owners (App.tsx also gates the route itself).
export function Config() {
  const [config, setConfigState] = useState<ShopConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    api
      .getConfig()
      .then(setConfigState)
      .catch(() => setError('Could not load shop defaults.'))
      .finally(() => setLoading(false))
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (!config) return
    setSaving(true)
    setSaved(false)
    setError(null)
    try {
      const updated = await api.setConfig(config)
      setConfigState(updated)
      setSaved(true)
    } catch {
      setError('Could not save shop defaults. Only an Owner can change them.')
    } finally {
      setSaving(false)
    }
  }

  function update<K extends keyof ShopConfig>(key: K, value: ShopConfig[K]) {
    setConfigState((c) => (c ? { ...c, [key]: value } : c))
  }

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 480, margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/">&larr; Dashboard</Link>
      </p>
      <h1>Shop Defaults</h1>

      {loading && <p>Loading…</p>}
      {!loading && error && (
        <p role="alert" style={{ color: 'crimson' }}>
          {error}
        </p>
      )}
      {!loading && !config && !error && <p>No configuration available.</p>}

      {!loading && config && (
        <form onSubmit={onSubmit}>
          <label style={{ display: 'block', margin: '0.75rem 0' }}>
            Farmer commission rate (e.g. 0.02 = 2%)
            <input
              type="number"
              step="0.01"
              value={config.farmerCommissionRate}
              onChange={(e) => update('farmerCommissionRate', Number(e.target.value))}
              style={{ display: 'block', width: '100%' }}
              disabled={saving}
            />
          </label>
          <label style={{ display: 'block', margin: '0.75rem 0' }}>
            Buyer commission rate
            <input
              type="number"
              step="0.01"
              value={config.buyerCommissionRate}
              onChange={(e) => update('buyerCommissionRate', Number(e.target.value))}
              style={{ display: 'block', width: '100%' }}
              disabled={saving}
            />
          </label>
          <label style={{ display: 'block', margin: '0.75rem 0' }}>
            Default Katt (kg/bag)
            <input
              type="number"
              step="0.1"
              value={config.kattKgPerBag}
              onChange={(e) => update('kattKgPerBag', Number(e.target.value))}
              style={{ display: 'block', width: '100%' }}
              disabled={saving}
            />
          </label>
          <label style={{ display: 'block', margin: '0.75rem 0' }}>
            Labour rate (PKR/bag)
            <input
              type="number"
              value={config.perBagLabour}
              onChange={(e) => update('perBagLabour', Number(e.target.value))}
              style={{ display: 'block', width: '100%' }}
              disabled={saving}
            />
          </label>
          <label style={{ display: 'block', margin: '0.75rem 0' }}>
            Empty-bag (bardana) value (PKR/bag)
            <input
              type="number"
              value={config.perBagCharge}
              onChange={(e) => update('perBagCharge', Number(e.target.value))}
              style={{ display: 'block', width: '100%' }}
              disabled={saving}
            />
          </label>
          <label style={{ display: 'block', margin: '0.75rem 0' }}>
            Default bag-cost bearer
            <select
              value={config.bagBearer}
              onChange={(e) => update('bagBearer', e.target.value as CostBearer)}
              style={{ display: 'block', width: '100%' }}
              disabled={saving}
            >
              <option value="farmer">Farmer</option>
              <option value="buyer">Buyer</option>
            </select>
          </label>
          <label style={{ display: 'block', margin: '0.75rem 0' }}>
            Default labour-cost bearer
            <select
              value={config.labourBearer}
              onChange={(e) => update('labourBearer', e.target.value as CostBearer)}
              style={{ display: 'block', width: '100%' }}
              disabled={saving}
            >
              <option value="farmer">Farmer</option>
              <option value="buyer">Buyer</option>
            </select>
          </label>
          <label style={{ display: 'block', margin: '0.75rem 0' }}>
            Cess rate (flat, on sale value)
            <input
              type="number"
              step="0.001"
              value={config.cessRate}
              onChange={(e) => update('cessRate', Number(e.target.value))}
              style={{ display: 'block', width: '100%' }}
              disabled={saving}
            />
          </label>
          <button type="submit" disabled={saving}>
            {saving ? 'Saving…' : 'Save defaults'}
          </button>
          {saved && <span style={{ color: '#1e7a34', marginLeft: '0.75rem' }}>Saved.</span>}
        </form>
      )}
    </main>
  )
}
