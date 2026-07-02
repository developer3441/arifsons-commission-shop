import { Link, useSearchParams } from 'react-router-dom'

// Dashboard quick action → Record Payment. Buyer payment / farmer withdrawal /
// contractor payout (the cash actions) are issue #27 — not yet built as an
// HTTP route. This stub gives the quick action (and the farmer detail
// screen's "Withdraw" entry point, issue #26) somewhere to land in the
// meantime; farmerId carries through the query string so #27 can prefill it.
export function RecordPayment() {
  const [searchParams] = useSearchParams()
  const farmerId = searchParams.get('farmerId')

  return (
    <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 420, margin: '2rem auto', padding: '0 1rem' }}>
      <p>
        <Link to="/">&larr; Dashboard</Link>
      </p>
      <h1>Record Payment</h1>
      <p>Buyer payment / farmer withdrawal / contractor payout is coming soon (issue #27).</p>
      {farmerId && (
        <p>
          Withdrawal for farmer <strong>{farmerId}</strong> will be recorded here once #27 lands.
        </p>
      )}
    </main>
  )
}
