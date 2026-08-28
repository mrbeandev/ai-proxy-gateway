import { useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { ChartTooltip, ChartEmpty } from './chart-kit'
import { useChartWidth, type TooltipState, type HeatCell, numeric } from './primitives'

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const GAP = 3
const LABEL_W = 30
const ROW_H = 16

/**
 * Weekday x hour-of-day request grid.
 *
 * Colour ramps from the card surface to the primary accent, so an empty cell
 * reads as "no traffic" rather than as a low-but-present value — important
 * because most of this grid is legitimately empty.
 */
export function ActivityHeatmap({ cells, max }: { cells: HeatCell[]; max: number }) {
  const [ref, width] = useChartWidth<HTMLDivElement>()
  const [tip, setTip] = useState<TooltipState | null>(null)

  if (!cells.length || max === 0) return <ChartEmpty message="No activity recorded yet" height={7 * (ROW_H + GAP)} />

  const gridW = Math.max(0, width - LABEL_W)
  const cellW = Math.max(3, (gridW - 23 * GAP) / 24)
  const height = 7 * ROW_H + 6 * GAP + 16

  // Opacity ramp rather than an RGB interpolation: the palette is defined in
  // OKLCH custom properties, which d3-interpolate cannot parse.
  //
  // Linear (not sqrt) so opacity stays proportional to the count — with a low
  // floor so a 1-request hour is still visible without reading as busy.
  const intensity = scaleLinear().domain([0, max]).range([0, 1]).clamp(true)

  return (
    <div ref={ref} className="relative">
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label="Requests by weekday and hour of day">
          {DOW.map((label, d) => (
            <text
              key={label}
              x={0}
              y={d * (ROW_H + GAP) + ROW_H / 2}
              dy="0.32em"
              className="fill-muted-foreground text-[10px]"
            >
              {label}
            </text>
          ))}

          {cells.map(c => (
            <rect
              key={`${c.dow}-${c.hour}`}
              x={LABEL_W + c.hour * (cellW + GAP)}
              y={c.dow * (ROW_H + GAP)}
              width={cellW}
              height={ROW_H}
              rx={3}
              fill={c.requests === 0 ? 'var(--color-muted)' : 'var(--color-primary)'}
              fillOpacity={c.requests === 0 ? 0.5 : 0.1 + 0.9 * intensity(c.requests)}
              onMouseEnter={() =>
                setTip({
                  x: LABEL_W + c.hour * (cellW + GAP) + cellW / 2,
                  y: c.dow * (ROW_H + GAP) + ROW_H / 2,
                  content: (
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {DOW[c.dow]} {String(c.hour).padStart(2, '0')}:00
                      </span>
                      <span className="text-muted-foreground">
                        <span className={numeric}>{c.requests}</span> request{c.requests !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ),
                })
              }
              onMouseLeave={() => setTip(null)}
            />
          ))}

          {[0, 6, 12, 18].map(h => (
            <text
              key={h}
              x={LABEL_W + h * (cellW + GAP)}
              y={7 * (ROW_H + GAP) + 8}
              className="fill-muted-foreground text-[10px]"
            >
              {String(h).padStart(2, '0')}:00
            </text>
          ))}
        </svg>
      )}
      <ChartTooltip tip={tip} width={width} />
    </div>
  )
}
