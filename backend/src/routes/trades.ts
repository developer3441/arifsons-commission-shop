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

const lineSchema = z.object({
  buyerId: z.string(),
  bagCount: z.number().int().positive(),
  ratePerMaund: z.number().int().positive(),
  kattKgPerBag: z.number().optional(),
  bagBearer: bearerSchema.optional(),
  labourBearer: bearerSchema.optional(),
})

trades.openapi(
  createRoute({
    method: 'post',
    path: '/trades',
    request: {
      body: {
        content: {
          'application/json': {
            // A trade names its lot one of two ways:
            //  - `lotNumber` — an existing weighed lot (online weigh-as-you-go,
            //    issue #22/#23), OR
            //  - `farmerId` + `bags` — an inline, self-contained atomic submission
            //    (ADR-0032): the server creates the lot + bag records and assigns
            //    the lot number at submit time, so the whole trade composes offline.
            // Buyers are named either by the single-buyer shorthand (buyerId +
            // ratePerMaund, using every bag) or an explicit split `lines` array
            // (ADR-0006). Idempotent on entryId (ADR-0021).
            schema: z
              .object({
                entryId: z.string(),
                thekedarId: z.string(),
                lotNumber: z.number().int().optional(),
                farmerId: z.string().optional(),
                businessDate: z.string().optional(),
                bags: z.array(z.object({ grossKg: z.number().positive() })).optional(),
                buyerId: z.string().optional(),
                ratePerMaund: z.number().int().positive().optional(),
                kattKgPerBag: z.number().optional(),
                bagBearer: bearerSchema.optional(),
                labourBearer: bearerSchema.optional(),
                lines: z.array(lineSchema).optional(),
              })
              .refine((v) => v.lotNumber !== undefined || (v.farmerId !== undefined && v.bags?.length), {
                message: 'Provide either lotNumber, or farmerId + bags (inline atomic submission)',
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

    // Idempotent replay (ADR-0032/0021): return the original response verbatim.
    // Checked before any write so an inline resubmission never creates a second
    // lot, and the original server-assigned lot number / settlement are returned.
    const prior = await repo.getTradeSubmission(input.entryId)
    if (prior) return c.json(prior as z.infer<typeof tradeResponse>, 201)

    // Resolve where the lot comes from — but do NOT persist an inline lot yet:
    // a rejected trade (oversell, bad engine input) must write nothing (ADR-0032
    // atomicity), so lot creation happens only after every guard passes below.
    let farmerId: string
    let bags: { grossKg: number }[]
    let existingLotNumber: number | undefined
    if (input.farmerId !== undefined && input.bags?.length) {
      farmerId = input.farmerId
      bags = input.bags
    } else {
      const lot = await lotRepo.getLot(input.lotNumber!)
      if (!lot) return c.json({ error: 'No such lot' }, 404)
      if (lot.bags.length === 0) return c.json({ error: 'This lot has no weighed bags yet' }, 400)
      farmerId = lot.farmerId
      bags = lot.bags.map((b) => ({ grossKg: b.grossKg }))
      existingLotNumber = lot.lotNumber
    }

    // Normalise both buyer shapes into one `lines` list; the single-buyer
    // shorthand takes every bag in the lot.
    const lineSpecs = input.lines?.length
      ? input.lines
      : [
          {
            buyerId: input.buyerId!,
            bagCount: bags.length,
            ratePerMaund: input.ratePerMaund!,
            kattKgPerBag: input.kattKgPerBag,
            bagBearer: input.bagBearer,
            labourBearer: input.labourBearer,
          },
        ]

    // Oversell guard (ADR-0019): checked against the *requested* bag counts
    // before slicing — Array.slice() silently clamps to what's available, which
    // would otherwise let an oversell slip past postTradeEntry()'s own guard.
    const totalRequested = lineSpecs.reduce((sum, l) => sum + l.bagCount, 0)
    if (totalRequested > bags.length) {
      return c.json(
        { error: `Oversell: ${totalRequested} bags requested across lines exceeds the lot's ${bags.length} bags` },
        400,
      )
    }

    const buyerIds = [...new Set(lineSpecs.map((l) => l.buyerId))]

    // A house (Beopari) purchase reuses this same flow with buyerId = HOUSE_BUYER_ID
    // (ADR-0005) — but the Godown cost-basis math below (houseBuyCost) only holds
    // when the WHOLE trade's rolled-up farmerBill/thekedar labour went to the
    // house, so a split lot may not mix a house-buyer line with a real buyer.
    const isHousePurchase = buyerIds.includes(HOUSE_BUYER_ID)
    if (isHousePurchase && buyerIds.length > 1) {
      return c.json({ error: 'Cannot mix a house-buyer (Beopari) line with a real buyer in the same trade' }, 400)
    }

    // Resolve TradeConfig: shop defaults (issue #18) with per-customer overrides
    // layered on (issue #17) — the same precedence trade.ts's resolve() applies.
    const [shopConfig, farmerContact, buyerContacts] = await Promise.all([
      new ConfigRepository(c.env.DB).getConfig(),
      repo.getContact(farmerId),
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
        ? { customerKattKgPerBag: { [farmerId]: farmerContact.kattKgPerBag } }
        : {}),
      ...(farmerContact?.bagBearer !== undefined ? { customerBagBearer: { [farmerId]: farmerContact.bagBearer } } : {}),
      ...(farmerContact?.labourBearer !== undefined
        ? { customerLabourBearer: { [farmerId]: farmerContact.labourBearer } }
        : {}),
      ...(farmerContact?.commissionRate !== undefined
        ? { customerFarmerCommissionRate: { [farmerId]: farmerContact.commissionRate } }
        : {}),
      ...(Object.keys(customerBuyerCommissionRate).length ? { customerBuyerCommissionRate } : {}),
    }

    // Slice the bags by each line's bagCount, in weighing order.
    let cursor = 0
    const lines = lineSpecs.map((spec) => {
      const lineBags = bags.slice(cursor, cursor + spec.bagCount).map((b) => ({ grossKg: b.grossKg }))
      cursor += spec.bagCount
      return {
        buyerId: spec.buyerId,
        bags: lineBags,
        ratePerMaund: spec.ratePerMaund,
        kattKgPerBag: spec.kattKgPerBag,
        bagBearer: spec.bagBearer,
        labourBearer: spec.labourBearer,
      }
    })

    const tradeEntry: TradeEntry = {
      id: input.entryId,
      farmerId,
      thekedarId: input.thekedarId,
      lotBags: bags.length,
      lines,
    }

    let result
    try {
      result = postTradeEntry(tradeEntry, config)
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : 'Invalid trade' }, 400)
    }

    // Every guard has passed — now assign the lot (creating it inline if this is
    // an atomic submission) so a rejected trade leaves no orphan lot behind.
    const lotNumber =
      existingLotNumber ??
      (await (async () => {
        const created = await lotRepo.createLot(farmerId, input.businessDate)
        await lotRepo.addBags(created.lotNumber, bags.map((b) => b.grossKg))
        return created.lotNumber
      })())

    // Ensure every touched account is registered before posting (FK).
    await Promise.all([
      repo.ensureAccount(zamindarAccount(farmerId)),
      ...buyerIds.map((id) => repo.ensureAccount(id === HOUSE_BUYER_ID ? houseBuyerAccount() : pakkaAccount(id))),
      repo.ensureAccount(thekedarAccount(input.thekedarId)),
      repo.ensureAccount({ id: REVENUE_ID, kind: 'revenue' }),
      repo.ensureAccount(governmentAccount()),
    ])

    // Pre-trade farmer balance, for the settlement cascade breakdown (ADR-0008).
    const preBalance = await repo.balanceOf(farmerId)

    const { wasNew } = await repo.recordEntry(
      { id: input.entryId, kind: 'trade', postings: result.postings },
      { actorUserId: c.get('userId') },
    )

    const settlement = settleFarmerProceeds(preBalance, result.farmerBill.net)

    // A house purchase (ADR-0005): stock enters the Godown at cost = farmer net +
    // the full labour paid to the contractor (godown.ts's houseBuyCost). Gated on
    // wasNew so a raced duplicate (past the snapshot check) can't double-receive.
    let godown
    if (isHousePurchase && wasNew) {
      const thekedarLabour = result.postings.find((p) => p.accountId === input.thekedarId)?.amount ?? pkr(0)
      const costBasis = houseBuyCost(result.farmerBill.net, thekedarLabour)
      const netKg = result.payableMaunds * KG_PER_MAUND
      const bagsBought = lineSpecs.reduce((sum, l) => sum + l.bagCount, 0)
      godown = await new GodownRepository(c.env.DB).receiveStock({ bags: bagsBought, netKg, costBasis })
    }

    const response = {
      entryId: input.entryId,
      lotNumber,
      farmerId,
      thekedarId: input.thekedarId,
      payableMaunds: result.payableMaunds,
      farmerBill: result.farmerBill,
      buyerInvoices: result.buyerInvoices,
      settlement,
      ...(godown ? { godown } : {}),
    }

    // Persist the response for idempotent replay (ADR-0032) — only for a genuinely
    // new post, so a legacy resubmission without a snapshot doesn't overwrite.
    if (wasNew) await repo.saveTradeSubmission(input.entryId, response)

    return c.json(response, 201)
  },
)
