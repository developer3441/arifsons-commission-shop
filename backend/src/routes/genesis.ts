// Thin HTTP boundary (architecture.md): validate → ensure the touched
// accounts exist → build the genesis entry via the pure domain layer
// (genesis.ts) → persist via the repository → respond. Owner-only
// (ADR-0020/0022), and enforced as a true one-time action: the entry always
// carries the fixed id 'genesis', and Repository.recordEntry is already
// idempotent on entry id (ADR-0021) — a second attempt is rejected with 409
// rather than silently re-applied, so a mistake is corrected by a further
// adjusting entry (a Peshi advance, a cash action, ...), never by rewriting
// genesis.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Repository } from '../db/repository'
import { pkr } from '../domain/money'
import { postGenesis } from '../domain/genesis'
import { rokarAccount, zamindarAccount, pakkaAccount, thekedarAccount } from '../domain/posting'
import { requireAuth, requireOwner, type AuthedBindings, type AuthedVariables } from './middleware'

export type Bindings = AuthedBindings & { DB: D1Database }

export const genesis = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthedVariables }>()

genesis.use('/genesis', requireAuth, requireOwner)

const balanceEntry = z.object({ id: z.string(), name: z.string().optional(), balance: z.number().int() })

const genesisRequest = z.object({
  businessDate: z.string().optional(),
  rokarOpening: z.number().int().default(0),
  farmerBalances: z.array(balanceEntry).default([]),
  buyerBalances: z.array(balanceEntry).default([]),
  contractorBalances: z.array(balanceEntry).default([]),
})

const GENESIS_ID = 'genesis'

genesis.openapi(
  createRoute({
    method: 'post',
    path: '/genesis',
    request: { body: { content: { 'application/json': { schema: genesisRequest } } } },
    responses: {
      201: {
        description: 'Genesis entry posted',
        content: { 'application/json': { schema: z.object({ id: z.string(), postings: z.number().int() }) } },
      },
      400: { description: 'Nothing to import' },
      409: { description: 'Genesis has already been run' },
    },
  }),
  async (c) => {
    const input = c.req.valid('json')
    const repo = new Repository(c.env.DB)

    await repo.ensureAccount(rokarAccount())
    for (const f of input.farmerBalances) await repo.ensureAccount(zamindarAccount(f.id, f.name))
    for (const b of input.buyerBalances) await repo.ensureAccount(pakkaAccount(b.id, b.name))
    for (const t of input.contractorBalances) await repo.ensureAccount(thekedarAccount(t.id, t.name))

    let entry
    try {
      entry = postGenesis(GENESIS_ID, {
        rokarOpening: pkr(input.rokarOpening),
        farmerBalances: input.farmerBalances.map((f) => ({ farmerId: f.id, balance: pkr(f.balance) })),
        buyerBalances: input.buyerBalances.map((b) => ({ buyerId: b.id, balance: pkr(b.balance) })),
        contractorBalances: input.contractorBalances.map((t) => ({ thekedarId: t.id, balance: pkr(t.balance) })),
      })
    } catch {
      return c.json({ error: 'Nothing to import — every balance is zero' }, 400)
    }

    const { wasNew } = await repo.recordEntry(entry, {
      businessDate: input.businessDate,
      actorUserId: c.get('userId'),
    })
    if (!wasNew) {
      return c.json(
        {
          error:
            'Genesis has already been run. Correct a mistake with a further adjusting entry, not by rewriting genesis (ADR-0022).',
        },
        409,
      )
    }

    return c.json({ id: entry.id, postings: entry.postings.length }, 201)
  },
)
