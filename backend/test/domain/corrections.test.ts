import { describe, it, expect } from 'vitest'
import { pkr } from '../../src/domain/money'
import { rokarAccount, zamindarAccount, openingBalance, issuePeshiAdvance, balanceOf, type Entry } from '../../src/domain/posting'
import { editEntry, deleteEntry, appendToChangeLog, reverseEntry, isEntrySettled, type ChangeLogRow } from '../../src/domain/corrections'

// Issue #13 — corrections via mutable entries + an append-only change log.
// Governing: ADR-0011.

describe('editing an entry recomputes affected ledger balances (issue #13)', () => {
  it('correcting a mis-entered advance amount changes the derived balances', () => {
    const rokar = rokarAccount()
    const farmer = zamindarAccount('farmer-ali')
    const stream: Entry[] = [
      openingBalance('open', rokar, pkr(1_000_000)),
      issuePeshiAdvance('adv-1', farmer, pkr(200_000)), // mis-entered — should have been 150,000
    ]
    expect(balanceOf(stream, 'farmer-ali')).toBe(-200_000)
    expect(balanceOf(stream, 'rokar')).toBe(800_000)

    const corrected = issuePeshiAdvance('adv-1', farmer, pkr(150_000))
    const { stream: newStream } = editEntry(stream, 'adv-1', corrected, 'owner', '2026-07-01T10:00:00Z')

    expect(balanceOf(newStream, 'farmer-ali')).toBe(-150_000)
    expect(balanceOf(newStream, 'rokar')).toBe(850_000)
    // original stream is untouched — edits produce a new stream, they don't mutate in place
    expect(balanceOf(stream, 'farmer-ali')).toBe(-200_000)
  })

  it('deleting an entry also recomputes balances correctly', () => {
    const rokar = rokarAccount()
    const farmer = zamindarAccount('farmer-ali')
    const stream: Entry[] = [
      openingBalance('open', rokar, pkr(1_000_000)),
      issuePeshiAdvance('adv-1', farmer, pkr(200_000)),
    ]
    const { stream: newStream } = deleteEntry(stream, 'adv-1', 'owner', '2026-07-01T10:00:00Z')

    expect(balanceOf(newStream, 'farmer-ali')).toBe(0)
    expect(balanceOf(newStream, 'rokar')).toBe(1_000_000)
  })

  it('rejects editing or deleting an entry that does not exist', () => {
    const stream: Entry[] = [openingBalance('open', rokarAccount(), pkr(1_000_000))]
    expect(() => editEntry(stream, 'nope', stream[0]!, 'owner', 't')).toThrow()
    expect(() => deleteEntry(stream, 'nope', 'owner', 't')).toThrow()
  })
})

describe('every mutation writes an append-only change-log row (issue #13)', () => {
  it('an edit logs the entity, before -> after, actor, and timestamp', () => {
    const farmer = zamindarAccount('farmer-ali')
    const stream: Entry[] = [issuePeshiAdvance('adv-1', farmer, pkr(200_000))]
    const corrected = issuePeshiAdvance('adv-1', farmer, pkr(150_000))

    const { logRow } = editEntry(stream, 'adv-1', corrected, 'owner-umar', '2026-07-01T10:00:00Z')

    expect(logRow.entryId).toBe('adv-1')
    expect(logRow.action).toBe('edit')
    expect(logRow.before).toEqual(stream[0])
    expect(logRow.after).toEqual(corrected)
    expect(logRow.actor).toBe('owner-umar')
    expect(logRow.timestamp).toBe('2026-07-01T10:00:00Z')
  })

  it('a delete logs before -> null', () => {
    const farmer = zamindarAccount('farmer-ali')
    const stream: Entry[] = [issuePeshiAdvance('adv-1', farmer, pkr(200_000))]
    const { logRow } = deleteEntry(stream, 'adv-1', 'owner-umar', '2026-07-01T11:00:00Z')

    expect(logRow.action).toBe('delete')
    expect(logRow.before).toEqual(stream[0])
    expect(logRow.after).toBeNull()
  })

  it('the log only ever grows — appendToChangeLog never rewrites prior rows', () => {
    const farmer = zamindarAccount('farmer-ali')
    let stream: Entry[] = [issuePeshiAdvance('adv-1', farmer, pkr(200_000))]
    let log: readonly ChangeLogRow[] = []

    const edit1 = editEntry(stream, 'adv-1', issuePeshiAdvance('adv-1', farmer, pkr(150_000)), 'owner', 't1')
    log = appendToChangeLog(log, edit1.logRow)
    stream = edit1.stream as Entry[]

    const edit2 = editEntry(stream, 'adv-1', issuePeshiAdvance('adv-1', farmer, pkr(120_000)), 'owner', 't2')
    log = appendToChangeLog(log, edit2.logRow)

    expect(log).toHaveLength(2)
    expect(log[0]).toBe(edit1.logRow) // same reference — never rewritten
    expect(log[1]).toBe(edit2.logRow)
    expect(log[0]!.after).toEqual(issuePeshiAdvance('adv-1', farmer, pkr(150_000))) // untouched by the second edit
  })
})

describe('the change log cannot be edited (issue #13)', () => {
  it('a change-log row is frozen — mutating it throws in strict mode', () => {
    const farmer = zamindarAccount('farmer-ali')
    const stream: Entry[] = [issuePeshiAdvance('adv-1', farmer, pkr(200_000))]
    const { logRow } = editEntry(stream, 'adv-1', stream[0]!, 'owner', 't1')

    expect(Object.isFrozen(logRow)).toBe(true)
    expect(() => {
      ;(logRow as { actor: string }).actor = 'someone-else'
    }).toThrow()
  })
})

describe('editing a settled entry surfaces a warning (issue #13)', () => {
  it('warns when the entry id is in the settled set', () => {
    const farmer = zamindarAccount('farmer-ali')
    const stream: Entry[] = [issuePeshiAdvance('adv-1', farmer, pkr(200_000))]
    const corrected = issuePeshiAdvance('adv-1', farmer, pkr(150_000))

    const { warning } = editEntry(stream, 'adv-1', corrected, 'owner', 't1', ['adv-1'])
    expect(warning).toMatch(/settled/i)
  })

  it('does not warn for an unsettled entry', () => {
    const farmer = zamindarAccount('farmer-ali')
    const stream: Entry[] = [issuePeshiAdvance('adv-1', farmer, pkr(200_000))]
    const corrected = issuePeshiAdvance('adv-1', farmer, pkr(150_000))

    const { warning } = editEntry(stream, 'adv-1', corrected, 'owner', 't1', ['some-other-entry'])
    expect(warning).toBeUndefined()
  })

  it('warns on a settled delete too', () => {
    const farmer = zamindarAccount('farmer-ali')
    const stream: Entry[] = [issuePeshiAdvance('adv-1', farmer, pkr(200_000))]
    const { warning } = deleteEntry(stream, 'adv-1', 'owner', 't1', ['adv-1'])
    expect(warning).toMatch(/settled/i)
  })
})

describe('reverseEntry — the append-only correction half (issue #30, ADR-0021)', () => {
  it('negates every posting, cancelling the original entry when appended to the stream', () => {
    const farmer = zamindarAccount('farmer-ali')
    const original = issuePeshiAdvance('adv-1', farmer, pkr(200_000))

    const reversal = reverseEntry('adv-1-reversal', original)
    expect(reversal.id).toBe('adv-1-reversal')
    expect(reversal.kind).toBe(original.kind)
    expect(reversal.postings).toEqual(original.postings.map((p) => ({ accountId: p.accountId, amount: -p.amount })))

    const stream: Entry[] = [original, reversal]
    expect(balanceOf(stream, 'farmer-ali')).toBe(0) // fully cancelled, nothing rewritten
  })

  it('an edit = reversal + fresh corrected entry, appended, nets to the corrected value', () => {
    const farmer = zamindarAccount('farmer-ali')
    const original = issuePeshiAdvance('adv-1', farmer, pkr(200_000))
    const corrected = issuePeshiAdvance('adv-1-corrected', farmer, pkr(150_000))
    const reversal = reverseEntry('adv-1-reversal', original)

    const stream: Entry[] = [original, reversal, corrected]
    expect(balanceOf(stream, 'farmer-ali')).toBe(-150_000) // original never rewritten, just netted out
  })
})

describe('isEntrySettled — downstream settling actions surface a warning (issue #30, ADR-0011)', () => {
  it('is false when nothing downstream has touched the entry\'s accounts', () => {
    const farmer = zamindarAccount('farmer-ali')
    const stream: Entry[] = [issuePeshiAdvance('adv-1', farmer, pkr(200_000))]
    expect(isEntrySettled(stream, 'adv-1')).toBe(false)
  })

  it('is true once a later buyer_payment/contractor_payout/cess_remittance touches the same account', () => {
    const stream: Entry[] = [
      { id: 'trade-1', kind: 'trade', postings: [{ accountId: 'buyer-1', amount: pkr(-100_000) }] },
      { id: 'pay-1', kind: 'buyer_payment', postings: [{ accountId: 'rokar', amount: pkr(100_000) }, { accountId: 'buyer-1', amount: pkr(100_000) }] },
    ]
    expect(isEntrySettled(stream, 'trade-1')).toBe(true)
  })

  it('is false for a nonexistent entry id', () => {
    expect(isEntrySettled([], 'nope')).toBe(false)
  })

  it('ignores a downstream entry that touches a different account entirely', () => {
    const stream: Entry[] = [
      { id: 'trade-1', kind: 'trade', postings: [{ accountId: 'buyer-1', amount: pkr(-100_000) }] },
      { id: 'pay-other', kind: 'buyer_payment', postings: [{ accountId: 'rokar', amount: pkr(50_000) }, { accountId: 'buyer-2', amount: pkr(50_000) }] },
    ]
    expect(isEntrySettled(stream, 'trade-1')).toBe(false)
  })
})
