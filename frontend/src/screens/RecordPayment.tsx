import { Link } from 'react-router-dom'

// Dashboard quick action → Record Payment. Buyer payment / farmer withdrawal /
// contractor payout (the cash actions) are issue #27 — not yet built as an
// HTTP route. This stub gives the quick action somewhere to land.
export function RecordPayment() {
  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 420, margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/">&larr; Dashboard</Link>
      </p>
      <h1>Record Payment</h1>
      <p>Buyer payment / farmer withdrawal / contractor payout is coming soon (issue #27).</p>
    </main>
  )
}
