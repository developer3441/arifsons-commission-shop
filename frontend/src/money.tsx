// Shared money-display conventions (design.md): "prefer shared components" —
// every screen that shows a counterparty balance uses this, so the
// colour + "owes you"/"you owe" label (never a bare +/− sign) stays
// consistent across the app. Extracted from the Dashboard (issue #16) when
// Contacts (issue #17) needed the same treatment for a single contact.

export function formatPkr(amount: number): string {
  return `PKR ${Math.abs(amount).toLocaleString('en-PK')}`
}

// Ledgers that represent a two-party relationship (a balance that is either
// owed *to* the shop or owed *by* the shop) get the "owes you"/"you owe"
// treatment (ADR-0010 sign model: negative = receivable/asset, positive =
// liability). Rokar/revenue/government are the shop's own pools, not a
// counterparty balance, so they get a neutral magnitude label instead.
const COUNTERPARTY_KINDS = new Set(['zamindar', 'pakka', 'thekedar', 'beopari'])

export function MoneyLabel({ kind, balance }: { kind: string; balance: number }) {
  if (COUNTERPARTY_KINDS.has(kind)) {
    if (balance === 0) return <span style={{ color: '#666' }}>settled — {formatPkr(0)}</span>
    const owesYou = balance < 0
    return (
      <span style={{ color: owesYou ? '#1e7a34' : '#a53434', fontWeight: 600 }}>
        {formatPkr(balance)} {owesYou ? '· owes you' : '· you owe'}
      </span>
    )
  }
  if (kind === 'government') {
    return (
      <span style={{ color: balance > 0 ? '#a53434' : '#666', fontWeight: 600 }}>
        {formatPkr(balance)} {balance > 0 ? '· held for govt' : ''}
      </span>
    )
  }
  return <span style={{ fontWeight: 600 }}>{formatPkr(balance)}</span>
}
