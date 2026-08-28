import { Router } from 'express'
import { getDb, seedModelsForService } from '../db'
import { v4 as uuidv4 } from 'uuid'
import type { Service } from '../../types'

const router = Router()

router.get('/', (_req, res) => {
  const db = getDb()
  const services = db.prepare('SELECT * FROM services ORDER BY created_at ASC').all() as Service[]
  // Mask API keys in response
  res.json(services.map(s => ({ ...s, api_key: s.api_key ? '***' + s.api_key.slice(-4) : '' })))
})

router.post('/', (req, res) => {
  const { name, provider, api_key, base_url, account_id } = req.body
  if (!name || !provider || !api_key) {
    return res.status(400).json({ error: 'name, provider, and api_key are required' })
  }
  if (provider === 'cloudflare' && !account_id && !base_url) {
    return res.status(400).json({ error: 'account_id is required for Cloudflare Workers AI' })
  }
  const db = getDb()
  const id = uuidv4()
  const now = Date.now()
  db.prepare(`
    INSERT INTO services (id, name, provider, api_key, base_url, account_id, enabled, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `).run(id, name, provider, api_key, base_url || null, account_id || null, now, now)
  seedModelsForService(db, id, provider)
  const service = db.prepare('SELECT * FROM services WHERE id = ?').get(id) as Service
  res.status(201).json({ ...service, api_key: '***' + service.api_key.slice(-4) })
})

router.put('/:id', (req, res) => {
  const { id } = req.params
  const db = getDb()
  const existing = db.prepare('SELECT * FROM services WHERE id = ?').get(id) as Service | undefined
  if (!existing) return res.status(404).json({ error: 'Service not found' })

  const { name, provider, api_key, base_url, account_id, enabled } = req.body
  const now = Date.now()
  db.prepare(`
    UPDATE services SET
      name = ?,
      provider = ?,
      api_key = ?,
      base_url = ?,
      account_id = ?,
      enabled = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    name ?? existing.name,
    provider ?? existing.provider,
    api_key || existing.api_key,
    base_url !== undefined ? base_url : existing.base_url,
    account_id !== undefined ? (account_id || null) : (existing.account_id ?? null),
    enabled !== undefined ? enabled : existing.enabled,
    now,
    id
  )
  const updated = db.prepare('SELECT * FROM services WHERE id = ?').get(id) as Service
  res.json({ ...updated, api_key: '***' + updated.api_key.slice(-4) })
})

router.delete('/:id', (req, res) => {
  const { id } = req.params
  const db = getDb()
  const result = db.prepare('DELETE FROM services WHERE id = ?').run(id)
  if (result.changes === 0) return res.status(404).json({ error: 'Service not found' })
  res.json({ success: true })
})

// Get raw API key (for proxy use - internal only, not exposed via same route)
export function getServiceApiKey(id: string): string | null {
  const db = getDb()
  const s = db.prepare('SELECT api_key FROM services WHERE id = ?').get(id) as { api_key: string } | undefined
  return s?.api_key || null
}

export default router
