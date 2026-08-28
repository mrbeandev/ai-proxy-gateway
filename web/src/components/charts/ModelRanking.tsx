import { useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { max as d3max } from 'd3-array'
import { providerColor, providerLabel, formatNumber, formatCost, formatLatency } from '@/lib/utils'
import { ChartEmpty } from './chart-kit'
import { usePrefersReducedMotion, type TopModel, numeric } from './primitives'

/**
 * Top models as a horizontal bar ranking — replaces the old data table.
 *
 * Bar length encodes request count; the trailing figures carry cost, success
 * rate and latency. Each row is a real record from `/api/stats`, so nothing is
 * padded to fill the chart.
 */
export function ModelRanking({ models }: { models: TopModel[] }) {
  const reduced = usePrefersReducedMotion()
  const [active, setActive] = useState<string | null>(null)

  if (!models.length) return <ChartEmpty message="No model traffic yet" height={180} />

  const x = scaleLinear().domain([0, d3max(models, m => m.requests) ?? 1]).range([0, 100])

  return (
    <ul className="flex flex-col gap-0.5">
      {models.map(m => {
        const pct = x(m.requests)
        const on = active === m.model
        const successRate = m.success_rate ?? 0
        return (
          <li
            key={m.model}
            onMouseEnter={() => setActive(m.model)}
            onMouseLeave={() => setActive(null)}
            className="group relative rounded-md px-2 py-1.5 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: providerColor(m.provider) }} />
              <code className="min-w-0 flex-1 truncate font-mono text-xs">{m.model}</code>
              <span className={`shrink-0 text-xs font-medium ${numeric}`}>{formatNumber(m.requests)}</span>
            </div>

            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted/70">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${pct}%`,
                    background: providerColor(m.provider),
                    opacity: on ? 1 : 0.75,
                    transition: reduced ? undefined : 'width 520ms var(--ease-out), opacity 160ms var(--ease-out)',
                  }}
                />
              </div>
              <span className={`shrink-0 text-[10px] text-muted-foreground ${numeric}`}>
                {formatCost(m.cost)} · {successRate.toFixed(0)}% ok · {formatLatency(m.avg_latency)}
              </span>
            </div>

            <span className="sr-only">
              {providerLabel(m.provider)}, {m.requests} requests, {formatCost(m.cost)},{' '}
              {successRate.toFixed(0)}% success, average {formatLatency(m.avg_latency)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
