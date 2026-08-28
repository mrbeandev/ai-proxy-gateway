import type { OpenAIChatRequest } from '../../types'
import type { ServerResponse } from 'http'
import { proxyOpenAICompatible } from './openai'

export const CLOUDFLARE_DEFAULT_BASE_URL = 'https://api.cloudflare.com'

/**
 * Builds the OpenAI-compatible endpoint for Cloudflare Workers AI.
 *
 * Supported shapes:
 *  - default:            https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/v1/chat/completions
 *  - custom base ending
 *    in /ai or /v1:      <base>/v1/chat/completions  |  <base>/chat/completions
 *  - AI Gateway:         https://gateway.ai.cloudflare.com/v1/{acct}/{gw}/workers-ai
 *                        → .../workers-ai/v1/chat/completions
 */
export function buildCloudflareEndpoint(
  baseUrl: string | null | undefined,
  accountId: string | null | undefined,
  path = '/chat/completions'
): string {
  const base = (baseUrl || CLOUDFLARE_DEFAULT_BASE_URL).replace(/\/+$/, '')

  // Base already points at a full OpenAI-compatible root (…/v1)
  if (/\/v1$/.test(base)) return base + path

  // Base already points at the Workers AI root (…/ai or …/workers-ai)
  if (/\/(ai|workers-ai)$/.test(base)) return `${base}/v1${path}`

  // Base is the Cloudflare API root — we need an account id to build the path
  if (!accountId) {
    throw new Error(
      'Cloudflare Workers AI requires an Account ID (or a Base URL that already includes /accounts/{id}/ai)'
    )
  }
  const root = /\/client\/v4$/.test(base) ? base : `${base}/client/v4`
  return `${root}/accounts/${accountId}/ai/v1${path}`
}

export async function proxyCloudflare(
  chatReq: OpenAIChatRequest,
  apiKey: string,
  baseUrl: string,
  accountId: string | null | undefined,
  clientRes: ServerResponse
): Promise<{ promptTokens: number; completionTokens: number; statusCode: number }> {
  const endpoint = buildCloudflareEndpoint(baseUrl, accountId)
  // Workers AI does not support `stream_options.include_usage`; sending it 400s.
  return proxyOpenAICompatible(chatReq, apiKey, endpoint, clientRes, { includeUsageOption: false })
}
