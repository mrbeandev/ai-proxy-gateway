/**
 * Unit tests for the model routing logic in proxy.ts
 * We extract the routing function so it can be tested in isolation.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

// Inline the routing logic so we can test it without starting a full server
function detectProvider(model: string): string | null {
  if (model.startsWith('gpt-') || model.startsWith('o1') || model.startsWith('o3')) return 'openai'
  if (model.startsWith('claude-')) return 'anthropic'
  if (model.startsWith('gemini-') || model.startsWith('models/gemini')) return 'gemini'
  if (model.startsWith('deepseek-')) return 'deepseek'
  if (model.startsWith('@cf/')) return 'cloudflare'
  return null
}

describe('Model → Provider routing', () => {
  describe('OpenAI models', () => {
    it('routes gpt-4o', () => expect(detectProvider('gpt-4o')).toBe('openai'))
    it('routes gpt-4o-mini', () => expect(detectProvider('gpt-4o-mini')).toBe('openai'))
    it('routes gpt-3.5-turbo', () => expect(detectProvider('gpt-3.5-turbo')).toBe('openai'))
    it('routes gpt-4-turbo', () => expect(detectProvider('gpt-4-turbo')).toBe('openai'))
    it('routes o1', () => expect(detectProvider('o1')).toBe('openai'))
    it('routes o3-mini', () => expect(detectProvider('o3-mini')).toBe('openai'))
  })

  describe('Anthropic models', () => {
    it('routes claude-sonnet-4', () => expect(detectProvider('claude-sonnet-4')).toBe('anthropic'))
    it('routes claude-opus-4', () => expect(detectProvider('claude-opus-4')).toBe('anthropic'))
    it('routes claude-haiku-4', () => expect(detectProvider('claude-haiku-4')).toBe('anthropic'))
    it('routes claude-3-5-sonnet-20241022', () => expect(detectProvider('claude-3-5-sonnet-20241022')).toBe('anthropic'))
  })

  describe('Gemini models', () => {
    it('routes gemini-2.0-flash', () => expect(detectProvider('gemini-2.0-flash')).toBe('gemini'))
    it('routes gemini-1.5-pro', () => expect(detectProvider('gemini-1.5-pro')).toBe('gemini'))
    it('routes models/gemini-pro', () => expect(detectProvider('models/gemini-pro')).toBe('gemini'))
  })

  describe('DeepSeek models', () => {
    it('routes deepseek-chat', () => expect(detectProvider('deepseek-chat')).toBe('deepseek'))
    it('routes deepseek-reasoner', () => expect(detectProvider('deepseek-reasoner')).toBe('deepseek'))
  })

  describe('Cloudflare Workers AI models', () => {
    it('routes @cf/meta/llama-3.1-8b-instruct', () => expect(detectProvider('@cf/meta/llama-3.1-8b-instruct')).toBe('cloudflare'))
    it('routes @cf/openai/gpt-oss-120b', () => expect(detectProvider('@cf/openai/gpt-oss-120b')).toBe('cloudflare'))
    it('routes @cf/deepseek-ai/deepseek-v4-flash-0731 to cloudflare, not deepseek', () =>
      expect(detectProvider('@cf/deepseek-ai/deepseek-v4-flash-0731')).toBe('cloudflare'))
  })

  describe('Unknown models', () => {
    it('returns null for unknown model', () => expect(detectProvider('llama-3')).toBeNull())
    it('returns null for empty string', () => expect(detectProvider('')).toBeNull())
    it('returns null for mistral', () => expect(detectProvider('mistral-7b')).toBeNull())
  })
})

describe('Cost estimation logic', () => {
  function estimateCost(
    model: string,
    promptTokens: number,
    completionTokens: number,
    pricing: Record<string, { input_cost_per_1k: number; output_cost_per_1k: number }>
  ): number {
    const p = pricing[model]
    if (!p) return 0
    return (promptTokens / 1000) * p.input_cost_per_1k + (completionTokens / 1000) * p.output_cost_per_1k
  }

  const testPricing = {
    'gpt-4o': { input_cost_per_1k: 0.005, output_cost_per_1k: 0.015 },
    'gpt-4o-mini': { input_cost_per_1k: 0.00015, output_cost_per_1k: 0.0006 },
    'claude-sonnet-4': { input_cost_per_1k: 0.003, output_cost_per_1k: 0.015 },
  }

  it('calculates gpt-4o cost correctly', () => {
    const cost = estimateCost('gpt-4o', 1000, 500, testPricing)
    expect(cost).toBeCloseTo(0.005 + 0.0075, 8)
  })

  it('calculates gpt-4o-mini cost correctly', () => {
    const cost = estimateCost('gpt-4o-mini', 2000, 1000, testPricing)
    expect(cost).toBeCloseTo(0.0003 + 0.0006, 8)
  })

  it('returns 0 for unknown model', () => {
    const cost = estimateCost('unknown-model', 1000, 500, testPricing)
    expect(cost).toBe(0)
  })

  it('returns 0 for zero tokens', () => {
    const cost = estimateCost('gpt-4o', 0, 0, testPricing)
    expect(cost).toBe(0)
  })
})

describe('SQLite DB setup', () => {
  let db: DatabaseSync

  beforeEach(() => {
    db = new DatabaseSync(':memory:')
    db.exec('PRAGMA foreign_keys = ON')
  })

  afterEach(() => {
    db.close()
  })

  it('creates tables without error', () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS services (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider TEXT NOT NULL,
        api_key TEXT NOT NULL,
        base_url TEXT,
        enabled INTEGER DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS model_aliases (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        service_id TEXT REFERENCES services(id) ON DELETE CASCADE,
        target_model TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS request_logs (
        id TEXT PRIMARY KEY,
        service_id TEXT,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        status TEXT NOT NULL,
        status_code INTEGER,
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        total_tokens INTEGER,
        estimated_cost_usd REAL,
        latency_ms INTEGER,
        error_message TEXT,
        created_at INTEGER NOT NULL
      );
    `)
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as { name: string }[]
    const names = tables.map(t => t.name)
    expect(names).toContain('services')
    expect(names).toContain('settings')
    expect(names).toContain('model_aliases')
    expect(names).toContain('request_logs')
  })

  it('enforces UNIQUE constraint on aliases', () => {
    db.exec(`
      CREATE TABLE services (id TEXT PRIMARY KEY, name TEXT, provider TEXT, api_key TEXT, enabled INTEGER, created_at INTEGER, updated_at INTEGER);
      CREATE TABLE model_aliases (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        service_id TEXT REFERENCES services(id) ON DELETE CASCADE,
        target_model TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL
      );
    `)
    db.prepare("INSERT INTO services VALUES ('s1','OpenAI','openai','key',1,0,0)").run()
    db.prepare("INSERT INTO model_aliases VALUES ('a1','fast','s1','gpt-4o-mini',NULL,0)").run()
    expect(() => {
      db.prepare("INSERT INTO model_aliases VALUES ('a2','fast','s1','gpt-4o',NULL,0)").run()
    }).toThrow()
  })

  it('cascades delete aliases when service is deleted', () => {
    db.exec(`
      CREATE TABLE services (id TEXT PRIMARY KEY, name TEXT, provider TEXT, api_key TEXT, enabled INTEGER, created_at INTEGER, updated_at INTEGER);
      CREATE TABLE model_aliases (
        id TEXT PRIMARY KEY,
        alias TEXT NOT NULL UNIQUE,
        service_id TEXT REFERENCES services(id) ON DELETE CASCADE,
        target_model TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL
      );
    `)
    db.prepare("INSERT INTO services VALUES ('s1','OpenAI','openai','key',1,0,0)").run()
    db.prepare("INSERT INTO model_aliases VALUES ('a1','fast','s1','gpt-4o-mini',NULL,0)").run()
    db.prepare("DELETE FROM services WHERE id = 's1'").run()
    const aliases = db.prepare('SELECT * FROM model_aliases').all()
    expect(aliases).toHaveLength(0)
  })

  it('inserts and retrieves a request log', () => {
    db.exec(`
      CREATE TABLE request_logs (
        id TEXT PRIMARY KEY, service_id TEXT, provider TEXT NOT NULL, model TEXT NOT NULL,
        status TEXT NOT NULL, status_code INTEGER, prompt_tokens INTEGER, completion_tokens INTEGER,
        total_tokens INTEGER, estimated_cost_usd REAL, latency_ms INTEGER, error_message TEXT, created_at INTEGER NOT NULL
      );
    `)
    db.prepare(`
      INSERT INTO request_logs VALUES ('log1', NULL, 'openai', 'gpt-4o', 'success', 200, 100, 50, 150, 0.001, 342, NULL, ?)
    `).run(Date.now())
    const log = db.prepare('SELECT * FROM request_logs WHERE id = ?').get('log1') as any
    expect(log.provider).toBe('openai')
    expect(log.model).toBe('gpt-4o')
    expect(log.status).toBe('success')
    expect(log.total_tokens).toBe(150)
    expect(log.latency_ms).toBe(342)
  })
})
