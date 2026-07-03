// Money & weight formatting. Western digits ALWAYS, in both languages
// (ADR-0030) — 'en-US' guarantees Latin digits and stable grouping; callers
// wrap the output in the `.num` class so it renders in a Latin font (crisp
// inside Nastaliq) and never changes shape on a language toggle. Whole PKR
// rupees, weight to 0.01 (ADR-0009).

export function formatPkr(amount: number): string {
  return `PKR ${Math.abs(amount).toLocaleString('en-US')}`
}

export function formatMaund(maunds: number): string {
  return `${maunds.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} maund`
}
