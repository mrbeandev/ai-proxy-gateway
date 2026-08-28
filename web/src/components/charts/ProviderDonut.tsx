import { useMemo, useState } from 'react'
import { pie as d3pie, arc as d3arc, type PieArcDatum } from 'd3-shape'
import { providerColor, providerLabel, formatCost, formatNumber } from '@/lib/utils'
import { ChartEmpty } from './chart-kit'
import { usePrefersReducedMotion, type ProviderSplitRow, numeric } from './primitives'

const SIZE = 168
const R = SIZE / 2
const THICK = 26

/**
 * Provider traffic split. The donut carries share-of-requests; the legend
 * carries the numbers that a ring can't encode honestly (cost, tokens, avg
 * latency), so no value is ever implied by arc length alone.
 */
export function ProviderDonut({ rows }: { rows: ProviderSplitRow[] }) {
  const reduced = usePrefersReducedMotion()
  const [active, setActive] = useState<string | null>(null)

  const total = rows.reduce((a, r) => a + r.requests, 0)
  const arcs = useMemo(() => {
    const p = d3pie<ProviderSplitRow>().value(d => d.requests).sort(null).padAngle(0.02)
    return p(rows)
  }, [rows])

  if (!rows.length || total === 0) return <ChartEmpty message="No provider traffic yet" height={SIZE} />

  const arcGen = d3arc<PieArcDatum<ProviderSplitRow>>().innerRadius(R - THICK).outerRadius(R).cornerRadius(3)
  const arcHover = d3arc<PieArcDatum<ProviderSplitRow>>().innerRadius(R - THICK - 3).outerRadius(R + 3).cornerRadius(3)
  const focused = rows.find(r => r.provider === active)

  return (
    <div className="flex flex-wrap items-center gap-5">
      <svg width={SIZE} height={SIZE} role="img" aria-label="Requests by provider" className="shrink-0">
        <g transform={`translate(${R},${R})`}>
          {arcs.map(a => {
            const isOn = active === a.data.provider
            return (
              <path
                key={a.data.provider}
                d={(isOn ? arcHover(a) : arcGen(a)) ?? undefined}
                fill={providerColor(a.data.provider)}
                fillOpacity={active && !isOn ? 0.3 : 0.9}
                onMouseEnter={() => setActive(a.data.provider)}
                onMouseLeave={() => setActive(null)}
                style={{
                  transition: reduced ? undefined : 'fill-opacity 160ms var(--ease-out)',
                  cursor: 'pointer',
                }}
              />
            )
          })}
          <text textAnchor="middle" dy="-0.1em" className={`fill-foreground text-lg font-semibold ${numeric}`}>
            {focused ? `${Math.round((focused.requests / total) * 100)}%` : formatNumber(total)}
          </text>
          <text textAnchor="middle" dy="1.3em" className="fill-muted-foreground text-[10px]">
            {focused ? providerLabel(focused.provider) : 'requests'}
          </text>
        </g>
      </svg>

      <ul className="flex min-w-40 flex-1 flex-col gap-1.5">
        {rows.map(r => (
          <li
            key={r.provider}
            onMouseEnter={() => setActive(r.provider)}
            onMouseLeave={() => setActive(null)}
            className="flex items-center gap-2 rounded-md px-1.5 py-1 text-xs transition-colors hover:bg-muted/60"
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: providerColor(r.provider) }} />
            <span className="min-w-0 flex-1 truncate">{providerLabel(r.provider)}</span>
            <span className={`text-muted-foreground ${numeric}`}>{formatCost(r.cost)}</span>
            <span className={`w-10 text-right font-medium ${numeric}`}>
              {Math.round((r.requests / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
