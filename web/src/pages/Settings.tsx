import { useEffect, useState } from 'react'
import { Copy, Check, Pencil, Save, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { api } from '@/lib/api'

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button variant="outline" size="sm" className="h-7 text-xs gap-1"
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) }}>
      {copied ? <Check size={11} /> : <Copy size={11} />}
      {copied ? 'Copied' : 'Copy'}
    </Button>
  )
}

// ─── Model Pricing Manager ───────────────────────────────────────────────────

function PricingManager() {
  const [pricing, setPricing] = useState<any[]>([])
  const [editId, setEditId] = useState<string | null>(null)
  const [editInput, setEditInput] = useState('')
  const [editOutput, setEditOutput] = useState('')
  const [newModel, setNewModel] = useState('')
  const [newInput, setNewInput] = useState('')
  const [newOutput, setNewOutput] = useState('')
  const [saving, setSaving] = useState(false)

  const load = () => { api.getPricing().then(setPricing).catch(() => {}) }
  useEffect(() => { load() }, [])

  async function savePricing(model: string, inputCost: string, outputCost: string) {
    setSaving(true)
    try {
      await api.updatePricing(model, {
        input_cost_per_1k: parseFloat(inputCost),
        output_cost_per_1k: parseFloat(outputCost),
      })
      setEditId(null)
      load()
    } catch (e: any) { alert(e.message) }
    finally { setSaving(false) }
  }

  async function addPricing(e: React.FormEvent) {
    e.preventDefault()
    if (!newModel.trim() || !newInput || !newOutput) return
    await savePricing(newModel.trim(), newInput, newOutput)
    setNewModel(''); setNewInput(''); setNewOutput('')
  }

  function startEdit(p: any) {
    setEditId(p.model)
    setEditInput(String(p.input_cost_per_1k))
    setEditOutput(String(p.output_cost_per_1k))
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Model Pricing</CardTitle>
        <CardDescription className="text-xs">Set input/output cost per 1K tokens (USD) for cost estimation</CardDescription>
      </CardHeader>
      <CardContent className="px-0 py-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2 px-4 pl-5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Model</th>
                <th className="text-left py-2 px-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Input / 1K tokens</th>
                <th className="text-left py-2 px-4 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Output / 1K tokens</th>
                <th className="text-left py-2 px-4 pr-5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground w-16"></th>
              </tr>
            </thead>
            <tbody>
              {pricing.map((p: any) => (
                <tr key={p.model} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="py-1.5 px-4 pl-5 font-mono">
                    {p.model}
                  </td>
                  {editId === p.model ? (
                    <>
                      <td className="py-1.5 px-4">
                        <Input className="h-7 w-28 text-xs font-mono" type="number" step="any" value={editInput} onChange={e => setEditInput(e.target.value)} />
                      </td>
                      <td className="py-1.5 px-4">
                        <Input className="h-7 w-28 text-xs font-mono" type="number" step="any" value={editOutput} onChange={e => setEditOutput(e.target.value)} />
                      </td>
                      <td className="py-1.5 px-4 pr-5">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" disabled={saving}
                          onClick={() => savePricing(p.model, editInput, editOutput)}>
                          <Save size={11} />
                        </Button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-1.5 px-4 font-mono text-muted-foreground">${p.input_cost_per_1k}</td>
                      <td className="py-1.5 px-4 font-mono text-muted-foreground">${p.output_cost_per_1k}</td>
                      <td className="py-1.5 px-4 pr-5">
                        <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => startEdit(p)}>
                          <Pencil size={11} />
                        </Button>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Add new pricing row */}
        <form onSubmit={addPricing} className="flex items-center gap-2 px-5 py-3 border-t">
          <Input className="h-7 text-xs font-mono flex-1" value={newModel} onChange={e => setNewModel(e.target.value)} placeholder="Model ID (e.g. gpt-5)" required />
          <Input className="h-7 text-xs font-mono w-28" type="number" step="any" value={newInput} onChange={e => setNewInput(e.target.value)} placeholder="Input $/1K" required />
          <Input className="h-7 text-xs font-mono w-28" type="number" step="any" value={newOutput} onChange={e => setNewOutput(e.target.value)} placeholder="Output $/1K" required />
          <Button type="submit" size="sm" variant="outline" className="h-7 text-xs shrink-0 gap-1" disabled={saving}>
            <Plus size={11} /> Add
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// ─── Settings Page ────────────────────────────────────────────────────────────

export default function Settings() {
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    api.getSettings().then((s: Record<string, string>) => setSettings(s)).catch(() => {})
  }, [])

  function set(k: string, v: string) { setSettings(s => ({ ...s, [k]: v })) }

  async function save() {
    setSaveError('')
    try {
      await api.updateSettings(settings)
      setSaved(true); setTimeout(() => setSaved(false), 2000)
    } catch (e: any) {
      setSaveError(e.message || 'Failed to save')
    }
  }

  const baseUrl = `http://localhost:${settings.port || '4141'}`
  const endpointUrl = `${baseUrl}/v1`

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
      {/* Left column: Endpoint + General + Save */}
      <div className="flex flex-col gap-5">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">OpenAI-Compatible Endpoint</CardTitle>
            <CardDescription className="text-xs">Use this URL in any OpenAI-compatible client</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2">
              <code className="text-sm font-mono text-primary flex-1 truncate">{endpointUrl}</code>
              <CopyButton value={endpointUrl} />
            </div>

            <div className="rounded-lg bg-muted px-3 py-2.5">
              <p className="text-xs font-medium text-muted-foreground mb-1.5">Claude Code setup</p>
              <code className="text-xs font-mono flex items-center gap-2">
                <span className="text-muted-foreground">$</span>
                <span>ANTHROPIC_BASE_URL={baseUrl} claude</span>
              </code>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gateway-key" className="text-xs">
                Gateway API Key <span className="text-muted-foreground font-normal">(optional — require this for all requests)</span>
              </Label>
              <Input id="gateway-key" type="password" value={settings.gateway_api_key || ''}
                onChange={e => set('gateway_api_key', e.target.value)}
                placeholder="Leave blank to allow unauthenticated access" />
            </div>
          </CardContent>
        </Card>

        <Card>
            <CardHeader>
              <CardTitle className="text-sm">General</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gw-name">Gateway Name</Label>
                <Input id="gw-name" value={settings.gateway_name || ''} onChange={e => set('gateway_name', e.target.value)} />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gw-port">Port</Label>
                <Input id="gw-port" type="number" className="w-32" value={settings.port || '4141'} onChange={e => set('port', e.target.value)} />
                <p className="text-xs text-muted-foreground">Restart required for port change to take effect.</p>
              </div>

              <Separator />

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">Enable request logging</p>
                  <p className="text-xs text-muted-foreground">Log all proxy requests to the database</p>
                </div>
                <Switch
                  checked={settings.log_enabled === '1'}
                  onCheckedChange={v => set('log_enabled', v ? '1' : '0')}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="gw-retention">Log retention</Label>
                <Select value={settings.retention_days || '30'} onValueChange={v => set('retention_days', v ?? '30')}>
                  <SelectTrigger id="gw-retention" className="w-48"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="7">7 days</SelectItem>
                    <SelectItem value="14">14 days</SelectItem>
                    <SelectItem value="30">30 days</SelectItem>
                    <SelectItem value="90">90 days</SelectItem>
                    <SelectItem value="365">1 year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <div className="flex items-center justify-end gap-3">
            {saveError && <p className="text-xs text-destructive">{saveError}</p>}
            <Button onClick={save} variant={saved ? 'outline' : 'default'} className={saved ? 'text-green-500 border-green-500/30' : ''}>
              {saved ? '✓ Saved' : 'Save Changes'}
            </Button>
          </div>
        </div>

        {/* Right column: Model Pricing */}
        <PricingManager />
      </div>
  )
}
