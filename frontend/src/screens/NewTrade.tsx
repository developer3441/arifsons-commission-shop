import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Trash2 } from 'lucide-react'
import { api, type ContactRecord, type ShopConfig, type TradeResult } from '../api'
import { formatPkr } from '../money'
import { Bill } from './Bill'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { ContactPicker } from '../components/ContactPicker'
import { useOffline } from '../offline/OfflineContext'
import { getCachedConfig } from '../offline/cache'

// Issue #54 (ADR-0032) — New Trade, rebuilt once against the atomic
// single-submission contract: pick farmer → weigh bags (display-only payable
// preview) → split across buyer lines (ContactPicker each) → contractor →
// submit the WHOLE trade in one idempotent request. Mobile-first single column,
// bilingual, tokens (ADR-0027/0029/0030). The server assigns the lot number and
// recomputes the authoritative bill — the client preview is a nicety, not a
// second engine (ADR-0018 intact).

const KG_PER_MAUND = 40
const houseBuyer = (name: string): ContactRecord => ({ id: 'house', kind: 'pakka', name, balance: 0 })

type LineDraft = { key: number; buyer: ContactRecord | null; bagCount: string; ratePerMaund: string }

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[var(--color-muted)]">{label}</span>
      {children}
    </label>
  )
}

const inputClass =
  'min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 num ' +
  'focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50'

export function NewTrade() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const { online, enqueueWrite } = useOffline()

  const [config, setConfig] = useState<ShopConfig | null>(null)
  const [farmer, setFarmer] = useState<ContactRecord | null>(null)
  const [bags, setBags] = useState<number[]>([])
  const [grossKg, setGrossKg] = useState('')
  const [thekedar, setThekedar] = useState<ContactRecord | null>(null)
  const [lines, setLines] = useState<LineDraft[]>([{ key: 0, buyer: null, bagCount: '', ratePerMaund: '' }])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState(false)
  const [result, setResult] = useState<TradeResult | null>(null)
  const [queued, setQueued] = useState(false)

  // Shop default Katt for the display-only preview; a farmer's own override wins
  // when present (ADR-0003). Falls back to the offline cache so the preview works
  // with no signal (ADR-0031); degrades to 0 Katt as a last resort.
  useEffect(() => {
    api
      .getConfig()
      .then(setConfig)
      .catch(() => getCachedConfig().then((c) => c && setConfig(c)).catch(() => setConfig(null)))
  }, [])

  const katt = farmer?.kattKgPerBag ?? config?.kattKgPerBag ?? 0
  const payableKg = (g: number) => Math.max(0, g - katt)
  const previewMaunds = bags.reduce((sum, g) => sum + payableKg(g), 0) / KG_PER_MAUND
  const assignedBags = lines.reduce((sum, l) => sum + (Number(l.bagCount) || 0), 0)

  function addBag(e: FormEvent) {
    e.preventDefault()
    const g = Number(grossKg)
    if (!g || g <= 0) return
    setBags((prev) => [...prev, g])
    setGrossKg('')
  }
  const removeBag = (i: number) => setBags((prev) => prev.filter((_, j) => j !== i))

  const addLine = () =>
    setLines((prev) => [...prev, { key: (prev.at(-1)?.key ?? -1) + 1, buyer: null, bagCount: '', ratePerMaund: '' }])
  const updateLine = (key: number, patch: Partial<LineDraft>) =>
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const removeLine = (key: number) =>
    setLines((prev) => (prev.length > 1 ? prev.filter((l) => l.key !== key) : prev))

  const canSubmit =
    !!farmer &&
    bags.length > 0 &&
    !!thekedar &&
    assignedBags > 0 &&
    assignedBags <= bags.length &&
    lines.every((l) => l.buyer && Number(l.bagCount) > 0 && Number(l.ratePerMaund) > 0)

  async function onSubmit() {
    if (!canSubmit || !farmer || !thekedar) return
    setSubmitError(false)
    setSubmitting(true)
    const payload = {
      entryId: `trade-${farmer.id}-${Date.now()}`,
      farmerId: farmer.id,
      thekedarId: thekedar.id,
      bags: bags.map((g) => ({ grossKg: g })),
      lines: lines.map((l) => ({
        buyerId: l.buyer!.id,
        bagCount: Number(l.bagCount),
        ratePerMaund: Number(l.ratePerMaund),
      })),
    }
    try {
      if (!online) {
        // Offline: capture the whole trade in the durable queue (ADR-0031/0032);
        // it auto-syncs on reconnect and the idempotency key stops a double-post.
        await enqueueWrite({
          id: payload.entryId,
          kind: 'trade',
          payload,
          summary: `${t('trade.title')} · ${farmer.name ?? farmer.id}`,
          createdAt: Date.now(),
        })
        setQueued(true)
      } else {
        setResult(await api.submitTrade(payload))
      }
    } catch {
      setSubmitError(true)
    } finally {
      setSubmitting(false)
    }
  }

  function reset() {
    setResult(null)
    setQueued(false)
    setFarmer(null)
    setBags([])
    setThekedar(null)
    setLines([{ key: 0, buyer: null, bagCount: '', ratePerMaund: '' }])
  }

  // Per-line preview sale value (display-only Katt arithmetic, ADR-0032): each
  // line takes the next `bagCount` bags in weighing order, same as the server.
  function linePreviews() {
    let cursor = 0
    return lines.map((l) => {
      const n = Number(l.bagCount) || 0
      const slice = bags.slice(cursor, cursor + n)
      cursor += n
      const maunds = slice.reduce((s, g) => s + payableKg(g), 0) / KG_PER_MAUND
      return { line: l, saleValue: Math.round(maunds * (Number(l.ratePerMaund) || 0)) }
    })
  }

  if (result) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--color-rokar-bg)', color: 'var(--color-rokar-fg)' }} role="status">
          {t('trade.saved')} {t('trade.lotAssigned', { lotNumber: result.lotNumber })}
        </div>
        <Bill result={result} />
        <Button type="button" variant="outline" onClick={reset}>
          {t('trade.newTrade')}
        </Button>
      </div>
    )
  }

  // Offline: a provisional Kacha bill — exact line items (from the display-only
  // Katt preview) with the net/settlement/balances marked "as of last sync",
  // plus a pending-sync badge (ADR-0031). The server recomputes on sync.
  if (queued) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-xl px-4 py-3 text-sm" style={{ background: 'var(--color-thekedar-bg)', color: 'var(--color-thekedar-fg)' }} role="status">
          {t('offline.queued')}
        </div>
        <Card className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('bill.kacha')}</h2>
            <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-xs text-[var(--color-muted)]">
              {t('offline.pendingBadge')}
            </span>
          </div>
          {linePreviews().map(({ line, saleValue }, i) => (
            <div key={line.key} className="flex items-center justify-between border-b border-[var(--color-border)] py-1 text-sm">
              <span className="truncate">{line.buyer?.name ?? line.buyer?.id}</span>
              <span className="num">
                {line.bagCount} × {line.ratePerMaund} = {formatPkr(saleValue)}
              </span>
            </div>
          ))}
          <p className="text-xs text-[var(--color-muted)]">
            {t('bill.net')} / {t('bill.settlement')} — {t('offline.asOfLastSync')}
          </p>
        </Card>
        <Button type="button" variant="outline" onClick={reset}>
          {t('trade.newTrade')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-xl font-bold">{t('trade.title')}</h1>

      {/* Step 1 — farmer */}
      <Card className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('trade.steps.farmer')}</h2>
        <ContactPicker kind="zamindar" value={farmer} onSelect={setFarmer} disabled={submitting} />
      </Card>

      {!farmer && <p className="text-center text-sm text-[var(--color-muted)]">{t('trade.needFarmer')}</p>}

      {farmer && (
        <>
          {/* Step 2 — weigh bags */}
          <Card className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('trade.steps.bags')}</h2>
            <form onSubmit={addBag} className="flex items-end gap-2">
              <div className="flex-1">
                <Field label={t('trade.grossKg')}>
                  <input
                    type="number"
                    step="0.01"
                    inputMode="decimal"
                    value={grossKg}
                    onChange={(e) => setGrossKg(e.target.value)}
                    disabled={submitting}
                    className={inputClass}
                  />
                </Field>
              </div>
              <Button type="submit" variant="outline" disabled={submitting || !grossKg} className="shrink-0">
                {t('trade.addBag')}
              </Button>
            </form>

            <div
              className="rounded-xl px-4 py-3"
              style={{ background: 'var(--color-surface)' }}
            >
              <div className="text-xs text-[var(--color-muted)]">{t('trade.payablePreview')}</div>
              <div className="num text-2xl font-bold">
                {previewMaunds.toFixed(2)} <span className="text-base font-normal">{t('trade.maund')}</span>
              </div>
              <div className="text-xs text-[var(--color-muted)]">{t('trade.bagsWeighed', { count: bags.length })}</div>
              <div className="mt-1 text-xs text-[var(--color-muted)]">{t('trade.previewNote')}</div>
            </div>

            {bags.length > 0 && (
              <ul className="flex flex-col gap-1">
                {bags.map((g, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 border-b border-[var(--color-border)] py-1 text-sm">
                    <span className="num">
                      #{i + 1} · {g} kg → {payableKg(g)} kg
                      {payableKg(g) === 0 && (
                        <span className="ms-2 text-xs" style={{ color: 'var(--color-you-owe)' }}>
                          ⚠ {t('trade.lightBag')}
                        </span>
                      )}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="md"
                      aria-label={t('trade.removeBag')}
                      onClick={() => removeBag(i)}
                      disabled={submitting}
                      className="h-9 px-2"
                    >
                      <Trash2 size={16} />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* Step 3 — buyers */}
          {bags.length > 0 && (
            <Card className="flex flex-col gap-3">
              <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('trade.steps.buyers')}</h2>
              <p className="num text-xs text-[var(--color-muted)]">
                {t('trade.bagsAssigned', { assigned: assignedBags, total: bags.length })}
              </p>

              {lines.length === 1 && (
                <div className="text-xs">
                  <Button
                    type="button"
                    variant="outline"
                    size="md"
                    disabled={submitting}
                    onClick={() =>
                      updateLine(lines[0]!.key, { buyer: houseBuyer(t('trade.sellToHouse')), bagCount: String(bags.length) })
                    }
                  >
                    {t('trade.sellToHouse')}
                  </Button>
                  <p className="mt-1 text-[var(--color-muted)]">{t('trade.houseNote')}</p>
                </div>
              )}

              {lines.map((line) => (
                <div key={line.key} className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] p-3">
                  <ContactPicker kind="pakka" value={line.buyer} onSelect={(c) => updateLine(line.key, { buyer: c })} disabled={submitting} />
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <Field label={t('trade.bags')}>
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={line.bagCount}
                          onChange={(e) => updateLine(line.key, { bagCount: e.target.value })}
                          disabled={submitting}
                          className={inputClass}
                        />
                      </Field>
                    </div>
                    <div className="flex-1">
                      <Field label={t('trade.ratePerMaund')}>
                        <input
                          type="number"
                          min={1}
                          inputMode="numeric"
                          value={line.ratePerMaund}
                          onChange={(e) => updateLine(line.key, { ratePerMaund: e.target.value })}
                          disabled={submitting}
                          className={inputClass}
                        />
                      </Field>
                    </div>
                  </div>
                  {lines.length > 1 && (
                    <Button type="button" variant="ghost" size="md" onClick={() => removeLine(line.key)} disabled={submitting} className="self-start px-2 text-sm">
                      {t('trade.remove')}
                    </Button>
                  )}
                </div>
              ))}
              <Button type="button" variant="outline" onClick={addLine} disabled={submitting} className="w-full">
                {t('trade.addBuyer')}
              </Button>
            </Card>
          )}

          {/* Step 4 — contractor + submit */}
          {bags.length > 0 && (
            <Card className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-[var(--color-muted)]">{t('trade.steps.contractor')}</h2>
              <ContactPicker kind="thekedar" value={thekedar} onSelect={setThekedar} disabled={submitting} />
            </Card>
          )}

          <Button type="button" onClick={onSubmit} disabled={!canSubmit || submitting} className="w-full">
            {submitting ? t('trade.submitting') : t('trade.submit')}
          </Button>
          {submitError && (
            <p role="alert" className="text-center text-sm" style={{ color: 'var(--color-you-owe)' }}>
              {t('trade.submitError')}
            </p>
          )}
        </>
      )}

      <button type="button" onClick={() => navigate('/')} className="text-center text-sm text-[var(--color-accent)]">
        ← {t('nav.dashboard')}
      </button>
    </div>
  )
}
