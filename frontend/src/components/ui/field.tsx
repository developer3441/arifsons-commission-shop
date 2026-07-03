import type { ReactNode } from 'react'

// Shared labelled field + input styling for the mobile-first forms (tokens,
// thumb-tall, visible focus ring, RTL-safe). Amount/number inputs add `num`.
export const fieldClass =
  'min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 ' +
  'focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50'

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-[var(--color-muted)]">{label}</span>
      {children}
    </label>
  )
}
