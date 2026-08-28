import { Router } from 'express'
import { getDb } from '../db'

const router = Router()

router.get('/', (_req, res) => {
  const db = getDb()
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000

  const totalRequests = (db.prepare('SELECT COUNT(*) as cnt FROM request_logs').get() as any).cnt
  const totalTokens = (db.prepare('SELECT COALESCE(SUM(total_tokens), 0) as t FROM request_logs').get() as any).t
  const totalPromptTokens = (db.prepare('SELECT COALESCE(SUM(prompt_tokens), 0) as t FROM request_logs').get() as any).t
  const totalCompletionTokens = (db.prepare('SELECT COALESCE(SUM(completion_tokens), 0) as t FROM request_logs').get() as any).t
  const totalCost = (db.prepare('SELECT COALESCE(SUM(estimated_cost_usd), 0) as c FROM request_logs').get() as any).c
  const successCount = (db.prepare("SELECT COUNT(*) as cnt FROM request_logs WHERE status = 'success'").get() as any).cnt
  const successRate = totalRequests > 0 ? ((successCount / totalRequests) * 100).toFixed(1) : '0.0'
  const avgLatency = (db.prepare("SELECT COALESCE(AVG(latency_ms), 0) as l FROM request_logs WHERE latency_ms IS NOT NULL AND status = 'success'").get() as any).l

  const activeServices = (db.prepare("SELECT COUNT(*) as cnt FROM services WHERE enabled = 1").get() as any).cnt
  const totalServices = (db.prepare('SELECT COUNT(*) as cnt FROM services').get() as any).cnt

  // 24h comparison
  const yesterday = now - day
  const requestsToday = (db.prepare('SELECT COUNT(*) as cnt FROM request_logs WHERE created_at >= ?').get(yesterday) as any).cnt

  // Top models
  const topModels = db.prepare(`
    SELECT
      model,
      provider,
      COUNT(*) as requests,
      COALESCE(SUM(total_tokens), 0) as tokens,
      COALESCE(SUM(estimated_cost_usd), 0) as cost,
      ROUND(100.0 * SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) / COUNT(*), 1) as success_rate,
      COALESCE(AVG(latency_ms), 0) as avg_latency
    FROM request_logs
    GROUP BY model, provider
    ORDER BY requests DESC
    LIMIT 10
  `).all()

  // Recent requests
  const recentRequests = db.prepare(`
    SELECT id, provider, model, status, total_tokens, estimated_cost_usd, latency_ms, created_at
    FROM request_logs
    ORDER BY created_at DESC
    LIMIT 10
  `).all()

  res.json({
    totalRequests,
    totalTokens,
    totalPromptTokens,
    totalCompletionTokens,
    totalCost,
    successRate: parseFloat(successRate),
    avgLatency: Math.round(avgLatency),
    activeServices,
    totalServices,
    requestsToday,
    topModels,
    recentRequests,
  })
})

router.get('/timeseries', (_req, res) => {
  const db = getDb()
  const now = Date.now()
  const day = 24 * 60 * 60 * 1000

  // Last 7 days, grouped by day and provider
  const rows = db.prepare(`
    SELECT
      CAST((created_at / 86400000) AS INTEGER) * 86400000 as day_ts,
      provider,
      COUNT(*) as requests,
      COALESCE(SUM(total_tokens), 0) as tokens,
      COALESCE(SUM(estimated_cost_usd), 0) as cost
    FROM request_logs
    WHERE created_at >= ?
    GROUP BY day_ts, provider
    ORDER BY day_ts ASC
  `).all(now - 7 * day)

  res.json(rows)
})

/**
 * Request volume per ACTIVE day, split by provider, plus the success/error
 * ribbon for the same days.
 *
 * Traffic here is bursty: the database can span months while only a handful of
 * days actually carry requests. A calendar-spaced axis renders that as mostly
 * empty whitespace, so this endpoint returns only days with >= 1 request and
 * reports how many it found. The client draws them on an ordinal axis and
 * labels it honestly ("N active days across M").
 *
 * `?days=` optionally clamps to a trailing window (default: all history).
 */
router.get('/activity', (req, res) => {
  const db = getDb()
  const day = 24 * 60 * 60 * 1000
  const windowDays = Number(req.query.days)
  const since = Number.isFinite(windowDays) && windowDays > 0 ? Date.now() - windowDays * day : 0

  const perProvider = db.prepare(`
    SELECT
      CAST((created_at / 86400000) AS INTEGER) * 86400000 as day_ts,
      provider,
      COUNT(*) as requests
    FROM request_logs
    WHERE created_at >= ?
    GROUP BY day_ts, provider
    ORDER BY day_ts ASC
  `).all(since) as any[]

  const perDay = db.prepare(`
    SELECT
      CAST((created_at / 86400000) AS INTEGER) * 86400000 as day_ts,
      COUNT(*) as requests,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
      SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) as errors,
      COALESCE(SUM(total_tokens), 0) as tokens,
      COALESCE(SUM(estimated_cost_usd), 0) as cost
    FROM request_logs
    WHERE created_at >= ?
    GROUP BY day_ts
    ORDER BY day_ts ASC
  `).all(since) as any[]

  const providers = [...new Set(perProvider.map(r => r.provider))]
  const days = perDay.map(d => {
    const row: Record<string, any> = {
      day_ts: d.day_ts,
      requests: d.requests,
      success: d.success,
      errors: d.errors,
      tokens: d.tokens,
      cost: d.cost,
      successRate: d.requests > 0 ? +((d.success / d.requests) * 100).toFixed(1) : 0,
    }
    for (const p of providers) row[p] = 0
    return row
  })
  const byTs = new Map(days.map(d => [d.day_ts, d]))
  for (const r of perProvider) {
    const d = byTs.get(r.day_ts)
    if (d) d[r.provider] = r.requests
  }

  const spanDays = perDay.length > 0
    ? Math.round((perDay[perDay.length - 1].day_ts - perDay[0].day_ts) / day) + 1
    : 0

  res.json({ providers, days, activeDays: days.length, spanDays })
})

/**
 * Weekday x hour-of-day request grid (server local time) for the activity
 * heatmap. Returns a dense 7x24 matrix so the client never has to zero-fill.
 */
router.get('/heatmap', (_req, res) => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT
      CAST(strftime('%w', created_at / 1000, 'unixepoch', 'localtime') AS INTEGER) as dow,
      CAST(strftime('%H', created_at / 1000, 'unixepoch', 'localtime') AS INTEGER) as hour,
      COUNT(*) as requests
    FROM request_logs
    GROUP BY dow, hour
  `).all() as any[]

  const cells = Array.from({ length: 7 * 24 }, (_, i) => ({ dow: Math.floor(i / 24), hour: i % 24, requests: 0 }))
  let max = 0
  for (const r of rows) {
    const cell = cells[r.dow * 24 + r.hour]
    if (cell) {
      cell.requests = r.requests
      if (r.requests > max) max = r.requests
    }
  }

  res.json({ cells, max })
})

/** Traffic + spend split by provider, for the donut. */
router.get('/providers', (_req, res) => {
  const db = getDb()
  const rows = db.prepare(`
    SELECT
      provider,
      COUNT(*) as requests,
      COALESCE(SUM(total_tokens), 0) as tokens,
      COALESCE(SUM(estimated_cost_usd), 0) as cost,
      SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
      COALESCE(AVG(latency_ms), 0) as avg_latency
    FROM request_logs
    GROUP BY provider
    ORDER BY requests DESC
  `).all() as any[]

  res.json(rows.map(r => ({ ...r, avg_latency: Math.round(r.avg_latency) })))
})

export default router
