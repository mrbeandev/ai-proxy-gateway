import { useMemo, useState } from 'react'
import { scaleLinear, scalePoint } from 'd3-scale'
import {
  stack,
  stackOrderNone,
  stackOffsetNone,
  area as d3area,
  curveMonotoneX,
  type SeriesPoint,
} from 'd3-shape'
import { max as d3max } from 'd3-array'
import { providerColor, providerLabel } from '@/lib/utils'
import { ChartTooltip, ChartEmpty } from './chart-kit'
import { useChartWidth, usePrefersReducedMotion, type TooltipState, type ActivityDay, numeric } from './primitives'

const H = 220
const M = { top: 8, right: 8, bottom: 22, left: 34 }

/**
 * Stacked area of requests per provider over the days that actually carried
 * traffic.
 *
 * The x-axis is ORDINAL, not calendar-spaced: this gateway's history is bursty
 * (9 active days inside a 164-day span), so a time axis would render as one
 * cluster of spikes floating in whitespace. Ordinal spacing shows the shape of
 * the traffic; the panel header states the active/span ratio so the compression
 * is never implied to be continuous time.
 */
export function VolumeStream({ days, providers }: { days: ActivityDay[]; providers: string[] }) {
  const [ref, width] = useChartWidth<HTMLDivElement>()
  const reduced = usePrefersReducedMotion()
  const [tip, setTip] = useState<TooltipState | null>(null)
  const [hover, setHover] = useState<number | null>(null)

  const iw = Math.max(0, width - M.left - M.right)
  const ih = H - M.top - M.bottom

  const { series, x, y, ticks } = useMemo(() => {
    const keys = providers.length ? providers : ['requests']
    const x = scalePoint<number>().domain(days.map((_, i) => i)).range([0, iw]).padding(0.5)
    const stacked = stack<ActivityDay>().keys(keys).order(stackOrderNone).offset(stackOffsetNone)(days)
    const top = d3max(stacked, s => d3max(s, d => d[1])) ?? 0
    const y = scaleLinear().domain([0, top || 1]).nice(4).range([ih, 0])
    return { series: stacked, x, y, ticks: y.ticks(4) }
  }, [days, providers, iw, ih])

  if (!days.length) return <ChartEmpty message="No requests recorded yet" height={H} />

  const areaGen = d3area<SeriesPoint<ActivityDay>>()
    .x((_, i) => x(i) ?? 0)
    .y0(d => y(d[0]))
    .y1(d => y(d[1]))
    .curve(curveMonotoneX)

  const fmtDay = (ts: number) =>
    new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={H} role="img" aria-label="Requests per active day by provider">
          <g transform={`translate(${M.left},${M.top})`}>
            {ticks.map(t => (
              <g key={t}>
                <line x1={0} x2={iw} y1={y(t)} y2={y(t)} stroke="var(--color-border)" strokeOpacity={0.5} />
                <text x={-8} y={y(t)} dy="0.32em" textAnchor="end" className={`fill-muted-foreground text-[10px] ${numeric}`}>
                  {t}
                </text>
              </g>
            ))}

            {series.map(s => (
              <path
                key={s.key}
                d={areaGen(s) ?? undefined}
                fill={providerColor(s.key)}
                fillOpacity={0.55}
                stroke={providerColor(s.key)}
                strokeWidth={1.5}
                style={reduced ? undefined : { animation: 'chart-fade 480ms var(--ease-out) both' }}
              />
            ))}

            {hover !== null && (
              <line
                x1={x(hover) ?? 0}
                x2={x(hover) ?? 0}
                y1={0}
                y2={ih}
                stroke="var(--color-foreground)"
                strokeOpacity={0.35}
                strokeDasharray="3 3"
              />
            )}

            {days.map((d, i) => (
              <rect
                key={d.day_ts}
                x={(x(i) ?? 0) - iw / days.length / 2}
                y={0}
                width={Math.max(1, iw / days.length)}
                height={ih}
                fill="transparent"
                onMouseEnter={() => {
                  setHover(i)
                  setTip({
                    x: (x(i) ?? 0) + M.left,
                    y: ih / 2,
                    content: (
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">{fmtDay(d.day_ts)}</span>
                        {providers.map(p =>
                          d[p] ? (
                            <span key={p} className="flex items-center gap-1.5">
                              <span className="h-2 w-2 rounded-full" style={{ background: providerColor(p) }} />
                              <span className="text-muted-foreground">{providerLabel(p)}</span>
                              <span className={`ml-auto ${numeric}`}>{d[p]}</span>
                            </span>
                          ) : null,
                        )}
                        <span className="mt-0.5 flex items-center gap-1.5">
                          <span className="text-muted-foreground">Total</span>
                          <span className={`ml-auto font-medium ${numeric}`}>{d.requests}</span>
                        </span>
                      </div>
                    ),
                  })
                }}
                onMouseLeave={() => {
                  setHover(null)
                  setTip(null)
                }}
              />
            ))}

            {days.map((d, i) =>
              i % Math.ceil(days.length / 6) === 0 ? (
                <text
                  key={d.day_ts}
                  x={x(i) ?? 0}
                  y={ih + 15}
                  textAnchor="middle"
                  className="fill-muted-foreground text-[10px]"
                >
                  {fmtDay(d.day_ts)}
                </text>
              ) : null,
            )}
          </g>
        </svg>
      )}
      <ChartTooltip tip={tip} width={width} />
    </div>
  )
}
