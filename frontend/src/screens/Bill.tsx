import type { TradeResult } from '../api'
import { formatPkr } from '../money'

// Issue #23 — the Bill / Invoice view: the farmer's Kacha bill and the
// buyer's Pakka invoice, itemised so every line is hand-verifiable, plus the
// settlement cascade breakdown (ADR-0008: any outstanding advance is repaid
// from proceeds before the farmer's held balance).
export function Bill({ result }: { result: TradeResult }) {
  const { farmerBill, buyerInvoices, settlement } = result

  return (
    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap', margin: '1rem 0' }}>
      <section style={{ flex: 1, minWidth: 260, border: '1px solid #ddd', borderRadius: 10, padding: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>Kacha bill — {result.farmerId}</h3>
        <table style={{ width: '100%' }}>
          <tbody>
            <tr>
              <td>Gross sale value</td>
              <td style={{ textAlign: 'right' }}>{formatPkr(farmerBill.gross)}</td>
            </tr>
            <tr>
              <td>− Commission</td>
              <td style={{ textAlign: 'right' }}>{formatPkr(farmerBill.commission)}</td>
            </tr>
            <tr>
              <td>− Labour</td>
              <td style={{ textAlign: 'right' }}>{formatPkr(farmerBill.labour)}</td>
            </tr>
            <tr>
              <td>− Bag charge</td>
              <td style={{ textAlign: 'right' }}>{formatPkr(farmerBill.bagCharge)}</td>
            </tr>
            <tr style={{ fontWeight: 700, borderTop: '1px solid #ddd' }}>
              <td>Net proceeds</td>
              <td style={{ textAlign: 'right' }}>{formatPkr(farmerBill.net)}</td>
            </tr>
          </tbody>
        </table>

        <h4>Settlement (ADR-0008)</h4>
        <table style={{ width: '100%' }}>
          <tbody>
            <tr>
              <td>Applied to existing debt</td>
              <td style={{ textAlign: 'right' }}>{formatPkr(settlement.debtRepaid)}</td>
            </tr>
            <tr>
              <td>New held credit</td>
              <td style={{ textAlign: 'right' }}>{formatPkr(settlement.heldSurplus)}</td>
            </tr>
            <tr>
              <td>Remaining debt</td>
              <td style={{ textAlign: 'right' }}>{formatPkr(settlement.remainingDebt)}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section style={{ flex: 1, minWidth: 260, border: '1px solid #ddd', borderRadius: 10, padding: '1rem' }}>
        <h3 style={{ marginTop: 0 }}>
          Pakka invoice{buyerInvoices.length > 1 ? 's' : ''} ({buyerInvoices.length} buyer
          {buyerInvoices.length > 1 ? 's' : ''})
        </h3>
        {buyerInvoices.map((inv, i) => (
          <div key={i} style={{ marginBottom: i < buyerInvoices.length - 1 ? '1rem' : 0 }}>
            <h4 style={{ marginBottom: '0.25rem' }}>{inv.buyerId}</h4>
            <table style={{ width: '100%' }}>
              <tbody>
                <tr>
                  <td>Sale value</td>
                  <td style={{ textAlign: 'right' }}>{formatPkr(inv.saleValue)}</td>
                </tr>
                <tr>
                  <td>+ Commission</td>
                  <td style={{ textAlign: 'right' }}>{formatPkr(inv.commission)}</td>
                </tr>
                <tr>
                  <td>+ Labour</td>
                  <td style={{ textAlign: 'right' }}>{formatPkr(inv.labourCharge)}</td>
                </tr>
                <tr>
                  <td>+ Bag charge</td>
                  <td style={{ textAlign: 'right' }}>{formatPkr(inv.bagCharge)}</td>
                </tr>
                <tr>
                  <td>+ Cess</td>
                  <td style={{ textAlign: 'right' }}>{formatPkr(inv.cess)}</td>
                </tr>
                <tr style={{ fontWeight: 700, borderTop: '1px solid #ddd' }}>
                  <td>Total owed</td>
                  <td style={{ textAlign: 'right' }}>{formatPkr(inv.total)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        ))}
        <p style={{ color: '#666' }}>Payable weight: {result.payableMaunds.toFixed(2)} maund</p>
      </section>
    </div>
  )
}
