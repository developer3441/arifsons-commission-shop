// Thin HTTP boundary (architecture.md): resolve config → call the pure trade
// engine (trade.ts, unchanged from round 1) → persist append-only and
// idempotent → respond with the Kacha bill / Pakka invoice(s) / settlement
// breakdown for the New Trade flow's review screen. Issue #23 + #24.
//
// The lot must already be registered and weighed (issue #22) — this is the
// back half of the New Trade flow. Two request shapes: the single-buyer
// shorthand (buyerId + ratePerMaund at the top level, using every bag in the
// lot — issue #23's original shape, kept for backward compatibility) or an
// explicit `lines` array for a split sale across 2+ buyers (issue #24,
// ADR-0006) — each line takes the next `bagCount` bags from the lot, in
// weighing order. Overselling (more bags across lines than the lot holds) is
// rejected by postTradeEntry()'s own existing guard (ADR-0019) — no new
// guard logic needed here.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Repository, LotRepository, ConfigRepository, GodownRepository } from '../db/repository'
import { postTradeEntry, type TradeEntry, type TradeConfig } from '../domain/trade'
import { settleFarmerProceeds } from '../domain/settlement'
import { HOUSE_BUYER_ID, houseBuyerAccount, houseBuyCost } from '../domain/godown'
import { KG_PER_MAUND } from '../domain/weight'
import { pkr } from '../domain/money'
import { zamindarAccount, pakkaAccount, thekedarAccount, governmentAccount, REVENUE_ID } from '../domain/posting'
import { requireAuth, type AuthedBindings, type AuthedVariables } from './middleware'

export type Bindings = AuthedBindings & { DB: D1Database }

export const trades = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthedVariables }>()

trades.use('/trades', requireAuth)

const bearerSchema = z.enum(['farmer', 'buyer'])

const farmerBillSchema = z.object({
  gross: z.number().int(),
  commission: z.number().int(),
  labour: z.number().int(),
  bagCharge: z.number().int(),
  net: z.number().int(),
})

const buyerInvoiceSchema = z.object({
  buyerId: z.string(),
  saleValue: z.number().int(),
  commission: z.number().int(),
  labourCharge: z.number().int(),
  bagCharge: z.number().int(),
  cess: z.number().int(),
  total: z.number().int(),
})

const settlementSchema = z.object({
  debtRepaid: z.number().int(),
  heldSurplus: z.number().int(),
  remainingDebt: z.number().int(),
  newBalance: z.number().int(),
})

const godownStateSchema = z.object({
  bags: z.number().int(),
  netKg: z.number(),
  totalCostBasis: z.number().int(),
})

const tradeResponse = z.object({
  entryId: z.string(),
  lotNumber: z.number().int(),
  farmerId: z.string(),
  thekedarId: z.string(),
  payableMaunds: z.number(),
  farmerBill: farmerBillSchema,
  buyerInvoices: z.array(buyerInvoiceSchema),
  settlement: settlementSchema,
  // Present only for a house-buyer (Beopari) purchase — the Godown's running
  // state after this purchase was received (issue #28, ADR-0005).
  godown: godownStateSchema.optional(),
})

trades.openapi(
  createRoute({
    method: 'post',
    path: '/trades',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z
              .object({
                entryId: z.string(),
                lotNumber: z.number().int(),
                thekedarId: z.string(),
                // Single-buyer shorthand (issue #23): uses every bag in the lot.
                buyerId: z.string().optional(),
                ratePerMaund: z.number().int().positive().optional(),
                kattKgPerBag: z.number().optional(),
                bagBearer: bearerSchema.optional(),
                labourBearer: bearerSchema.optional(),
                // Split-lot shape (issue #24, ADR-0006): 2+ lines, each taking the
                // next `bagCount` bags from the lot (in weighing order).
                lines: z
                  .array(
                    z.object({
                      buyerId: z.string(),
                      bagCount: z.number().int().positive(),
                      ratePerMaund: z.number().int().positive(),
                      kattKgPerBag: z.number().optional(),
                      bagBearer: bearerSchema.optional(),
                      labourBearer: bearerSchema.optional(),
                    }),
                  )
                  .optional(),
              })
              .refine((v) => v.lines?.length || (v.buyerId && v.ratePerMaund), {
                message: 'Provide either buyerId + ratePerMaund, or a lines array',
              }),
          },
        },
      },
    },
    responses: {
      201: { description: 'Trade posted', content: { 'application/json': { schema: tradeResponse } } },
      400: { description: 'Invalid trade (e.g. an empty lot, oversell, or malformed request)' },
      404: { description: 'No such lot' },
    },
  }),
  async (c) => {
    const input = c.req.valid('json')
    const repo = new Repository(c.env.DB)
    const lotRepo = new LotRepository(c.env.DB)

    const lot = await lotRepo.getLot(input.lotNumber)
    if (!lot) return c.json({ error: 'No such lot' }, 404)
    if (lot.bags.length === 0) {
      return c.json({ error: 'This lot has no weighed bags yet' }, 400)
    }

    // Normalise both request shapes into one `lines` list, slicing the lot's
    // bags (in weighing order) by each line's bagCount for a split sale.
    type LineSpec = {
      buyerId: string
      bagCount: number
      ratePerMaund: number
      kattKgPerBag?: number
      bagBearer?: 'farmer' | 'buyer'
      labourBearer?: 'farmer' | 'buyer'
    }
    const lineSpecs: LineSpec[] = input.lines?.length
      ? input.lines
      : [
          {
            buyerId: input.buyerId!,
            bagCount: lot.bags.length,
            ratePerMaund: input.ratePerMaund!,
            kattKgPerBag: input.kattKgPerBag,
            bagBearer: input.bagBearer,
            labourBearer: input.labourBearer,
          },
        ]

    // Oversell guard (ADR-0019): checked here against the *requested* bag
    // counts, before slicing — Array.slice() silently clamps to what's
    // available rather than throwing, which would otherwise let an oversell
    // slip past postTradeEntry()'s own guard (that guard compares against
    // each line's *actual* bags.length, which would already be the clamped,
    // too-small count by the time it runs).
    const totalRequested = lineSpecs.reduce((sum, l) => sum + l.bagCount, 0)
    if (totalRequested > lot.bags.length) {
      return c.json(
        { error: `Oversell: ${totalRequested} bags requested across lines exceeds the lot's ${lot.bags.length} bags` },
        400,
      )
    }

    const buyerIds = [...new Set(lineSpecs.map((l) => l.buyerId))]

    // A house (Beopari) purchase reuses this same flow with buyerId = HOUSE_BUYER_ID
    // (ADR-0005) — but the Godown cost-basis math below (houseBuyCost) only
    // holds when the WHOLE trade's rolled-up farmerBill/thekedar labour went
    // to the house, so a split lot may not mix a house-buyer line with a
    // real buyer line in the same trade entry.
    const isHousePurchase = buyerIds.includes(HOUSE_BUYER_ID)
    if (isHousePurchase && buyerIds.length > 1) {
      return c.json(
        { error: 'Cannot mix a house-buyer (Beopari) line with a real buyer in the same trade' },
        400,
      )
    }

    // Resolve TradeConfig: shop defaults (issue #18), with per-customer
    // overrides layered on top (issue #17) — the same "per-invoice >
    // per-customer > global" precedence trade.ts's own resolve() applies,
    // just assembled here before the pure engine runs. Each buyer in a split
    // sale can carry its own commission override.
    const [shopConfig, farmerContact, buyerContacts] = await Promise.all([
      new ConfigRepository(c.env.DB).getConfig(),
      repo.getContact(lot.farmerId),
      Promise.all(buyerIds.map((id) => repo.getContact(id))),
    ])

    const customerBuyerCommissionRate: Record<string, number> = {}
    buyerIds.forEach((id, i) => {
      const rate = buyerContacts[i]?.buyerCommissionRate
      if (rate !== undefined) customerBuyerCommissionRate[id] = rate
    })

    const config: TradeConfig = {
      farmerCommissionRate: shopConfig.farmerCommissionRate,
      buyerCommissionRate: shopConfig.buyerCommissionRate,
      perBagLabour: shopConfig.perBagLabour,
      perBagCharge: shopConfig.perBagCharge,
      bagBearer: shopConfig.bagBearer,
      labourBearer: shopConfig.labourBearer,
      kattKgPerBag: shopConfig.kattKgPerBag,
      cessRate: shopConfig.cessRate,
      ...(farmerContact?.kattKgPerBag !== undefined
        ? { customerKattKgPerBag: { [lot.farmerId]: farmerContact.kattKgPerBag } }
        : {}),
      ...(farmerContact?.bagBearer !== undefined
        ? { customerBagBearer: { [lot.farmerId]: farmerContact.bagBearer } }
        : {}),
      ...(farmerContact?.labourBearer !== undefined
        ? { customerLabourBearer: { [lot.farmerId]: farmerContact.labourBearer } }
        : {}),
      ...(farmerContact?.commissionRate !== undefined
        ? { customerFarmerCommissionRate: { [lot.farmerId]: farmerContact.commissionRate } }
        : {}),
      ...(Object.keys(customerBuyerCommissionRate).length ? { customerBuyerCommissionRate } : {}),
    }

    // Slice the lot's bags by each line's bagCount, in weighing order.
    let cursor = 0
    const lines = lineSpecs.map((spec) => {
      const bags = lot.bags.slice(cursor, cursor + spec.bagCount).map((b) => ({ grossKg: b.grossKg }))
      cursor += spec.bagCount
      return {
        buyerId: spec.buyerId,
        bags,
        ratePerMaund: spec.ratePerMaund,
        kattKgPerBag: spec.kattKgPerBag,
        bagBearer: spec.bagBearer,
        labourBearer: spec.labourBearer,
      }
    })

    const tradeEntry: TradeEntry = {
      id: input.entryId,
      farmerId: lot.farmerId,
      thekedarId: input.thekedarId,
      lotBags: lot.bags.length,
      lines,
    }

    let result
    try {
      result = postTradeEntry(tradeEntry, config)
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Invalid trade' }, 400)
    }

    // Ensure every touched account is registered before posting (FK) —
    // farmer/every buyer/thekedar plus the singleton revenue and government
    // (cess) accounts, which no route has ever needed to register until now.
    await Promise.all([
      repo.ensureAccount(zamindarAccount(lot.farmerId)),
      ...buyerIds.map((id) => repo.ensureAccount(id === HOUSE_BUYER_ID ? houseBuyerAccount() : pakkaAccount(id))),
      repo.ensureAccount(thekedarAccount(input.thekedarId)),
      repo.ensureAccount({ id: REVENUE_ID, kind: 'revenue' }),
      repo.ensureAccount(governmentAccount()),
    ])

    // Pre-trade farmer balance, for the settlement cascade breakdown
    // (ADR-0008) — the ledger itself already nets correctly regardless of
    // read order; this is purely to show *how* proceeds were applied.
    const preBalance = await repo.balanceOf(lot.farmerId)

    await repo.recordEntry(
      { id: input.entryId, kind: 'trade', postings: result.postings },
      { actorUserId: c.get('userId') },
    )

    const settlement = settleFarmerProceeds(preBalance, result.farmerBill.net)

    // A house purchase (ADR-0005): stock enters the Godown at cost = farmer
    // net + the full labour paid to the contractor (godown.ts's
    // houseBuyCost) — self-commission is suppressed from revenue already by
    // postTradeEntry(), so this cost basis is exactly what makes the
    // purchase net-worth-neutral (issue #12's reconciliation oracle; see the
    // module comment in domain/godown.ts and routes/dashboard.ts).
    let godown
    if (isHousePurchase) {
      const thekedarLabour = result.postings.find((p) => p.accountId === input.thekedarId)?.amount ?? pkr(0)
      const costBasis = houseBuyCost(result.farmerBill.net, thekedarLabour)
      const netKg = result.payableMaunds * KG_PER_MAUND
      const bagsBought = lineSpecs.reduce((sum, l) => sum + l.bagCount, 0)
      godown = await new GodownRepository(c.env.DB).receiveStock({ bags: bagsBought, netKg, costBasis })
    }

    return c.json(
      {
        entryId: input.entryId,
        lotNumber: input.lotNumber,
        farmerId: lot.farmerId,
        thekedarId: input.thekedarId,
        payableMaunds: result.payableMaunds,
        farmerBill: result.farmerBill,
        buyerInvoices: result.buyerInvoices,
        settlement,
        ...(godown ? { godown } : {}),
      },
      201,
    )
  },
)
