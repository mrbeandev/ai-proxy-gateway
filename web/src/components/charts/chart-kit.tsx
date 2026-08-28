import type { ReactNode } from 'react'
import type { TooltipState } from './primitives'

/**
 * Shared chart components.
 *
 * Division of labour: d3 owns the maths (scales, shapes, bins, stacks), React
 * owns the DOM. Nothing here mutates nodes through a ref, so charts re-render
 * predictably and honour `prefers-reduced-motion` without teardown logic.
 *
 * Hooks and types live in `./primitives` so this file exports components only.
 */

/**
 * Floating tooltip. Positioned inside the chart's relative container and
 * flipped when it would overflow the right edge.
 */
export function ChartTooltip({ tip, width }: { tip: TooltipState | null; width: number }) {
  if (!tip) return null
  const flip = tip.x > width - 150
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute z-20 rounded-lg bg-popover px-2.5 py-1.5 text-xs shadow-lg"
      style={{
        left: tip.x,
        top: tip.y,
        transform: `translate(${flip ? 'calc(-100% - 12px)' : '12px'}, -50%)`,
        maxWidth: 220,
      }}
    >
      {tip.content}
    </div>
  )
}

/** Consistent empty state so a data-less panel never renders as a blank box. */
export function ChartEmpty({ message, height }: { message: string; height: number }) {
  return (
    <div
      className="flex items-center justify-center rounded-lg bg-muted/40 text-xs text-muted-foreground"
      style={{ height }}
    >
      {message}
    </div>
  )
}

/** Panel wrapper: title, optional right-hand meta, and the chart body. */
export function ChartPanel({
  title,
  meta,
  children,
  className = '',
}: {
  title: string
  meta?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-xl bg-card p-4 ${className}`}>
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {meta && <span className="text-[11px] text-muted-foreground">{meta}</span>}
      </header>
      {children}
    </section>
  )
}
