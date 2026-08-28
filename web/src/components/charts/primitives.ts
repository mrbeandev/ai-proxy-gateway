import { useEffect, useRef, useState, type ReactNode } from 'react'

/**
 * Non-component chart helpers.
 *
 * These live apart from `chart-kit.tsx` so that file exports components only —
 * mixing component and non-component exports breaks React Fast Refresh.
 */

/** Shape of a single day row from `GET /api/stats/activity`. */
export interface ActivityDay {
  day_ts: number
  requests: number
  success: number
  errors: number
  tokens: number
  cost: number
  successRate: number
  /** Per-provider request counts are merged in as dynamic keys. */
  [provider: string]: number
}

export interface HeatCell {
  dow: number
  hour: number
  requests: number
}

export interface ProviderSplitRow {
  provider: string
  requests: number
  tokens: number
  cost: number
  success: number
  avg_latency: number
}

export interface TopModel {
  model: string
  provider: string
  requests: number
  tokens: number
  cost: number
  success_rate: number
  avg_latency: number
}

export interface TooltipState {
  x: number
  y: number
  content: ReactNode
}

/** Observes the container and returns its pixel width (height is caller-set). */
export function useChartWidth<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0
      setWidth(prev => (Math.abs(prev - w) > 1 ? w : prev))
    })
    ro.observe(el)
    setWidth(el.getBoundingClientRect().width)
    return () => ro.disconnect()
  }, [])

  return [ref, width] as const
}

/** True when the user asked for reduced motion; charts then skip draw-on animation. */
export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

/** Tabular-figures styling used across every chart label. */
export const numeric = 'tabular-nums'
