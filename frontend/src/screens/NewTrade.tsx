import { Link } from 'react-router-dom'

// Dashboard quick action → New Trade. The Kacha bill / Pakka invoice flow
// (lot registration, weighing, split lots) is issue #22/#23 — not yet built.
// This stub gives the quick action somewhere to land in the meantime.
export function NewTrade() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 420, margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/">&larr; Dashboard</Link>
      </p>
      <h1>New Trade</h1>
      <p>Lot registration and the Kacha bill / Pakka invoice flow are coming soon (issues #22, #23).</p>
    </main>
  )
}
