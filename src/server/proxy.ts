import { Router, Request, Response } from 'express'
import { getDb } from './db'
import { proxyOpenAI } from './providers/openai'
import { proxyAnthropic } from './providers/anthropic'
import { proxyGemini } from './providers/gemini'
import { proxyCloudflare, CLOUDFLARE_DEFAULT_BASE_URL } from './providers/cloudflare'
import { v4 as uuidv4 } from 'uuid'
import type { Service, OpenAIChatRequest } from '../types'

const router = Router()

function getServiceForModel(model: string): { service: Service; resolvedModel: string } | null {
  const db = getDb()

  // Check model aliases first
  const alias = db.prepare(`
    SELECT ma.*, s.api_key, s.base_url, s.account_id, s.provider, s.enabled
    FROM model_aliases ma
    JOIN services s ON ma.service_id = s.id
    WHERE ma.alias = ? AND s.enabled = 1
  `).get(model) as any

  if (alias) {
    return {
      service: {
        id: alias.service_id,
        name: alias.name,
        provider: alias.provider,
        api_key: alias.api_key,
        base_url: alias.base_url,
        account_id: alias.account_id,
        enabled: alias.enabled,
        created_at: alias.created_at,
        updated_at: alias.updated_at,
      },
      resolvedModel: alias.target_model,
    }
  }

  // Check service_models table first — any model explicitly added to a service
  // takes priority over prefix-based routing (e.g. "claude-opus-4-6" added to an OpenAI-type service)
  const modelMatch = db.prepare(`
    SELECT s.* FROM service_models sm
    JOIN services s ON sm.service_id = s.id
    WHERE sm.model_id = ? AND s.enabled = 1
    LIMIT 1
  `).get(model) as Service | undefined
  if (modelMatch) return { service: modelMatch, resolvedModel: model }

  // Fallback: route by model prefix
  let provider = ''
  if (model.startsWith('gpt-') || model === 'o1' || model.startsWith('o1-') || model === 'o3' || model.startsWith('o3-')) {
    provider = 'openai'
  } else if (model.startsWith('claude-')) {
    provider = 'anthropic'
  } else if (model.startsWith('gemini-') || model.startsWith('models/gemini')) {
    provider = 'gemini'
  } else if (model.startsWith('deepseek-')) {
    provider = 'deepseek'
  } else if (model.startsWith('@cf/')) {
    provider = 'cloudflare'
  }

  if (!provider) return null

  const service = db.prepare(`
    SELECT * FROM services WHERE provider = ? AND enabled = 1 LIMIT 1
  `).get(provider) as Service | undefined

  if (!service) return null
  return { service, resolvedModel: model }
}

function estimateCost(model: string, promptTokens: number, completionTokens: number): number {
  const db = getDb()
  const pricing = db.prepare('SELECT * FROM model_pricing WHERE model = ?').get(model) as any
  if (!pricing) return 0
  return (promptTokens / 1000) * pricing.input_cost_per_1k + (completionTokens / 1000) * pricing.output_cost_per_1k
}

function logRequest(params: {
  service_id: string | null
  provider: string
  model: string
  status: 'success' | 'error'
  status_code: number
  prompt_tokens: number
  completion_tokens: number
  estimated_cost_usd: number
  latency_ms: number
  error_message: string | null
}) {
  const settings = getDb().prepare("SELECT value FROM settings WHERE key = 'log_enabled'").get() as any
  if (settings?.value === '0') return

  const db = getDb()
  db.prepare(`
    INSERT INTO request_logs (
      id, service_id, provider, model, status, status_code,
      prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd,
      latency_ms, error_message, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    uuidv4(),
    params.service_id,
    params.provider,
    params.model,
    params.status,
    params.status_code,
    params.prompt_tokens,
    params.completion_tokens,
    params.prompt_tokens + params.completion_tokens,
    params.estimated_cost_usd,
    params.latency_ms,
    params.error_message,
    Date.now()
  )
}

// GET /v1/models
router.get('/models', (_req, res) => {
  const db = getDb()

  // Read models from service_models table (dynamic, not hardcoded)
  const dbModels = db.prepare(`
    SELECT sm.model_id, s.provider
    FROM service_models sm
    JOIN services s ON sm.service_id = s.id
    WHERE s.enabled = 1
    ORDER BY sm.model_id ASC
  `).all() as { model_id: string; provider: string }[]

  const models: { id: string; object: string; created: number; owned_by: string }[] = []
  const seen = new Set<string>()

  for (const m of dbModels) {
    if (!seen.has(m.model_id)) {
      seen.add(m.model_id)
      models.push({ id: m.model_id, object: 'model', created: 1677610602, owned_by: m.provider })
    }
  }

  // Add aliases
  const aliases = db.prepare('SELECT alias FROM model_aliases').all() as { alias: string }[]
  for (const a of aliases) {
    if (!seen.has(a.alias)) {
      seen.add(a.alias)
      models.push({ id: a.alias, object: 'model', created: 1677610602, owned_by: 'alias' })
    }
  }

  res.json({ object: 'list', data: models })
})

// Reject non-POST methods on /chat/completions with a clear 405 (otherwise
// Express returns its default 404 / the SPA fallback returns HTML, which makes
// users think the endpoint doesn't exist).
router.all('/chat/completions', (req, res, next) => {
  if (req.method === 'POST') return next()
  res.set('Allow', 'POST')
  res.status(405).json({
    error: {
      message: `Method ${req.method} not allowed on /v1/chat/completions. Use POST with a JSON body { "model": "...", "messages": [...] }.`,
      type: 'method_not_allowed',
    },
  })
})

// POST /v1/chat/completions
router.post('/chat/completions', async (req: Request, res: Response) => {
  const chatReq = req.body as OpenAIChatRequest

  if (!chatReq.model || !chatReq.messages || !Array.isArray(chatReq.messages) || chatReq.messages.length === 0) {
    return res.status(400).json({ error: { message: 'model and a non-empty messages array are required', type: 'invalid_request_error' } })
  }

  const match = getServiceForModel(chatReq.model)
  if (!match) {
    return res.status(400).json({
      error: {
        message: `No enabled service found for model "${chatReq.model}". Add a service in the dashboard.`,
        type: 'invalid_request_error',
      },
    })
  }

  const { service, resolvedModel } = match
  const requestWithResolvedModel = { ...chatReq, model: resolvedModel }
  const start = Date.now()

  try {
    const { promptTokens, completionTokens, statusCode } = await dispatch(
      service,
      requestWithResolvedModel,
      res
    )
    const latency = Date.now() - start
    const cost = estimateCost(resolvedModel, promptTokens, completionTokens)

    logRequest({
      service_id: service.id,
      provider: service.provider,
      model: resolvedModel,
      status: statusCode < 400 ? 'success' : 'error',
      status_code: statusCode,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      estimated_cost_usd: cost,
      latency_ms: latency,
      error_message: null,
    })
  } catch (err: any) {
    const latency = Date.now() - start
    const errMsg = err.message || 'Unknown error'
    const baseUrl = service.base_url || getDefaultBaseUrl(service.provider)
    const detailedMsg = `${errMsg} (service: "${service.name}", provider: ${service.provider}, base_url: ${baseUrl})`
    console.error(`[proxy error] ${detailedMsg}`)
    logRequest({
      service_id: service.id,
      provider: service.provider,
      model: resolvedModel,
      status: 'error',
      status_code: 500,
      prompt_tokens: 0,
      completion_tokens: 0,
      estimated_cost_usd: 0,
      latency_ms: latency,
      error_message: detailedMsg,
    })
    if (!res.headersSent) {
      res.status(500).json({ error: { message: detailedMsg, type: 'proxy_error' } })
    }
  }
})

async function dispatch(
  service: Service,
  chatReq: OpenAIChatRequest,
  res: Response
): Promise<{ promptTokens: number; completionTokens: number; statusCode: number }> {
  const baseUrl = service.base_url || getDefaultBaseUrl(service.provider)

  switch (service.provider) {
    case 'openai':
      return proxyOpenAI(chatReq, service.api_key, baseUrl, res as any)
    case 'anthropic':
      return proxyAnthropic(chatReq, service.api_key, baseUrl, res as any)
    case 'gemini':
      return proxyGemini(chatReq, service.api_key, baseUrl, res as any)
    case 'deepseek':
      // DeepSeek's API is OpenAI-compatible (POST /v1/chat/completions, Bearer auth, SSE).
      return proxyOpenAI(chatReq, service.api_key, baseUrl, res as any)
    case 'cloudflare':
      // Workers AI OpenAI-compatible endpoint, scoped to an account id.
      return proxyCloudflare(chatReq, service.api_key, baseUrl, service.account_id, res as any)
    default:
      throw new Error(`Unknown provider: ${service.provider}`)
  }
}

function getDefaultBaseUrl(provider: string): string {
  switch (provider) {
    case 'openai': return 'https://api.openai.com'
    case 'anthropic': return 'https://api.anthropic.com'
    case 'gemini': return 'https://generativelanguage.googleapis.com'
    case 'deepseek': return 'https://api.deepseek.com'
    case 'cloudflare': return CLOUDFLARE_DEFAULT_BASE_URL
    default: return ''
  }
}

export default router
