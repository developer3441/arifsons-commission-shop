// Money is whole PKR rupees — no paisa — stored as an integer. (ADR-0009)
// Rounding happens once at a line total, never mid-calculation; this type only
// guarantees that nothing but a whole rupee ever reaches a posting.

export type PKR = number & { readonly __brand: 'PKR' }

/**
 * Construct a PKR amount, rejecting anything that is not a whole rupee (ADR-0009).
 * Sign is allowed: postings carry signed amounts — a Peshi advance posts negative.
 */
export function pkr(rupees: number): PKR {
  if (!Number.isInteger(rupees)) {
    throw new RangeError(`Money must be whole PKR rupees (ADR-0009); got ${rupees}`)
  }
  return rupees as PKR
}

export function addPkr(a: PKR, b: PKR): PKR {
  return (a + b) as PKR
}

export function negatePkr(a: PKR): PKR {
  return -a as PKR
}
