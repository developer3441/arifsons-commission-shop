// Thin HTTP boundary (architecture.md): resolve config → call the pure trade
// engine (trade.ts, unchanged from round 1) → persist append-only and
// idempotent → respond with the Kacha bill / Pakka invoice / settlement
// breakdown for the New Trade flow's review screen. Issue #23.
//
// The lot must already be registered and weighed (issue #22) — this is the
// back half of the New Trade flow. Single buyer only (split lots across
// multiple buyers is issue #24).

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Repository, LotRepository, ConfigRepository } from '../db/repository'
import { postTradeEntry, type TradeEntry, type TradeConfig } from '../domain/trade'
import { settleFarmerProceeds } from '../domain/settlement'
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

const tradeResponse = z.object({
  entryId: z.string(),
  lotNumber: z.number().int(),
  farmerId: z.string(),
  buyerId: z.string(),
  thekedarId: z.string(),
  payableMaunds: z.number(),
  farmerBill: farmerBillSchema,
  buyerInvoices: z.array(buyerInvoiceSchema),
  settlement: settlementSchema,
})

trades.openapi(
  createRoute({
    method: 'post',
    path: '/trades',
    request: {
      body: {
        content: {
          'application/json': {
            schema: z.object({
              entryId: z.string(),
              lotNumber: z.number().int(),
              buyerId: z.string(),
              thekedarId: z.string(),
              ratePerMaund: z.number().int().positive(),
              kattKgPerBag: z.number().optional(),
              bagBearer: bearerSchema.optional(),
              labourBearer: bearerSchema.optional(),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: 'Trade posted', content: { 'application/json': { schema: tradeResponse } } },
      400: { description: 'Invalid trade (e.g. an empty lot)' },
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

    // Resolve TradeConfig: shop defaults (issue #18), with per-customer
    // overrides layered on top (issue #17) — the same "per-invoice >
    // per-customer > global" precedence trade.ts's own resolve() applies,
    // just assembled here before the pure engine runs.
    const [shopConfig, farmerContact, buyerContact] = await Promise.all([
      new ConfigRepository(c.env.DB).getConfig(),
      repo.getContact(lot.farmerId),
      repo.getContact(input.buyerId),
    ])

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
      ...(buyerContact?.buyerCommissionRate !== undefined
        ? { customerBuyerCommissionRate: { [input.buyerId]: buyerContact.buyerCommissionRate } }
        : {}),
    }

    const tradeEntry: TradeEntry = {
      id: input.entryId,
      farmerId: lot.farmerId,
      thekedarId: input.thekedarId,
      lotBags: lot.bags.length,
      lines: [
        {
          buyerId: input.buyerId,
          bags: lot.bags.map((b) => ({ grossKg: b.grossKg })),
          ratePerMaund: input.ratePerMaund,
          kattKgPerBag: input.kattKgPerBag,
          bagBearer: input.bagBearer,
          labourBearer: input.labourBearer,
        },
      ],
    }

    let result
    try {
      result = postTradeEntry(tradeEntry, config)
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Invalid trade' }, 400)
    }

    // Ensure every touched account is registered before posting (FK) —
    // farmer/buyer/thekedar plus the singleton revenue and government
    // (cess) accounts, which no route has ever needed to register until now.
    await Promise.all([
      repo.ensureAccount(zamindarAccount(lot.farmerId)),
      repo.ensureAccount(pakkaAccount(input.buyerId)),
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

    return c.json(
      {
        entryId: input.entryId,
        lotNumber: input.lotNumber,
        farmerId: lot.farmerId,
        buyerId: input.buyerId,
        thekedarId: input.thekedarId,
        payableMaunds: result.payableMaunds,
        farmerBill: result.farmerBill,
        buyerInvoices: result.buyerInvoices,
        settlement,
      },
      201,
    )
  },
)
