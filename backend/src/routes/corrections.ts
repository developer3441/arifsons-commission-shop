// Thin HTTP boundary (architecture.md): read the current stream → call the
// pure corrections helpers (domain/corrections.ts) → persist append-only →
// respond. Issue #30, ADR-0011 (clarified) + ADR-0021.
//
// The DB physically forbids UPDATE/DELETE on `postings` and `change_log`
// (migration 0001, ADR-0021), so a correction here is never a rewrite: it's
// a reversal entry (negating the original) plus — for an edit — a fresh
// corrected entry, both appended, plus one change-log row. Reusing
// editEntry()/deleteEntry() (unchanged from round 1) for the change-log row
// itself is safe: those functions' returned `stream` is simply not used —
// only their `logRow`/`warning` are, which are computed the same way either
// way.

import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi'
import { Repository } from '../db/repository'
import { editEntry, deleteEntry, isEntrySettled, reverseEntry, type ChangeLogRow } from '../domain/corrections'
import { pkr } from '../domain/money'
import { type Entry } from '../domain/posting'
import { requireAuth, type AuthedBindings, type AuthedVariables } from './middleware'

export type Bindings = AuthedBindings & { DB: D1Database }

export const corrections = new OpenAPIHono<{ Bindings: Bindings; Variables: AuthedVariables }>()

corrections.use('/entries/*', requireAuth)
corrections.use('/changelog', requireAuth)

const postingSchema = z.object({ accountId: z.string(), amount: z.number().int() })
const entrySchema = z.object({ id: z.string(), kind: z.string(), postings: z.array(postingSchema) })

const changeLogRowSchema = z.object({
  id: z.string(),
  entryId: z.string(),
  action: z.enum(['edit', 'delete']),
  before: entrySchema,
  after: entrySchema.nullable(),
  actor: z.string(),
  timestamp: z.string(),
})

// --- read one entry's current postings (also used to prefill an edit) ---
corrections.openapi(
  createRoute({
    method: 'get',
    path: '/entries/{id}',
    request: { params: z.object({ id: z.string() }) },
    responses: {
      200: { description: 'The entry, with its current postings', content: { 'application/json': { schema: entrySchema } } },
      404: { description: 'No such entry' },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const entry = await new Repository(c.env.DB).getEntry(id)
    if (!entry) return c.json({ error: 'Not found' }, 404)
    return c.json(entry, 200)
  },
)

// --- the full change history, newest first (the Corrections & audit log screen) ---
corrections.openapi(
  createRoute({
    method: 'get',
    path: '/changelog',
    responses: {
      200: { description: 'Every correction ever made, newest first', content: { 'application/json': { schema: z.array(changeLogRowSchema) } } },
    },
  }),
  async (c) => {
    const rows = await new Repository(c.env.DB).listChangeLog()
    const body = rows.map((r) => ({
      id: r.id,
      entryId: r.entryId,
      action: r.action,
      before: { id: r.before.id, kind: r.before.kind, postings: r.before.postings.map((p) => ({ accountId: p.accountId, amount: p.amount })) },
      after: r.after ? { id: r.after.id, kind: r.after.kind, postings: r.after.postings.map((p) => ({ accountId: p.accountId, amount: p.amount })) } : null,
      actor: r.actor,
      timestamp: r.timestamp,
    }))
    return c.json(body, 200)
  },
)

// --- edit an entry: append a reversal + a fresh corrected entry, log the change ---
corrections.openapi(
  createRoute({
    method: 'post',
    path: '/entries/{id}/edit',
    request: {
      params: z.object({ id: z.string() }),
      body: {
        content: {
          'application/json': {
            schema: z.object({
              reversalEntryId: z.string(),
              correctedEntryId: z.string(),
              postings: z.array(postingSchema).min(1),
            }),
          },
        },
      },
    },
    responses: {
      201: {
        description: 'Correction posted: a reversal + the corrected entry, plus a change-log row',
        content: {
          'application/json': {
            schema: z.object({
              entryId: z.string(),
              reversalEntryId: z.string(),
              correctedEntryId: z.string(),
              warning: z.string().optional(),
            }),
          },
        },
      },
      403: { description: 'Editing a settled entry requires the Owner role' },
      404: { description: 'No such entry' },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const { reversalEntryId, correctedEntryId, postings } = c.req.valid('json')
    const repo = new Repository(c.env.DB)

    const stream = await repo.allEntries()
    const original = stream.find((e) => e.id === id)
    if (!original) return c.json({ error: 'Not found' }, 404)

    // Settled entries aren't blocked, but are Owner-only (ADR-0011, clarified).
    const settled = isEntrySettled(stream, id)
    if (settled && c.get('role') !== 'owner') {
      return c.json({ error: 'Forbidden: editing a settled entry requires the Owner role' }, 403)
    }

    const updated: Entry = { id: correctedEntryId, kind: original.kind, postings: postings.map((p) => ({ accountId: p.accountId, amount: pkr(p.amount) })) }
    const { logRow, warning } = editEntry(stream, id, updated, c.get('userId'), new Date().toISOString(), settled ? [id] : [])

    // Idempotent on the client-supplied reversalEntryId (ADR-0021): a retry
    // that already succeeded is a safe no-op — recordEntry reports whether
    // the reversal was newly written, and we gate the rest of the write on
    // that so a retry never double-logs or double-corrects.
    const reversal = reverseEntry(reversalEntryId, original)
    const { wasNew } = await repo.recordEntry(reversal, { actorUserId: c.get('userId') })
    if (wasNew) {
      await repo.recordEntry(updated, { actorUserId: c.get('userId') })
      const persistedLogRow: ChangeLogRow = { ...logRow, id: `changelog-${reversalEntryId}` }
      await repo.recordChangeLog(persistedLogRow)
    }

    return c.json({ entryId: id, reversalEntryId, correctedEntryId, ...(warning ? { warning } : {}) }, 201)
  },
)

// --- delete an entry: append a reversal, log the change ---
corrections.openapi(
  createRoute({
    method: 'post',
    path: '/entries/{id}/delete',
    request: {
      params: z.object({ id: z.string() }),
      body: { content: { 'application/json': { schema: z.object({ reversalEntryId: z.string() }) } } },
    },
    responses: {
      201: {
        description: 'Deletion posted: a reversal entry, plus a change-log row',
        content: {
          'application/json': {
            schema: z.object({ entryId: z.string(), reversalEntryId: z.string(), warning: z.string().optional() }),
          },
        },
      },
      403: { description: 'Deleting a settled entry requires the Owner role' },
      404: { description: 'No such entry' },
    },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    const { reversalEntryId } = c.req.valid('json')
    const repo = new Repository(c.env.DB)

    const stream = await repo.allEntries()
    const original = stream.find((e) => e.id === id)
    if (!original) return c.json({ error: 'Not found' }, 404)

    const settled = isEntrySettled(stream, id)
    if (settled && c.get('role') !== 'owner') {
      return c.json({ error: 'Forbidden: deleting a settled entry requires the Owner role' }, 403)
    }

    const { logRow, warning } = deleteEntry(stream, id, c.get('userId'), new Date().toISOString(), settled ? [id] : [])

    const reversal = reverseEntry(reversalEntryId, original)
    const { wasNew } = await repo.recordEntry(reversal, { actorUserId: c.get('userId') })
    if (wasNew) {
      const persistedLogRow: ChangeLogRow = { ...logRow, id: `changelog-${reversalEntryId}` }
      await repo.recordChangeLog(persistedLogRow)
    }

    return c.json({ entryId: id, reversalEntryId, ...(warning ? { warning } : {}) }, 201)
  },
)
