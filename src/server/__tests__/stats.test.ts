/**
 * Unit tests for the dashboard aggregation queries.
 *
 * These mirror the SQL in `src/server/api/stats.ts` against an in-memory DB,
 * so the shaping logic (active-day collapsing, dense 7x24 heatmap matrix,
 * provider split) is verified without booting the full server.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { DatabaseSync } from 'node:sqlite'

const DAY = 86_400_000

let db: DatabaseSync

/** Deterministic fixture: 3 active days inside a 10-day span. */
beforeAll(() => {
  db = new DatabaseSync(':memory:')
  db.exec(`
    CREATE TABLE request_logs (
      id TEXT PRIMARY KEY, service_id TEXT, provider TEXT NOT NULL, model TEXT NOT NULL,
      status TEXT NOT NULL, status_code INTEGER, prompt_tokens INTEGER, completion_tokens INTEGER,
      total_tokens INTEGER, estimated_cost_usd REAL, latency_ms INTEGER, error_message TEXT,
      created_at INTEGER NOT NULL
    );
  `)

  // Anchor on a known UTC instant so day bucketing is stable.
  const base = Date.UTC(2026, 0, 5, 12, 0, 0)
  const rows: [string, string, string, number, number, number][] = [
    // id-suffix, provider, status, dayOffset, latency, cost
    ['a1', 'openai', 'success', 0, 100, 0.01],
    ['a2', 'openai', 'success', 0, 200, 0.02],
    ['a3', 'anthropic', 'error', 0, 300, 0],
    // day 4 — one provider only
    ['b1', 'openai', 'success', 4, 400, 0.03],
    // day 9 — mixed, includes an error
    ['c1', 'gemini', 'success', 9, 500, 0.04],
    ['c2', 'gemini', 'error', 9, 600, 0],
  ]
  const stmt = db.prepare(
    `INSERT INTO request_logs (id, provider, model, status, total_tokens, estimated_cost_usd, latency_ms, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const [id, provider, status, off, latency, cost] of rows) {
    stmt.run(id, provider, `${provider}-model`, status, 10, cost, latency, base + off * DAY)
  }
})

/** Mirrors the `/activity` handler's shaping. */
function activity() {
  const perProvider = db.prepare(`
    SELECT CAST((created_at / 86400000) AS INTEGER) * 86400000 as day_ts, provider, COUNT(*) as requests
    FROM request_logs GROUP BY day_ts, provider ORDER BY day_ts ASC
  `).all() as any[]

  const perDay = db.prepare(`
    SELECT CAST((created_at / 86400000) AS INTEGER) * 86400000 as day_ts,
           COUNT(*) as requests,
           SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
           SUM(CASE WHEN status != 'success' THEN 1 ELSE 0 END) as errors
    FROM request_logs GROUP BY day_ts ORDER BY day_ts ASC
  `).all() as any[]

  const providers = [...new Set(perProvider.map(r => r.provider))]
  const days = perDay.map(d => {
    const row: Record<string, any> = {
      day_ts: d.day_ts,
      requests: d.requests,
      success: d.success,
      errors: d.errors,
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
  const spanDays = perDay.length
    ? Math.round((perDay[perDay.length - 1].day_ts - perDay[0].day_ts) / DAY) + 1
    : 0
  return { providers, days, activeDays: days.length, spanDays }
}

describe('GET /api/stats/activity shaping', () => {
  it('returns only days that carried traffic', () => {
    const { activeDays, days } = activity()
    expect(activeDays).toBe(3)
    expect(days).toHaveLength(3)
  })

  it('reports the calendar span separately from the active-day count', () => {
    // 3 active days spread across a 10-day window — the ratio the UI labels.
    const { activeDays, spanDays } = activity()
    expect(spanDays).toBe(10)
    expect(activeDays).toBeLessThan(spanDays)
  })

  it('zero-fills providers that were idle on a given day', () => {
    const { days } = activity()
    // Day 2 (offset 4) had only an openai request.
    expect(days[1].openai).toBe(1)
    expect(days[1].anthropic).toBe(0)
    expect(days[1].gemini).toBe(0)
  })

  it('computes success rate per day', () => {
    const { days } = activity()
    expect(days[0].requests).toBe(3)
    expect(days[0].success).toBe(2)
    expect(days[0].errors).toBe(1)
    expect(days[0].successRate).toBeCloseTo(66.7, 1)
    expect(days[1].successRate).toBe(100)
    expect(days[2].successRate).toBe(50)
  })

  it('per-provider counts sum to the day total', () => {
    const { days, providers } = activity()
    for (const d of days) {
      const sum = providers.reduce((a, p) => a + (d[p] as number), 0)
      expect(sum).toBe(d.requests)
    }
  })
})

describe('GET /api/stats/heatmap shaping', () => {
  function heatmap() {
    const rows = db.prepare(`
      SELECT CAST(strftime('%w', created_at / 1000, 'unixepoch') AS INTEGER) as dow,
             CAST(strftime('%H', created_at / 1000, 'unixepoch') AS INTEGER) as hour,
             COUNT(*) as requests
      FROM request_logs GROUP BY dow, hour
    `).all() as any[]
    const cells = Array.from({ length: 7 * 24 }, (_, i) => ({
      dow: Math.floor(i / 24), hour: i % 24, requests: 0,
    }))
    let max = 0
    for (const r of rows) {
      const cell = cells[r.dow * 24 + r.hour]
      if (cell) {
        cell.requests = r.requests
        if (r.requests > max) max = r.requests
      }
    }
    return { cells, max }
  }

  it('always returns a dense 7x24 matrix', () => {
    const { cells } = heatmap()
    expect(cells).toHaveLength(168)
  })

  it('covers every weekday/hour coordinate exactly once', () => {
    const { cells } = heatmap()
    const seen = new Set(cells.map(c => `${c.dow}-${c.hour}`))
    expect(seen.size).toBe(168)
  })

  it('cell totals equal the row count, and max is the busiest cell', () => {
    const { cells, max } = heatmap()
    expect(cells.reduce((a, c) => a + c.requests, 0)).toBe(6)
    expect(max).toBe(Math.max(...cells.map(c => c.requests)))
    expect(max).toBeGreaterThan(0)
  })
})

describe('GET /api/stats/providers shaping', () => {
  it('splits traffic and spend by provider, busiest first', () => {
    const rows = db.prepare(`
      SELECT provider, COUNT(*) as requests,
             COALESCE(SUM(estimated_cost_usd), 0) as cost,
             SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success
      FROM request_logs GROUP BY provider ORDER BY requests DESC
    `).all() as any[]

    expect(rows[0].provider).toBe('openai')
    expect(rows[0].requests).toBe(3)
    expect(rows[0].success).toBe(3)
    expect(rows[0].cost).toBeCloseTo(0.06, 5)

    const total = rows.reduce((a, r) => a + r.requests, 0)
    expect(total).toBe(6)
  })
})
