import { useEffect, useMemo, useState } from 'react'
import {
  Plus, Edit2, Trash2, Tag, RefreshCw, Box, Search, X, Server, KeyRound, Link2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { providerColor, isMonochromeProvider } from '@/lib/utils'
import { ProviderLogo } from '@/components/ProviderLogo'

const PROVIDERS = [
  { value: 'openai', label: 'OpenAI', icon: '/openai.svg' },
  { value: 'anthropic', label: 'Anthropic (Claude)', icon: '/claude.svg' },
  { value: 'gemini', label: 'Google Gemini', icon: '/gemini.svg' },
  { value: 'deepseek', label: 'DeepSeek', icon: '/deepseek.svg' },
  { value: 'cloudflare', label: 'Cloudflare Workers AI', icon: '/cloudflare.svg' },
]

const providerMeta = (p: string) => PROVIDERS.find(x => x.value === p)

/** Provider glyph on a tinted tile. */
function ProviderIcon({ provider, size = 'md' }: { provider: string; size?: 'sm' | 'md' | 'lg' }) {
  const info = providerMeta(provider)
  const color = providerColor(provider)
  const box = size === 'lg' ? 'h-11 w-11 rounded-xl' : size === 'sm' ? 'h-7 w-7 rounded-md' : 'h-9 w-9 rounded-lg'
  const img = size === 'lg' ? 'h-6 w-6' : size === 'sm' ? 'h-4 w-4' : 'h-5 w-5'
  const mono = isMonochromeProvider(provider)
  return (
    <div
      className={`${box} flex items-center justify-center shrink-0 text-foreground`}
      style={{ background: mono ? 'var(--muted)' : `${color}1f` }}
    >
      {info
        ? <ProviderLogo provider={provider} className={img} />
        : <span className="text-[10px] font-bold" style={{ color }}>{provider.slice(0, 3).toUpperCase()}</span>}
    </div>
  )
}

// ─── Service Form ─────────────────────────────────────────────────────────────

function ServiceForm({ initial, onSave, onClose }: { initial?: any; onSave: (d: any) => Promise<any>; onClose: () => void }) {
  const [form, setForm] = useState({
    name: initial?.name || '',
    provider: initial?.provider || 'openai',
    api_key: '',
    base_url: initial?.base_url || '',
    account_id: initial?.account_id || '',
  })
  const isCloudflare = form.provider === 'cloudflare'
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true); setError('')
    try { await onSave(form); onClose() }
    catch (err: any) { setError(err.message) }
    finally { setSaving(false) }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="svc-name">Service Name</Label>
        <Input id="svc-name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="My OpenAI" required />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="svc-provider">Provider</Label>
        <Select value={form.provider} onValueChange={v => setForm(f => ({ ...f, provider: v ?? 'openai' }))}>
          <SelectTrigger id="svc-provider">
            {(() => { const p = providerMeta(form.provider); return p ? (
              <span className="flex items-center gap-2"><ProviderLogo provider={p.value} className="h-4 w-4" />{p.label}</span>
            ) : <SelectValue /> })()}
          </SelectTrigger>
          <SelectContent>
            {PROVIDERS.map(p => (
              <SelectItem key={p.value} value={p.value}>
                <span className="flex items-center gap-2">
                  <ProviderLogo provider={p.value} className="h-4 w-4" />
                  {p.label}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="svc-key">{initial ? 'API Key (leave blank to keep existing)' : 'API Key'}</Label>
        <Input id="svc-key" type="password" value={form.api_key} onChange={e => setForm(f => ({ ...f, api_key: e.target.value }))} placeholder={isCloudflare ? 'Cloudflare API token' : 'sk-...'} required={!initial} />
      </div>
      {isCloudflare && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="svc-account">Account ID</Label>
          <Input id="svc-account" value={form.account_id} onChange={e => setForm(f => ({ ...f, account_id: e.target.value }))} placeholder="e.g. 0123456789abcdef0123456789abcdef" required={!form.base_url} />
          <p className="text-[11px] text-muted-foreground">Found in your Cloudflare dashboard URL / Workers AI page.</p>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="svc-url">Base URL <span className="text-muted-foreground">(optional)</span></Label>
        <Input id="svc-url" value={form.base_url} onChange={e => setForm(f => ({ ...f, base_url: e.target.value }))} placeholder={isCloudflare ? 'Leave blank (or an AI Gateway URL)' : 'Leave blank for default'} />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Service'}</Button>
      </DialogFooter>
    </form>
  )
}

// ─── Models Tab ───────────────────────────────────────────────────────────────

function ModelsPanel({ service, models, onModelsChange }: { service: any; models: any[]; onModelsChange: () => void }) {
  const [newModelId, setNewModelId] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [fetching, setFetching] = useState(false)
  const [fetchEndpoint, setFetchEndpoint] = useState('')
  const [showEndpoint, setShowEndpoint] = useState(false)
  const [saving, setSaving] = useState(false)
  const [query, setQuery] = useState('')
  const [error, setError] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return models
    return models.filter((m: any) =>
      m.model_id.toLowerCase().includes(q) || (m.display_name || '').toLowerCase().includes(q))
  }, [models, query])

  async function addModel(e: React.FormEvent) {
    e.preventDefault()
    if (!newModelId.trim()) return
    setSaving(true); setError('')
    try {
      await api.addServiceModel(service.id, { model_id: newModelId.trim(), display_name: newDisplayName.trim() || undefined })
      setNewModelId(''); setNewDisplayName('')
      onModelsChange()
    } catch (err: any) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function deleteModel(id: string) {
    setError('')
    try { await api.deleteServiceModel(service.id, id); onModelsChange() }
    catch (err: any) { setError(err.message) }
  }

  async function fetchModels() {
    setFetching(true); setError('')
    try {
      await api.fetchServiceModels(service.id, fetchEndpoint || undefined)
      onModelsChange()
    } catch (err: any) { setError(err.message) }
    finally { setFetching(false) }
  }

  return (
    <div className="flex flex-col gap-3 min-h-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-52">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            className="h-8 pl-7.5 text-xs"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search ${models.length} model${models.length !== 1 ? 's' : ''}...`}
          />
          {query && (
            <button type="button" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X size={12} />
            </button>
          )}
        </div>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={fetchModels} disabled={fetching}>
          <RefreshCw size={12} className={fetching ? 'animate-spin' : ''} />
          {fetching ? 'Fetching...' : 'Fetch from provider'}
        </Button>
        <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setShowEndpoint(v => !v)} title="Use a custom models endpoint">
          <Link2 size={12} />
        </Button>
      </div>

      {showEndpoint && (
        <Input
          className="h-8 text-xs"
          value={fetchEndpoint}
          onChange={e => setFetchEndpoint(e.target.value)}
          placeholder="Custom models URL (optional) — leave blank to use the provider default"
        />
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      {/* Model list */}
      {models.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg bg-muted/40 py-10 text-center">
          <Box size={18} className="text-muted-foreground" />
          <p className="text-sm">No models yet</p>
          <p className="text-xs text-muted-foreground">Fetch them from the provider, or add one manually below.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg bg-muted/40 py-8 text-center text-xs text-muted-foreground">
          No models match “{query}”.
        </div>
      ) : (
        <div className="max-h-80 overflow-y-auto overscroll-contain rounded-lg bg-muted/40">
          <div className="flex flex-col p-1">
            {filtered.map((m: any) => (
              <div key={m.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-background/70 transition-colors">
                <code className="text-xs font-mono truncate">{m.model_id}</code>
                {m.display_name && <span className="text-xs text-muted-foreground truncate">{m.display_name}</span>}
                <button
                  onClick={() => deleteModel(m.id)}
                  title="Remove model"
                  className="ml-auto shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive transition"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add model */}
      <form onSubmit={addModel} className="flex flex-wrap gap-2">
        <Input className="h-8 text-xs flex-1 min-w-44" value={newModelId} onChange={e => setNewModelId(e.target.value)} placeholder="Model ID (e.g. gpt-4o)" required />
        <Input className="h-8 text-xs w-36" value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} placeholder="Display name" />
        <Button type="submit" size="sm" variant="outline" disabled={saving || !newModelId.trim()} className="h-8 text-xs shrink-0">
          <Plus size={12} /> Add
        </Button>
      </form>
    </div>
  )
}

// ─── Aliases Tab ──────────────────────────────────────────────────────────────

function AliasesPanel({ service, aliases, models, onRefresh }: { service: any; aliases: any[]; models: any[]; onRefresh: () => void }) {
  const [alias, setAlias] = useState('')
  const [targetModel, setTargetModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const serviceAliases = aliases.filter((a: any) => a.service_id === service.id)

  async function addAlias(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setError('')
    try { await api.createAlias({ alias, service_id: service.id, target_model: targetModel }); setAlias(''); setTargetModel(''); onRefresh() }
    catch (err: any) { setError(err.message) }
    finally { setSaving(false) }
  }

  async function removeAlias(id: string) {
    setError('')
    try { await api.deleteAlias(id); onRefresh() } catch (e: any) { setError(e.message) }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Aliases let clients call a friendly name (e.g. <code className="font-mono">fast</code>) that resolves to a real model on this service.
      </p>

      {serviceAliases.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-1.5 rounded-lg bg-muted/40 py-8 text-center">
          <Tag size={16} className="text-muted-foreground" />
          <p className="text-xs text-muted-foreground">No aliases for this service yet.</p>
        </div>
      ) : (
        <div className="flex flex-col rounded-lg bg-muted/40 p-1">
          {serviceAliases.map((a: any) => (
            <div key={a.id} className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-background/70 transition-colors">
              <code className="text-xs font-mono text-primary">{a.alias}</code>
              <span className="text-muted-foreground text-xs">→</span>
              <code className="text-xs font-mono text-muted-foreground truncate">{a.target_model}</code>
              <button
                onClick={() => removeAlias(a.id)}
                title="Remove alias"
                className="ml-auto shrink-0 text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-destructive transition"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-xs text-destructive">{error}</p>}

      <form onSubmit={addAlias} className="flex flex-wrap gap-2">
        <Input className="h-8 text-xs flex-1 min-w-36" value={alias} onChange={e => setAlias(e.target.value)} placeholder="Alias (e.g. fast)" required />
        <Select value={targetModel} onValueChange={v => setTargetModel(v ?? '')}>
          <SelectTrigger className="h-8 text-xs flex-1 min-w-40"><SelectValue placeholder="Select model" /></SelectTrigger>
          <SelectContent>
            {models.map((m: any) => <SelectItem key={m.model_id} value={m.model_id} className="text-xs">{m.model_id}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button type="submit" size="sm" variant="outline" disabled={saving || !alias.trim() || !targetModel} className="h-8 text-xs shrink-0">
          <Plus size={12} /> Add
        </Button>
      </form>
    </div>
  )
}

// ─── Details Tab ──────────────────────────────────────────────────────────────

function DetailsPanel({ service, onEdit }: { service: any; onEdit: (s: any) => void }) {
  const rows = [
    { label: 'Provider', value: providerMeta(service.provider)?.label || service.provider },
    { label: 'API Key', value: service.api_key, mono: true },
    ...(service.account_id ? [{ label: 'Account ID', value: service.account_id, mono: true }] : []),
    { label: 'Base URL', value: service.base_url || 'Provider default', mono: !!service.base_url },
    { label: 'Status', value: service.enabled ? 'Enabled' : 'Disabled' },
  ]
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg bg-muted/40 divide-y divide-border/40">
        {rows.map(r => (
          <div key={r.label} className="flex items-center justify-between gap-4 px-3 py-2">
            <span className="text-xs text-muted-foreground shrink-0">{r.label}</span>
            <span className={`text-xs truncate ${r.mono ? 'font-mono' : ''}`}>{r.value}</span>
          </div>
        ))}
      </div>
      <div>
        <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5" onClick={() => onEdit(service)}>
          <Edit2 size={12} /> Edit service
        </Button>
      </div>
    </div>
  )
}

// ─── Detail Pane ──────────────────────────────────────────────────────────────

function ServiceDetail({ service, aliases, models, onModelsChange, onEdit, onDelete, onRefresh }: any) {
  const serviceAliases = aliases.filter((a: any) => a.service_id === service.id)
  const color = providerColor(service.provider)

  return (
    <section className="rounded-xl bg-card flex flex-col overflow-hidden">
      {/* Header */}
      <header className="flex items-start justify-between gap-3 p-4">
        <div className="flex items-center gap-3 min-w-0">
          <ProviderIcon provider={service.provider} size="lg" />
          <div className="min-w-0">
            <h2 className="font-semibold truncate">{service.name}</h2>
            <p className="text-xs text-muted-foreground truncate">{providerMeta(service.provider)?.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: service.enabled ? color : 'var(--muted-foreground)' }} />
            {service.enabled ? 'Connected' : 'Disabled'}
          </span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(service)} title="Edit service">
            <Edit2 size={13} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(service.id)} title="Delete service">
            <Trash2 size={13} />
          </Button>
        </div>
      </header>

      {/* Tabs */}
      <Tabs defaultValue="models" className="px-4 pb-4 gap-3">
        <TabsList>
          <TabsTrigger value="models" className="text-xs gap-1.5">
            <Box size={12} /> Models
            <span className="text-muted-foreground">{models.length}</span>
          </TabsTrigger>
          <TabsTrigger value="aliases" className="text-xs gap-1.5">
            <Tag size={12} /> Aliases
            <span className="text-muted-foreground">{serviceAliases.length}</span>
          </TabsTrigger>
          <TabsTrigger value="details" className="text-xs gap-1.5">
            <KeyRound size={12} /> Details
          </TabsTrigger>
        </TabsList>

        <TabsContent value="models">
          <ModelsPanel service={service} models={models} onModelsChange={onModelsChange} />
        </TabsContent>
        <TabsContent value="aliases">
          <AliasesPanel service={service} aliases={aliases} models={models} onRefresh={onRefresh} />
        </TabsContent>
        <TabsContent value="details">
          <DetailsPanel service={service} onEdit={onEdit} />
        </TabsContent>
      </Tabs>
    </section>
  )
}

// ─── Services Page ────────────────────────────────────────────────────────────

export default function Services() {
  const [services, setServices] = useState<any[]>([])
  const [aliases, setAliases] = useState<any[]>([])
  const [modelsByService, setModelsByService] = useState<Record<string, any[]>>({})
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [editService, setEditService] = useState<any>(null)

  const loadModels = async (list: any[]) => {
    const entries = await Promise.all(list.map(async (s: any) => {
      try { return [s.id, await api.getServiceModels(s.id)] as const }
      catch { return [s.id, []] as const }
    }))
    setModelsByService(Object.fromEntries(entries))
  }

  const load = async () => {
    try {
      const [s, a] = await Promise.all([api.getServices(), api.getAliases()])
      setServices(s); setAliases(a)
      setSelectedId(prev => (prev && s.some((x: any) => x.id === prev) ? prev : s[0]?.id ?? null))
      loadModels(s)
    } catch {}
  }

  useEffect(() => { load() }, [])

  const selected = services.find(s => s.id === selectedId) || null

  async function handleDelete(id: string) {
    if (!confirm('Delete this service? All associated models and aliases will also be removed.')) return
    try { await api.deleteService(id); setSelectedId(null); load() } catch (e: any) { alert(e.message) }
  }

  const refreshSelectedModels = async () => {
    if (!selectedId) return
    try {
      const m = await api.getServiceModels(selectedId)
      setModelsByService(prev => ({ ...prev, [selectedId]: m }))
    } catch {}
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {services.length} service{services.length !== 1 ? 's' : ''} configured
        </p>
        <Button onClick={() => setShowAdd(true)} size="sm">
          <Plus size={14} /> Add Service
        </Button>
      </div>

      {services.length === 0 ? (
        <button
          onClick={() => setShowAdd(true)}
          className="rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        >
          <Server size={22} />
          <span className="text-sm font-medium">Connect your first AI provider</span>
          <span className="text-xs">OpenAI, Anthropic, Gemini, DeepSeek or Cloudflare Workers AI</span>
        </button>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(230px,290px)_1fr] gap-4 items-start">
          {/* Master list */}
          <nav className="rounded-xl bg-card p-1.5 flex flex-col gap-0.5">
            {services.map(s => {
              const active = s.id === selectedId
              const color = providerColor(s.provider)
              const count = modelsByService[s.id]?.length ?? 0
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedId(s.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`group relative flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                    active ? 'bg-muted' : 'hover:bg-muted/60'
                  }`}
                >
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 h-6 w-0.75 rounded-r-full" style={{ background: color }} />
                  )}
                  <ProviderIcon provider={s.provider} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium truncate">{s.name}</span>
                    <span className="block text-[11px] text-muted-foreground truncate">
                      {count} model{count !== 1 ? 's' : ''}
                    </span>
                  </span>
                  {!s.enabled && <Badge variant="secondary" className="text-[10px] shrink-0">Off</Badge>}
                </button>
              )
            })}
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-left text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
            >
              <span className="h-7 w-7 rounded-md border border-dashed border-border flex items-center justify-center shrink-0">
                <Plus size={13} />
              </span>
              <span className="text-sm">Add service</span>
            </button>
          </nav>

          {/* Detail pane */}
          {selected ? (
            <ServiceDetail
              key={selected.id}
              service={selected}
              aliases={aliases}
              models={modelsByService[selected.id] ?? []}
              onModelsChange={refreshSelectedModels}
              onEdit={setEditService}
              onDelete={handleDelete}
              onRefresh={load}
            />
          ) : (
            <section className="rounded-xl bg-card flex flex-col items-center justify-center gap-2 py-20 text-muted-foreground">
              <Server size={20} />
              <p className="text-sm">Select a service to manage its models and aliases</p>
            </section>
          )}
        </div>
      )}

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Service</DialogTitle></DialogHeader>
          <ServiceForm onSave={api.createService} onClose={() => { setShowAdd(false); load() }} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editService} onOpenChange={v => !v && setEditService(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit Service</DialogTitle></DialogHeader>
          {editService && (
            <ServiceForm initial={editService} onSave={d => api.updateService(editService.id, d)} onClose={() => { setEditService(null); load() }} />
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
