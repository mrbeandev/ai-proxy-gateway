/**
 * Unit tests for the Cloudflare Workers AI endpoint builder.
 */
import { describe, it, expect } from 'vitest'
import { buildCloudflareEndpoint, CLOUDFLARE_DEFAULT_BASE_URL } from '../providers/cloudflare'
import { cloudflarePricing } from '../api/models'

const ACCT = '0123456789abcdef0123456789abcdef'

describe('buildCloudflareEndpoint', () => {
  it('builds the default account-scoped endpoint', () => {
    expect(buildCloudflareEndpoint(null, ACCT)).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCT}/ai/v1/chat/completions`
    )
  })

  it('uses the default base url constant when base is empty', () => {
    expect(buildCloudflareEndpoint('', ACCT)).toContain(CLOUDFLARE_DEFAULT_BASE_URL)
  })

  it('does not duplicate /client/v4 when the base already includes it', () => {
    expect(buildCloudflareEndpoint('https://api.cloudflare.com/client/v4', ACCT)).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCT}/ai/v1/chat/completions`
    )
  })

  it('strips trailing slashes on the base url', () => {
    expect(buildCloudflareEndpoint('https://api.cloudflare.com/', ACCT)).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCT}/ai/v1/chat/completions`
    )
  })

  it('accepts a base url that already ends with /ai', () => {
    expect(buildCloudflareEndpoint(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/ai`, null)).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCT}/ai/v1/chat/completions`
    )
  })

  it('accepts a base url that already ends with /v1', () => {
    expect(buildCloudflareEndpoint(`https://api.cloudflare.com/client/v4/accounts/${ACCT}/ai/v1`, null)).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCT}/ai/v1/chat/completions`
    )
  })

  it('supports AI Gateway workers-ai base urls', () => {
    expect(buildCloudflareEndpoint(`https://gateway.ai.cloudflare.com/v1/${ACCT}/my-gw/workers-ai`, null)).toBe(
      `https://gateway.ai.cloudflare.com/v1/${ACCT}/my-gw/workers-ai/v1/chat/completions`
    )
  })

  it('supports a custom path such as /embeddings', () => {
    expect(buildCloudflareEndpoint(null, ACCT, '/embeddings')).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCT}/ai/v1/embeddings`
    )
  })

  it('throws a helpful error when no account id and no scoped base url', () => {
    expect(() => buildCloudflareEndpoint(null, null)).toThrow(/Account ID/)
  })
})

describe('cloudflarePricing', () => {
  it('converts per-million pricing to per-1k', () => {
    expect(cloudflarePricing({
      name: '@cf/openai/gpt-oss-120b',
      properties: [{
        property_id: 'price',
        value: [
          { unit: 'per M input tokens', price: 0.35, currency: 'USD' },
          { unit: 'per M output tokens', price: 0.75, currency: 'USD' },
        ],
      }],
    })).toEqual({ input_cost_per_1k: 0.00035, output_cost_per_1k: 0.00075 })
  })

  it('ignores "per M cached input tokens" so it cannot clobber the real input price', () => {
    expect(cloudflarePricing({
      name: '@cf/deepseek-ai/deepseek-v4-pro-0813',
      properties: [{
        property_id: 'price',
        value: [
          { unit: 'per M input tokens', price: 1.32, currency: 'USD' },
          { unit: 'per M output tokens', price: 3.96, currency: 'USD' },
          { unit: 'per M cached input tokens', price: 0.044, currency: 'USD' },
        ],
      }],
    })).toEqual({ input_cost_per_1k: 0.00132, output_cost_per_1k: 0.00396 })
  })

  it('returns empty when the model has no price property', () => {
    expect(cloudflarePricing({ name: '@cf/x/y', properties: [] })).toEqual({})
  })

  it('returns empty when only input pricing is present', () => {
    expect(cloudflarePricing({
      name: '@cf/x/y',
      properties: [{ property_id: 'price', value: [{ unit: 'per M input tokens', price: 1 }] }],
    })).toEqual({})
  })

  it('returns empty when properties are missing entirely', () => {
    expect(cloudflarePricing({ name: '@cf/x/y' })).toEqual({})
  })
})
