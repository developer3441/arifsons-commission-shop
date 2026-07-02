import { useTranslation } from 'react-i18next'
import { formatPkr } from './lib/format'

export { formatPkr } from './lib/format'

// Shared money-display (design.md): colour + explicit "owes you"/"you owe"
// label, never a bare +/− sign (ADR-0010 sign model: negative = receivable/
// asset, positive = liability). Amount is wrapped in `.num` so it renders in
// Western digits / Latin font in both languages (ADR-0030).
const COUNTERPARTY_KINDS = new Set(['zamindar', 'pakka', 'thekedar', 'beopari'])

export function MoneyLabel({ kind, balance }: { kind: string; balance: number }) {
  const { t } = useTranslation()
  const amount = <span className="num">{formatPkr(balance)}</span>

  if (COUNTERPARTY_KINDS.has(kind)) {
    if (balance === 0)
      return (
        <span className="text-[var(--color-muted)]">
          {t('money.settled')} — {amount}
        </span>
      )
    const owesYou = balance < 0
    return (
      <span
        className="font-semibold"
        style={{ color: owesYou ? 'var(--color-owed-to-you)' : 'var(--color-you-owe)' }}
      >
        {amount} · {owesYou ? t('money.owesYou') : t('money.youOwe')}
      </span>
    )
  }
  if (kind === 'government') {
    return (
      <span
        className="font-semibold"
        style={{ color: balance > 0 ? 'var(--color-you-owe)' : 'var(--color-muted)' }}
      >
        {amount} {balance > 0 ? `· ${t('money.heldForGovt')}` : ''}
      </span>
    )
  }
  return <span className="font-semibold">{amount}</span>
}
