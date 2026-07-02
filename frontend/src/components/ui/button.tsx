import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from '../../lib/utils'

const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors focus-visible:outline-2 focus-visible:outline-[var(--color-accent)] disabled:opacity-50 disabled:pointer-events-none',
  {
    variants: {
      variant: {
        accent: 'bg-[var(--color-accent)] text-[var(--color-accent-fg)] hover:opacity-90',
        outline: 'border border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-surface)]',
        ghost: 'hover:bg-[var(--color-surface)]',
      },
      size: {
        md: 'min-h-11 px-4 text-base',
        lg: 'min-h-13 px-5 text-lg',
        icon: 'h-14 w-14 rounded-full',
      },
    },
    defaultVariants: { variant: 'accent', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(button({ variant, size }), className)} {...props} />
}
