import { DatabaseSync } from 'node:sqlite'
import path from 'path'
import os from 'os'
import fs from 'fs'

export const DATA_DIR = process.env.PROXY_GATEWAY_HOME || path.join(os.homedir(), '.ai-proxy-gateway')
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
}

const DB_PATH = path.join(DATA_DIR, 'gateway.db')

let _db: DatabaseSync | null = null

export function getDb(): DatabaseSync {
  if (_db) return _db
  _db = new DatabaseSync(DB_PATH)
  _db.exec('PRAGMA journal_mode = WAL')
  _db.exec('PRAGMA foreign_keys = ON')
  runMigrations(_db)
  return _db
}

function runMigrations(db: DatabaseSync) {
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

    CREATE TABLE IF NOT EXISTS request_logs (
      id TEXT PRIMARY KEY,
      service_id TEXT REFERENCES services(id) ON DELETE SET NULL,
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

    CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_request_logs_provider ON request_logs(provider);
    CREATE INDEX IF NOT EXISTS idx_request_logs_model ON request_logs(model);

    CREATE TABLE IF NOT EXISTS model_pricing (
      model TEXT PRIMARY KEY,
      input_cost_per_1k REAL NOT NULL,
      output_cost_per_1k REAL NOT NULL,
      is_custom INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS model_aliases (
      id TEXT PRIMARY KEY,
      alias TEXT NOT NULL UNIQUE,
      service_id TEXT REFERENCES services(id) ON DELETE CASCADE,
      target_model TEXT NOT NULL,
      description TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS service_models (
      id TEXT PRIMARY KEY,
      service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      model_id TEXT NOT NULL,
      display_name TEXT,
      created_at INTEGER NOT NULL,
      UNIQUE(service_id, model_id)
    );

    CREATE INDEX IF NOT EXISTS idx_service_models_service ON service_models(service_id);
    CREATE INDEX IF NOT EXISTS idx_service_models_model ON service_models(model_id);
  `)

  // Cloudflare Workers AI needs an account id alongside the API token.
  try {
    db.exec('ALTER TABLE services ADD COLUMN account_id TEXT')
  } catch {
    // column already exists
  }

  // Seed default settings
  const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`)
  const defaultSettings: [string, string][] = [
    ['port', '4141'],
    ['gateway_name', 'My AI Gateway'],
    ['log_enabled', '1'],
    ['retention_days', '30'],
    ['show_request_body', '0'],
    ['theme', 'dark'],
    ['gateway_api_key', ''],
  ]
  for (const [k, v] of defaultSettings) {
    insertSetting.run(k, v)
  }

  // Seed default model pricing (USD per 1k tokens)
  const insertPricing = db.prepare(`
    INSERT OR IGNORE INTO model_pricing (model, input_cost_per_1k, output_cost_per_1k, is_custom)
    VALUES (?, ?, ?, 0)
  `)
  const defaultPricing: [string, number, number][] = [
    ['gpt-4o', 0.005, 0.015],
    ['gpt-4o-mini', 0.00015, 0.0006],
    ['gpt-4-turbo', 0.01, 0.03],
    ['gpt-4', 0.03, 0.06],
    ['gpt-3.5-turbo', 0.0005, 0.0015],
    ['o1', 0.015, 0.06],
    ['o3-mini', 0.0011, 0.0044],
    ['claude-opus-4-5', 0.015, 0.075],
    ['claude-sonnet-4-5', 0.003, 0.015],
    ['claude-haiku-4-5', 0.00025, 0.00125],
    ['claude-opus-4', 0.015, 0.075],
    ['claude-sonnet-4', 0.003, 0.015],
    ['claude-haiku-4', 0.00025, 0.00125],
    ['claude-3-5-sonnet-20241022', 0.003, 0.015],
    ['claude-3-5-haiku-20241022', 0.001, 0.005],
    ['claude-3-opus-20240229', 0.015, 0.075],
    ['gemini-2.0-flash', 0.0001, 0.0004],
    ['gemini-1.5-pro', 0.00125, 0.005],
    ['gemini-1.5-flash', 0.000075, 0.0003],
    ['gemini-pro', 0.0005, 0.0015],
    ['deepseek-chat', 0.00027, 0.0011],
    ['deepseek-reasoner', 0.00055, 0.00219],
    // Cloudflare Workers AI (per 1k tokens, converted from per-million pricing)
    ['@cf/meta/llama-3.3-70b-instruct-fp8-fast', 0.00029, 0.00225],
    ['@cf/meta/llama-4-scout-17b-16e-instruct', 0.00027, 0.00085],
    ['@cf/openai/gpt-oss-120b', 0.00035, 0.00075],
    ['@cf/openai/gpt-oss-20b', 0.0002, 0.0003],
    ['@cf/qwen/qwen2.5-coder-32b-instruct', 0.00066, 0.001],
    ['@cf/mistralai/mistral-small-3.1-24b-instruct', 0.00035, 0.000555],
    ['@cf/google/gemma-3-12b-it', 0.000345, 0.000556],
  ]
  for (const [model, inp, out] of defaultPricing) {
    insertPricing.run(model, inp, out)
  }
}

export const DEFAULT_MODELS: Record<string, string[]> = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo', 'o1', 'o3-mini'],
  anthropic: ['claude-opus-4', 'claude-sonnet-4', 'claude-haiku-4', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro', 'gemini-1.5-flash'],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  cloudflare: [
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    '@cf/meta/llama-4-scout-17b-16e-instruct',
    '@cf/openai/gpt-oss-120b',
    '@cf/openai/gpt-oss-20b',
    '@cf/qwen/qwen2.5-coder-32b-instruct',
  ],
}

export function seedModelsForService(db: DatabaseSync, serviceId: string, provider: string) {
  const models = DEFAULT_MODELS[provider] || []
  const insert = db.prepare('INSERT OR IGNORE INTO service_models (id, service_id, model_id, display_name, created_at) VALUES (?, ?, ?, NULL, ?)')
  const now = Date.now()
  for (const m of models) {
    insert.run(`sm-${serviceId}-${m}`, serviceId, m, now)
  }
}

export function pruneOldLogs(db: DatabaseSync) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('retention_days') as any
  const retentionDays = parseInt(row?.value || '30', 10)
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000
  db.prepare('DELETE FROM request_logs WHERE created_at < ?').run(cutoff)
}
