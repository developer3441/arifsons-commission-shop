import { describe, it, expect } from 'vitest'
import { formatPkr, formatMaund } from './format'

// Western digits ALWAYS (ADR-0030) — the output must be Latin 0-9 regardless
// of UI language, so a money amount never changes shape on a language toggle.
describe('money & weight formatting', () => {
  it('formats PKR with a prefix, absolute value, and Western digits', () => {
    expect(formatPkr(200000)).toBe('PKR 200,000')
    expect(formatPkr(-4500)).toBe('PKR 4,500') // magnitude only; direction is shown by label/colour
  })

  it('uses only Western digits (no Eastern-Arabic numerals)', () => {
    const out = formatPkr(1234567)
    expect(out).toMatch(/[0-9]/)
    expect(out).not.toMatch(/[۰-۹]/)
  })

  it('formats weight to 2 decimal places in maunds', () => {
    expect(formatMaund(12.5)).toBe('12.50 maund')
  })
})
