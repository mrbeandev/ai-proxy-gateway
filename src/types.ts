export type Provider = 'openai' | 'anthropic' | 'gemini' | 'deepseek' | 'cloudflare'

export interface Service {
  id: string
  name: string
  provider: Provider
  api_key: string
  base_url: string | null
  /** Cloudflare Workers AI account id (unused by other providers) */
  account_id?: string | null
  enabled: number
  created_at: number
  updated_at: number
}

export interface RequestLog {
  id: string
  service_id: string | null
  provider: string
  model: string
  status: 'success' | 'error'
  status_code: number | null
  prompt_tokens: number | null
  completion_tokens: number | null
  total_tokens: number | null
  estimated_cost_usd: number | null
  latency_ms: number | null
  error_message: string | null
  created_at: number
}

export interface ModelAlias {
  id: string
  alias: string
  service_id: string
  target_model: string
  description: string | null
  created_at: number
}

export interface ModelPricing {
  model: string
  input_cost_per_1k: number
  output_cost_per_1k: number
  is_custom: number
}

export interface Settings {
  [key: string]: string
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface OpenAIChatRequest {
  model: string
  messages: OpenAIMessage[]
  stream?: boolean
  temperature?: number
  max_tokens?: number
  top_p?: number
  frequency_penalty?: number
  presence_penalty?: number
  [key: string]: unknown
}

export interface OpenAIChatResponse {
  id: string
  object: string
  created: number
  model: string
  choices: {
    index: number
    message: OpenAIMessage
    finish_reason: string
  }[]
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}
