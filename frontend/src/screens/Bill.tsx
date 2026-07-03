import { useTranslation } from 'react-i18next'
import type { TradeResult } from '../api'
import { formatPkr } from '../money'
import { Card } from '../components/ui/card'

// Issue #23 / #54 — the Bill / Invoice view: the farmer's Kacha bill and each
// buyer's Pakka invoice, itemised so every line is hand-verifiable, plus the
// settlement cascade breakdown (ADR-0008). Tokens + bilingual i18n; amounts in
// Western digits via `.num` (ADR-0030).

function Row({ label, amount, strong }: { label: string; amount: number; strong?: boolean }) {
  return (
    <div
      className={
        strong
          ? 'flex items-center justify-between py-1 mt-1 border-t border-[var(--color-border)] pt-1 font-bold'
          : 'flex items-center justify-between py-1'
      }
    >
      <span>{label}</span>
      <span className="num">{formatPkr(amount)}</span>
    </div>
  )
}

export function Bill({ result }: { result: TradeResult }) {
  const { t } = useTranslation()
  const { farmerBill, buyerInvoices, settlement } = result

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-[var(--color-muted)]">
          {t('bill.kacha')} — {result.farmerId}
        </h3>
        <Row label={t('bill.gross')} amount={farmerBill.gross} />
        <Row label={`− ${t('bill.commission')}`} amount={farmerBill.commission} />
        <Row label={`− ${t('bill.labour')}`} amount={farmerBill.labour} />
        <Row label={`− ${t('bill.bagCharge')}`} amount={farmerBill.bagCharge} />
        <Row label={t('bill.net')} amount={farmerBill.net} strong />

        <h4 className="mt-3 text-sm font-semibold text-[var(--color-muted)]">{t('bill.settlement')}</h4>
        <Row label={t('bill.appliedToDebt')} amount={settlement.debtRepaid} />
        <Row label={t('bill.heldCredit')} amount={settlement.heldSurplus} />
        <Row label={t('bill.remainingDebt')} amount={settlement.remainingDebt} />
      </Card>

      <Card className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold text-[var(--color-muted)]">
          {buyerInvoices.length > 1 ? t('bill.pakkaPlural') : t('bill.pakka')}
        </h3>
        {buyerInvoices.map((inv, i) => (
          <div key={i} className="flex flex-col gap-0.5">
            <h4 className="font-medium">{inv.buyerId}</h4>
            <Row label={t('bill.saleValue')} amount={inv.saleValue} />
            <Row label={`+ ${t('bill.commission')}`} amount={inv.commission} />
            <Row label={`+ ${t('bill.labour')}`} amount={inv.labourCharge} />
            <Row label={`+ ${t('bill.bagCharge')}`} amount={inv.bagCharge} />
            <Row label={`+ ${t('bill.cess')}`} amount={inv.cess} />
            <Row label={t('bill.totalOwed')} amount={inv.total} strong />
          </div>
        ))}
        <p className="text-sm text-[var(--color-muted)]">
          {t('bill.payableWeight')}: <span className="num">{result.payableMaunds.toFixed(2)}</span> {t('trade.maund')}
        </p>
      </Card>
    </div>
  )
}
