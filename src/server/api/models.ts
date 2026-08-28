import { Router } from 'express'
import { getDb } from '../db'
import { v4 as uuidv4 } from 'uuid'
import type { Service } from '../../types'
import { CLOUDFLARE_DEFAULT_BASE_URL } from '../providers/cloudflare'

const router = Router({ mergeParams: true })

// GET /api/services/:serviceId/models
router.get('/', (req, res) => {
  const { serviceId } = req.params
  const db = getDb()
  const models = db.prepare(
    'SELECT * FROM service_models WHERE service_id = ? ORDER BY model_id ASC'
  ).all(serviceId)
  res.json(models)
})

// POST /api/services/:serviceId/models
router.post('/', (req, res) => {
  const { serviceId } = req.params
  const { model_id, display_name } = req.body
  if (!model_id) return res.status(400).json({ error: 'model_id is required' })

  const db = getDb()
  const id = uuidv4()
  try {
    db.prepare(
      'INSERT INTO service_models (id, service_id, model_id, display_name, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(id, serviceId, model_id, display_name || null, Date.now())
  } catch (e: any) {
    if (e.message?.includes('UNIQUE')) {
      return res.status(409).json({ error: `Model "${model_id}" already exists for this service` })
    }
    throw e
  }
  res.status(201).json(db.prepare('SELECT * FROM service_models WHERE id = ?').get(id))
})

// DELETE /api/services/:serviceId/models/:id
router.delete('/:id', (req, res) => {
  const { id } = req.params
  const db = getDb()
  const result = db.prepare('DELETE FROM service_models WHERE id = ?').run(id)
  if (result.changes === 0) return res.status(404).json({ error: 'Model not found' })
  res.json({ success: true })
})

// POST /api/services/:serviceId/models/fetch — auto-fetch from provider API
router.post('/fetch', async (req, res) => {
  const { serviceId } = req.params
  const { endpoint } = req.body || {}
  const db = getDb()

  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(serviceId) as Service | undefined
  if (!service) return res.status(404).json({ error: 'Service not found' })

  try {
    // If custom endpoint is given, always use the generic OpenAI-style fetch (works with any gateway)
    const models = endpoint
      ? await fetchOpenAIModels(service.api_key, endpoint, false)
      : await fetchModelsFromProvider(service)

    const insert = db.prepare(
      'INSERT OR IGNORE INTO service_models (id, service_id, model_id, display_name, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    const insertPricing = db.prepare(
      'INSERT OR IGNORE INTO model_pricing (model, input_cost_per_1k, output_cost_per_1k, is_custom) VALUES (?, ?, ?, 0)'
    )
    const now = Date.now()
    let added = 0
    for (const m of models) {
      const result = insert.run(uuidv4(), serviceId, m.id, m.name || null, now)
      if (result.changes > 0) added++
      // Some providers (Cloudflare) publish pricing in their catalog — seed it.
      if (m.input_cost_per_1k !== undefined && m.output_cost_per_1k !== undefined) {
        insertPricing.run(m.id, m.input_cost_per_1k, m.output_cost_per_1k)
      }
    }

    const all = db.prepare('SELECT * FROM service_models WHERE service_id = ? ORDER BY model_id ASC').all(serviceId)
    res.json({ fetched: models.length, added, models: all })
  } catch (e: any) {
    res.status(502).json({ error: `Failed to fetch models: ${e.message}` })
  }
})

interface FetchedModel {
  id: string
  name?: string
  input_cost_per_1k?: number
  output_cost_per_1k?: number
}

async function fetchModelsFromProvider(service: Service): Promise<FetchedModel[]> {
  switch (service.provider) {
    case 'openai':
      return fetchOpenAIModels(service.api_key, service.base_url, true)
    case 'anthropic':
      return fetchAnthropicModels()
    case 'gemini':
      return fetchGeminiModels(service.api_key, service.base_url)
    case 'deepseek':
      return fetchDeepSeekModels(service.api_key, service.base_url)
    case 'cloudflare':
      return fetchCloudflareModels(service.api_key, service.base_url, service.account_id)
    default:
      return []
  }
}

interface CloudflareModel {
  name: string
  description?: string
  task?: { name?: string }
  properties?: { property_id: string; value: unknown }[]
}

async function fetchCloudflareModels(
  apiKey: string,
  baseUrl?: string | null,
  accountId?: string | null
): Promise<FetchedModel[]> {
  const url = buildCloudflareModelSearchUrl(baseUrl, accountId)
  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } })
  if (!resp.ok) throw new Error(`Cloudflare API returned ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  const data = await resp.json() as { result?: CloudflareModel[]; success?: boolean; errors?: { message: string }[] }
  if (data.success === false) {
    throw new Error(data.errors?.[0]?.message || 'Cloudflare API returned an error')
  }
  return (data.result || [])
    .filter(m => !m.task?.name || m.task.name === 'Text Generation')
    .map(m => ({ id: m.name, ...cloudflarePricing(m) }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

/** Cloudflare publishes per-million-token pricing in the model catalog. */
export function cloudflarePricing(model: CloudflareModel): { input_cost_per_1k?: number; output_cost_per_1k?: number } {
  const price = model.properties?.find(p => p.property_id === 'price')?.value
  if (!Array.isArray(price)) return {}
  let input: number | undefined
  let output: number | undefined
  for (const entry of price as { unit?: string; price?: number }[]) {
    if (typeof entry?.price !== 'number' || !entry.unit) continue
    // Units look like "per M input tokens" / "per M output tokens".
    // Skip "per M cached input tokens" — it would otherwise clobber the real input price.
    if (/cached/i.test(entry.unit)) continue
    const perThousand = /per M/i.test(entry.unit) ? entry.price / 1000 : entry.price
    if (/input/i.test(entry.unit)) input = perThousand
    else if (/output/i.test(entry.unit)) output = perThousand
  }
  if (input === undefined || output === undefined) return {}
  return { input_cost_per_1k: input, output_cost_per_1k: output }
}

function buildCloudflareModelSearchUrl(baseUrl?: string | null, accountId?: string | null): string {
  const base = (baseUrl || CLOUDFLARE_DEFAULT_BASE_URL).replace(/\/+$/, '')
  const query = 'task=Text%20Generation&per_page=100&hide_experimental=true'

  // If the base already points into an account's AI namespace, reuse it.
  const accountMatch = base.match(/^(.*\/accounts\/[^/]+)\/ai(\/v1)?$/)
  if (accountMatch) return `${accountMatch[1]}/ai/models/search?${query}`

  if (!accountId) {
    throw new Error('Cloudflare Workers AI requires an Account ID to list models')
  }
  const root = /\/client\/v4$/.test(base) ? base : `${base}/client/v4`
  return `${root}/accounts/${accountId}/ai/models/search?${query}`
}

async function fetchDeepSeekModels(apiKey: string, baseUrl?: string | null): Promise<FetchedModel[]> {
  const base = baseUrl || 'https://api.deepseek.com'
  const url = `${base.replace(/\/$/, '')}/models`
  const resp = await fetch(url, { headers: { 'Authorization': `Bearer ${apiKey}` } })
  if (!resp.ok) throw new Error(`DeepSeek API returned ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  const data = await resp.json() as { data?: { id: string }[] }
  return (data.data || [])
    .map(m => ({ id: m.id }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

async function fetchOpenAIModels(apiKey: string, baseUrl?: string | null, filterChat = true): Promise<FetchedModel[]> {
  // If baseUrl already ends with /models or /v1/models, use it directly
  let url: string
  if (baseUrl && (baseUrl.endsWith('/models') || baseUrl.endsWith('/v1/models'))) {
    url = baseUrl
  } else {
    const base = baseUrl || 'https://api.openai.com'
    url = `${base.replace(/\/$/, '')}/v1/models`
  }
  const resp = await fetch(url, {
    headers: { 'Authorization': `Bearer ${apiKey}` },
  })
  if (!resp.ok) throw new Error(`API returned ${resp.status}: ${(await resp.text()).slice(0, 200)}`)
  const data = await resp.json() as { data?: { id: string }[]; models?: { id: string }[] }
  // Support both OpenAI format { data: [...] } and other formats { models: [...] }
  const models = data.data || data.models || []
  if (filterChat) {
    return models
      .filter((m: any) => /^(gpt-|o1|o3|chatgpt)/.test(m.id))
      .map((m: any) => ({ id: m.id }))
      .sort((a: any, b: any) => a.id.localeCompare(b.id))
  }
  return models
    .map((m: any) => ({ id: m.id, name: m.name }))
    .sort((a: any, b: any) => a.id.localeCompare(b.id))
}

async function fetchAnthropicModels(): Promise<FetchedModel[]> {
  // Anthropic has no public list models API, return known models
  return [
    { id: 'claude-opus-4', name: 'Claude Opus 4' },
    { id: 'claude-sonnet-4', name: 'Claude Sonnet 4' },
    { id: 'claude-haiku-4', name: 'Claude Haiku 4' },
    { id: 'claude-opus-4-5', name: 'Claude Opus 4.5' },
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5' },
    { id: 'claude-haiku-4-5', name: 'Claude Haiku 4.5' },
    { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
    { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
    { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
  ]
}

async function fetchGeminiModels(apiKey: string, baseUrl?: string | null): Promise<FetchedModel[]> {
  const base = baseUrl || 'https://generativelanguage.googleapis.com'
  const url = `${base}/v1beta/models?key=${apiKey}`
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`Gemini API returned ${resp.status}: ${await resp.text()}`)
  const data = await resp.json() as { models: { name: string; displayName: string; supportedGenerationMethods?: string[] }[] }
  return data.models
    .filter(m => m.supportedGenerationMethods?.includes('generateContent'))
    .map(m => ({
      id: m.name.replace('models/', ''),
      name: m.displayName,
    }))
    .sort((a, b) => a.id.localeCompare(b.id))
}

export default router
