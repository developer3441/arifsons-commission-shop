import { env } from 'cloudflare:test'
import { describe, it, expect } from 'vitest'
import { Repository } from '../../src/db/repository'
import { zamindarAccount, thekedarAccount, pakkaAccount, rokarAccount, issuePeshiAdvance, REVENUE_ID } from '../../src/domain/posting'
import { pkr } from '../../src/domain/money'
import { postTradeEntry, type TradeEntry, type TradeConfig } from '../../src/domain/trade'
import type { ChangeLogRow } from '../../src/domain/corrections'

// Issue #14 — persistence rails: append-only posting stream (ADR-0021),
// business dating (ADR-0023). Runs against a real (Miniflare) D1, the same
// runtime the deployed Worker uses.

describe('entries + postings persist append-only; balances are a projection (issue #14)', () => {
  it('a trade entry with several postings persists in one transaction and the balance reads back the stored stream', async () => {
    const repo = new Repository(env.DB)
    const farmer = zamindarAccount('farmer-persist-1')
    const thekedar = thekedarAccount('thekedar-persist-1')
    const buyer = pakkaAccount('buyer-persist-1')
    await repo.ensureAccount(farmer)
    await repo.ensureAccount(thekedar)
    await repo.ensureAccount(buyer)
    await repo.ensureAccount({ id: REVENUE_ID, kind: 'revenue' })

    const config: TradeConfig = {
      farmerCommissionRate: 0.02, buyerCommissionRate: 0, perBagLabour: 50, perBagCharge: 0,
      bagBearer: 'farmer', labourBearer: 'farmer', kattKgPerBag: 0, cessRate: 0,
    }
    const entry: TradeEntry = {
      id: 'trade-persist-1', farmerId: farmer.id, thekedarId: thekedar.id, lotBags: 10,
      lines: [{ buyerId: buyer.id, bags: Array.from({ length: 10 }, () => ({ grossKg: 40 })), ratePerMaund: 1000 }],
    }
    const { postings } = postTradeEntry(entry, config)

    const { wasNew } = await repo.recordEntry({ id: entry.id, kind: 'trade', postings })
    expect(wasNew).toBe(true)

    // balance is read back as a projection of the persisted stream, not ad-hoc state
    expect(await repo.balanceOf(farmer.id)).toBe(postings.find((p) => p.accountId === farmer.id)!.amount)
    expect(await repo.balanceOf(thekedar.id)).toBe(postings.find((p) => p.accountId === thekedar.id)!.amount)
    expect(await repo.balanceOf(buyer.id)).toBe(postings.find((p) => p.accountId === buyer.id)!.amount)
  })
})

describe('the database rejects UPDATE/DELETE on postings and change_log (issue #14, ADR-0021)', () => {
  it('an UPDATE on postings aborts at the trigger', async () => {
    const repo = new Repository(env.DB)
    const farmer = zamindarAccount('farmer-trigger-1')
    await repo.ensureAccount(rokarAccount())
    await repo.ensureAccount(farmer)
    await repo.recordEntry(issuePeshiAdvance('adv-trigger-1', farmer, pkr(1_000)))

    await expect(env.DB.prepare(`UPDATE postings SET amount = 999999 WHERE entry_id = ?`)
      .bind('adv-trigger-1')
      .run()).rejects.toThrow(/append-only/i)
  })

  it('a DELETE on postings aborts at the trigger', async () => {
    const repo = new Repository(env.DB)
    const farmer = zamindarAccount('farmer-trigger-2')
    await repo.ensureAccount(rokarAccount())
    await repo.ensureAccount(farmer)
    await repo.recordEntry(issuePeshiAdvance('adv-trigger-2', farmer, pkr(1_000)))

    await expect(env.DB.prepare(`DELETE FROM postings WHERE entry_id = ?`)
      .bind('adv-trigger-2')
      .run()).rejects.toThrow(/append-only/i)
  })

  it('an UPDATE or DELETE on change_log aborts at the trigger', async () => {
    const repo = new Repository(env.DB)
    const row: ChangeLogRow = Object.freeze({
      id: 'cl-trigger-1', entryId: 'e-x', action: 'edit' as const,
      before: { id: 'e-x', kind: 'peshi_advance' as const, postings: [] },
      after: { id: 'e-x', kind: 'peshi_advance' as const, postings: [] },
      actor: 'owner', timestamp: '2026-07-02T00:00:00Z',
    })
    await repo.recordChangeLog(row)

    await expect(env.DB.prepare(`UPDATE change_log SET actor_user_id = ? WHERE id = ?`)
      .bind('someone-else', 'cl-trigger-1')
      .run()).rejects.toThrow(/append-only/i)

    await expect(env.DB.prepare(`DELETE FROM change_log WHERE id = ?`)
      .bind('cl-trigger-1')
      .run()).rejects.toThrow(/append-only/i)
  })
})

describe('idempotent submission by entry id (issue #14, ADR-0021)', () => {
  it('re-submitting the same entry id does not double-post', async () => {
    const repo = new Repository(env.DB)
    const farmer = zamindarAccount('farmer-idem-1')
    await repo.ensureAccount(rokarAccount())
    await repo.ensureAccount(farmer)

    const entry = issuePeshiAdvance('adv-idem-1', farmer, pkr(50_000))
    const first = await repo.recordEntry(entry)
    expect(first.wasNew).toBe(true)
    expect(await repo.balanceOf(farmer.id)).toBe(-50_000)

    // a retried request with the same client-generated id
    const second = await repo.recordEntry(entry)
    expect(second.wasNew).toBe(false)
    expect(await repo.balanceOf(farmer.id)).toBe(-50_000) // unchanged — not double-posted
  })
})

describe('business date defaults to today (PKT) and created_at is UTC (issue #14, ADR-0023)', () => {
  it('an entry recorded without an explicit business date gets one, and it can be overridden (backdated)', async () => {
    const farmer = zamindarAccount('farmer-date-1')
    const repo = new Repository(env.DB)
    await repo.ensureAccount(rokarAccount())
    await repo.ensureAccount(farmer)

    await repo.recordEntry(issuePeshiAdvance('adv-date-1', farmer, pkr(1_000))) // default business date
    await repo.recordEntry(issuePeshiAdvance('adv-date-2', farmer, pkr(2_000)), '2026-01-15') // backdated

    const rows = await env.DB.prepare(`SELECT id, business_date FROM entries WHERE id IN (?, ?)`)
      .bind('adv-date-1', 'adv-date-2')
      .all()
    const byId = Object.fromEntries((rows.results as { id: string; business_date: string }[]).map((r) => [r.id, r.business_date]))
    expect(byId['adv-date-1']).toMatch(/^\d{4}-\d{2}-\d{2}$/) // defaulted, still a valid date
    expect(byId['adv-date-2']).toBe('2026-01-15') // explicit override honoured
  })

  it('balances can be grouped by business date (PKT day)', async () => {
    const farmer = zamindarAccount('farmer-date-2')
    const repo = new Repository(env.DB)
    await repo.ensureAccount(rokarAccount())
    await repo.ensureAccount(farmer)

    await repo.recordEntry(issuePeshiAdvance('adv-date-3', farmer, pkr(1_000)), '2026-02-01')
    await repo.recordEntry(issuePeshiAdvance('adv-date-4', farmer, pkr(2_000)), '2026-02-01')
    await repo.recordEntry(issuePeshiAdvance('adv-date-5', farmer, pkr(3_000)), '2026-02-02')

    const totals = await repo.dailyTotals(farmer.id)
    const day1 = totals.find((t) => t.businessDate === '2026-02-01')
    const day2 = totals.find((t) => t.businessDate === '2026-02-02')
    expect(day1?.amount).toBe(-3_000)
    expect(day2?.amount).toBe(-3_000)
  })
})
