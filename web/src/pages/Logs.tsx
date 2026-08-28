import { useEffect, useState, useCallback, useRef } from 'react'
import { useIsMobile } from '@/hooks/use-mobile'
import { Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { api } from '@/lib/api'
import { formatLatency, formatCost, timeAgo, providerColor, providerIcon, providerLabel } from '@/lib/utils'
import { ProviderLogo } from '@/components/ProviderLogo'

function ProviderDot({ provider }: { provider: string }) {
  const icon = providerIcon(provider)
  return (
    <span className="flex items-center gap-1.5 text-xs">
      {icon ? (
        <img src={icon} alt={provider} className="h-3.5 w-3.5 shrink-0" />
      ) : (
        <span className="h-1.5 w-1.5 rounded-full shrink-0" style={{ background: providerColor(provider) }} />
      )}
      {providerLabel(provider)}
    </span>
  )
}

// ─── Shared detail content ────────────────────────────────────────────────────

function DetailContent({ selected }: { selected: any }) {
  return (
    <div className="flex flex-col">
      {/* Provider + Model header */}
      <div className="flex items-center gap-2 mb-3 pb-3 border-b">
        <ProviderDot provider={selected.provider} />
        <span className="text-xs text-muted-foreground">·</span>
        <code className="text-xs font-mono font-medium">{selected.model}</code>
      </div>

      {/* Status badge */}
      <div className="flex items-center justify-between mb-3">
        <Badge variant={selected.status === 'success' ? 'default' : 'destructive'} className="text-xs">
          {selected.status === 'success' ? 'Success' : 'Error'} ({selected.status_code})
        </Badge>
        <span className="text-xs text-muted-foreground">{selected.created_at ? new Date(selected.created_at).toLocaleString() : '—'}</span>
      </div>

      <Separator className="mb-3" />

      {/* Token usage */}
      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Token Usage</p>
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-md bg-muted p-2 text-center">
          <p className="text-xs text-muted-foreground">Input</p>
          <p className="text-sm font-semibold tabular-nums">{selected.prompt_tokens?.toLocaleString() ?? 0}</p>
        </div>
        <div className="rounded-md bg-muted p-2 text-center">
          <p className="text-xs text-muted-foreground">Output</p>
          <p className="text-sm font-semibold tabular-nums">{selected.completion_tokens?.toLocaleString() ?? 0}</p>
        </div>
        <div className="rounded-md bg-muted p-2 text-center">
          <p className="text-xs text-muted-foreground">Total</p>
          <p className="text-sm font-semibold tabular-nums">{selected.total_tokens?.toLocaleString() ?? 0}</p>
        </div>
      </div>

      {/* Performance */}
      <p className="text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">Performance</p>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-md bg-muted p-2 text-center">
          <p className="text-xs text-muted-foreground">Latency</p>
          <p className="text-sm font-semibold tabular-nums">{selected.latency_ms ? formatLatency(selected.latency_ms) : '—'}</p>
        </div>
        <div className="rounded-md bg-muted p-2 text-center">
          <p className="text-xs text-muted-foreground">Est. Cost</p>
          <p className="text-sm font-semibold tabular-nums">{selected.estimated_cost_usd ? formatCost(selected.estimated_cost_usd) : '—'}</p>
        </div>
      </div>

      {/* Metadata */}
      <Separator className="mb-3" />
      <div className="flex flex-col gap-1.5">
        <div className="flex justify-between gap-2">
          <span className="text-xs text-muted-foreground">Request ID</span>
          <code className="text-xs font-mono text-right truncate max-w-40">{selected.id}</code>
        </div>
        <div className="flex justify-between gap-2">
          <span className="text-xs text-muted-foreground">Service ID</span>
          <code className="text-xs font-mono text-right truncate max-w-40">{selected.service_id || '—'}</code>
        </div>
      </div>

      {selected.error_message && (
        <>
          <Separator className="my-3" />
          <p className="text-xs font-medium text-destructive mb-1.5 uppercase tracking-wider">Error</p>
          <p className="text-xs text-destructive bg-destructive/10 p-2.5 rounded overflow-wrap-anywhere">{selected.error_message}</p>
        </>
      )}
    </div>
  )
}

// ─── Logs Page ────────────────────────────────────────────────────────────────

export default function Logs() {
  const [data, setData] = useState<{ logs: any[]; total: number; page: number; limit: number; pages: number }>({ logs: [], total: 0, page: 1, limit: 50, pages: 1 })
  const [filters, setFilters] = useState({ provider: '', status: '', search: '' })
  const [searchInput, setSearchInput] = useState('')
  const [page, setPage] = useState(1)
  const [selected, setSelected] = useState<any>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined)
  const isMobile = useIsMobile()

  const load = useCallback(async () => {
    const params: Record<string, string> = { page: String(page), limit: '50' }
    if (filters.provider) params.provider = filters.provider
    if (filters.status) params.status = filters.status
    if (filters.search) params.search = filters.search
    try { setData(await api.getLogs(params)) } catch { /* handled by empty state */ }
  }, [page, filters])

  useEffect(() => { load() }, [load])

  function setFilter(k: string, v: string) {
    setFilters(f => ({ ...f, [k]: v })); setPage(1)
  }

  function handleSearchChange(v: string) {
    setSearchInput(v)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setFilter('search', v), 300)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative">
          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-8 h-8 w-48 text-xs" placeholder="Search model or ID..." value={searchInput} onChange={e => handleSearchChange(e.target.value)} />
        </div>
        <Select value={filters.provider || 'all'} onValueChange={v => setFilter('provider', v === 'all' ? '' : (v ?? ''))}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            <SelectItem value="openai"><span className="flex items-center gap-2"><ProviderLogo provider="openai" className="h-3.5 w-3.5" />OpenAI</span></SelectItem>
            <SelectItem value="anthropic"><span className="flex items-center gap-2"><ProviderLogo provider="anthropic" className="h-3.5 w-3.5" />Anthropic</span></SelectItem>
            <SelectItem value="gemini"><span className="flex items-center gap-2"><ProviderLogo provider="gemini" className="h-3.5 w-3.5" />Gemini</span></SelectItem>
            <SelectItem value="deepseek"><span className="flex items-center gap-2"><ProviderLogo provider="deepseek" className="h-3.5 w-3.5" />DeepSeek</span></SelectItem>
            <SelectItem value="cloudflare"><span className="flex items-center gap-2"><ProviderLogo provider="cloudflare" className="h-3.5 w-3.5" />Cloudflare</span></SelectItem>
          </SelectContent>
        </Select>
        <Select value={filters.status || 'all'} onValueChange={v => setFilter('status', v === 'all' ? '' : (v ?? ''))}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="success">Success</SelectItem>
            <SelectItem value="error">Error</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">{data.total} requests</span>
      </div>

      <div className="flex gap-4">
        {/* Table */}
        <Card className="flex-1 min-w-0 overflow-hidden py-0">
          <ScrollArea className="h-[calc(100vh-220px)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Time</TableHead>
                  <TableHead className="text-xs">Provider</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Model</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">In</TableHead>
                  <TableHead className="text-xs hidden md:table-cell">Out</TableHead>
                  <TableHead className="text-xs hidden lg:table-cell">Cost</TableHead>
                  <TableHead className="text-xs hidden sm:table-cell">Latency</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-12 text-muted-foreground text-sm">
                      No logs found. Make a request through the proxy to see activity here.
                    </TableCell>
                  </TableRow>
                ) : data.logs.map((log: any) => (
                  <TableRow
                    key={log.id}
                    onClick={() => setSelected(log.id === selected?.id ? null : log)}
                    className="cursor-pointer"
                    data-state={selected?.id === log.id ? 'selected' : undefined}
                  >
                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap py-2">{timeAgo(log.created_at)}</TableCell>
                    <TableCell className="py-2"><ProviderDot provider={log.provider} /></TableCell>
                    <TableCell className="py-2 font-mono text-xs max-w-32 truncate hidden sm:table-cell">{log.model}</TableCell>
                    <TableCell className="py-2">
                      <Badge variant={log.status === 'success' ? 'default' : 'destructive'} className="text-xs h-4 px-1.5">
                        {log.status === 'success' ? 'OK' : 'ERR'}
                      </Badge>
                    </TableCell>
                    <TableCell className="py-2 text-xs tabular-nums hidden md:table-cell">{log.prompt_tokens ? log.prompt_tokens.toLocaleString() : '—'}</TableCell>
                    <TableCell className="py-2 text-xs tabular-nums hidden md:table-cell">{log.completion_tokens ? log.completion_tokens.toLocaleString() : '—'}</TableCell>
                    <TableCell className="py-2 text-xs tabular-nums hidden lg:table-cell">{log.estimated_cost_usd ? formatCost(log.estimated_cost_usd) : '—'}</TableCell>
                    <TableCell className="py-2 text-xs tabular-nums hidden sm:table-cell">{log.latency_ms ? formatLatency(log.latency_ms) : '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          {/* Pagination */}
          {data.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
                <ChevronLeft size={12} /> Previous
              </Button>
              <span className="text-xs text-muted-foreground">Page {page} of {data.pages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(data.pages, p + 1))} disabled={page >= data.pages}>
                Next <ChevronRight size={12} />
              </Button>
            </div>
          )}
        </Card>

        {/* Desktop: side panel */}
        {selected && !isMobile && (
          <Card className="w-80 shrink-0 py-0 h-fit">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Request Detail</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setSelected(null)}>✕</Button>
              </div>
              <DetailContent selected={selected} />
            </CardContent>
          </Card>
        )}
      </div>

      {/* Mobile: bottom sheet dialog */}
      {isMobile && (
        <Sheet open={!!selected} onOpenChange={open => { if (!open) setSelected(null) }}>
          <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle className="text-sm">Request Detail</SheetTitle>
            </SheetHeader>
            {selected && (
              <div className="px-4 pb-4">
                <DetailContent selected={selected} />
              </div>
            )}
          </SheetContent>
        </Sheet>
      )}
    </div>
  )
}
