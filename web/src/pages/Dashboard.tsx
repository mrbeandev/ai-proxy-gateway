/* Hallmark · macrostructure: Workbench · genre: modern-minimal
 * theme: Neural Canvas (project design.md) · tone: technical + editorial
 * charts: d3 (stream · donut · histogram · heatmap · ribbon · ranking)
 * pre-emit critique: P5 H5 E4 S5 R4 V4
 */
import { useEffect, useState, useCallback, type ComponentType } from 'react'
import { TrendingUp, Layers, CheckCircle, Timer, Coins, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { formatNumber, formatCost, formatLatency, timeAgo, providerIcon, providerLabel } from '@/lib/utils'
import { ProviderLogo } from '@/components/ProviderLogo'
import { ChartPanel } from '@/components/charts/chart-kit'
import {
  numeric,
  type ActivityDay,
  type HeatCell,
  type ProviderSplitRow,
  type TopModel,
} from '@/components/charts/primitives'
import { VolumeStream } from '@/components/charts/VolumeStream'
import { ProviderDonut } from '@/components/charts/ProviderDonut'
import { ActivityHeatmap } from '@/components/charts/ActivityHeatmap'
import { ModelRanking } from '@/components/charts/ModelRanking'

interface Stats {
  totalRequests: number
  totalTokens: number
  totalPromptTokens: number
  totalCompletionTokens: number
  totalCost: number
  successRate: number
  avgLatency: number
  activeServices: number
  totalServices: number
  requestsToday: number
  topModels: TopModel[]
  recentRequests: RecentRequest[]
}

interface RecentRequest {
  id: string
  provider: string
  model: string
  status: string
  created_at: number
}

function StatCard({ icon: Icon, label, value, sub, accent }: {
  icon: ComponentType<{ size?: number; style?: React.CSSProperties }>
  label: string; value: string; sub?: string; accent?: string
}) {
  return (
    <div className="rounded-xl bg-card px-4 py-3">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <div className="flex h-6 w-6 items-center justify-center rounded-md" style={{ background: `${accent}18` }}>
          <Icon size={12} style={{ color: accent }} />
        </div>
      </div>
      <div className={`text-xl font-semibold tracking-tight ${numeric}`} style={{ letterSpacing: '-0.03em' }}>{value}</div>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  )
}

function ProviderDot({ provider }: { provider: string }) {
  const icon = providerIcon(provider)
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {icon ? (
        <ProviderLogo provider={provider} className="h-3 w-3" />
      ) : (
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-muted-foreground" />
      )}
      {providerLabel(provider)}
    </span>
  )
}

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [activity, setActivity] = useState<{
    providers: string[]
    days: ActivityDay[]
    activeDays: number
    spanDays: number
  } | null>(null)
  const [heatmap, setHeatmap] = useState<{ cells: HeatCell[]; max: number } | null>(null)
  const [split, setSplit] = useState<ProviderSplitRow[]>([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [s, act, heat, sp] = await Promise.all([
        api.getStats(),
        api.getActivity(),
        api.getHeatmap(),
        api.getProviderSplit(),
      ])
      setStats(s as Stats); setActivity(act); setHeatmap(heat); setSplit(sp)
      setError('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load dashboard')
    }
  }, [])

  useEffect(() => {
    // Deferred so the first paint isn't blocked, and so the initial fetch is
    // not treated as a synchronous setState inside the effect body.
    const t0 = setTimeout(load, 0)
    const t = setInterval(load, 10000)
    return () => { clearTimeout(t0); clearInterval(t) }
  }, [load])

  if (!stats) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
        {error ? (
          <>
            <p className="text-destructive">{error}</p>
            <Button variant="outline" size="sm" onClick={load}>Retry</Button>
          </>
        ) : 'Loading...'}
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard icon={TrendingUp} label="Total Requests" value={formatNumber(stats.totalRequests)} sub={`+${stats.requestsToday} today`} accent="var(--color-primary)" />
        <StatCard icon={Layers} label="Active Services" value={`${stats.activeServices}/${stats.totalServices}`} sub="providers" accent="var(--color-anthropic)" />
        <StatCard icon={CheckCircle} label="Success Rate" value={`${stats.successRate}%`} sub="all time" accent="var(--color-success)" />
        <StatCard icon={Timer} label="Avg Latency" value={formatLatency(stats.avgLatency)} sub="success only" accent="var(--color-gemini)" />
        <StatCard icon={Coins} label="Total Tokens" value={formatNumber(stats.totalTokens)} sub={`${formatNumber(stats.totalPromptTokens)} in / ${formatNumber(stats.totalCompletionTokens)} out`} accent="var(--color-deepseek)" />
        <StatCard icon={DollarSign} label="Est. Cost" value={formatCost(stats.totalCost)} sub="all time" accent="var(--color-cloudflare)" />
      </div>

      {/* Volume stream + provider split */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <ChartPanel
          title="Request Volume"
          className="xl:col-span-3"
          meta={activity ? `${activity.activeDays} active day${activity.activeDays !== 1 ? 's' : ''} across ${activity.spanDays}` : undefined}
        >
          {activity && <VolumeStream days={activity.days} providers={activity.providers} />}
        </ChartPanel>

        <ChartPanel title="Provider Split" className="xl:col-span-2" meta="all time">
          <ProviderDonut rows={split} />
        </ChartPanel>
      </div>

      {/* Heatmap + recent feed */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <ChartPanel title="Activity" className="xl:col-span-3" meta="by weekday & hour">
          {heatmap && <ActivityHeatmap cells={heatmap.cells} max={heatmap.max} />}
        </ChartPanel>

        <ChartPanel title="Recent Requests" className="xl:col-span-2">
          <ul className="flex max-h-[184px] flex-col gap-0.5 overflow-y-auto overscroll-contain">
            {stats.recentRequests.map(r => (
              <li key={r.id} className="flex items-center gap-2 rounded-md px-1.5 py-1.5 transition-colors hover:bg-muted/50">
                <span
                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: r.status === 'success' ? 'var(--color-success)' : 'var(--color-destructive)' }}
                  title={r.status}
                />
                <div className="min-w-0 flex-1">
                  <ProviderDot provider={r.provider} />
                  <code className="block truncate font-mono text-[11px]">{r.model}</code>
                </div>
                <span className={`shrink-0 text-[10px] text-muted-foreground ${numeric}`}>{timeAgo(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </ChartPanel>
      </div>

      {/* Model ranking — replaces the old Top Models table */}
      <ChartPanel title="Top Models" meta={`${stats.topModels.length} by request volume`}>
        <ModelRanking models={stats.topModels} />
      </ChartPanel>
    </div>
  )
}
