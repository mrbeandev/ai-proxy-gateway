/**
 * Minimal streaming chat client for the Playground.
 *
 * Posts to the gateway's own `/v1/chat/completions` so the playground exercises
 * the exact path an external client takes — model routing, aliases, per-service
 * keys, request logging and cost estimation all included. Nothing here is
 * dashboard-specific.
 */

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface StreamHandlers {
  /** Called for every incremental token batch. */
  onDelta: (text: string) => void
  signal?: AbortSignal
}

export interface StreamResult {
  content: string
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number }
  /** Wall-clock duration in ms, measured client-side. */
  ms: number
  /** Time to first token in ms — the number that actually reflects perceived speed. */
  ttft?: number
}

/** The subset of an OpenAI SSE frame the playground cares about. */
interface SseFrame {
  choices?: { delta?: { content?: string } }[]
  usage?: StreamResult['usage']
  error?: { message?: string } | string
}

/** Pulls `{ error: { message } }` or `{ error: "..." }` out of a failed response. */
async function readError(res: Response): Promise<string> {
  const raw = await res.text().catch(() => '')
  if (!raw) return `${res.status} ${res.statusText}`
  try {
    const j = JSON.parse(raw)
    const msg = j?.error?.message ?? j?.error ?? j?.message
    if (typeof msg === 'string' && msg) return msg
  } catch {
    // Not JSON — fall through and surface a trimmed body.
  }
  return raw.slice(0, 300)
}

/**
 * Streams a completion, invoking `onDelta` as tokens arrive.
 *
 * Handles the two things a naive SSE reader gets wrong: a chunk boundary can
 * split an `data: {...}` line in half, and the final usage frame arrives in its
 * own event after the last content delta.
 */
export async function streamChat(
  model: string,
  messages: ChatMessage[],
  { onDelta, signal }: StreamHandlers,
): Promise<StreamResult> {
  const started = performance.now()
  let ttft: number | undefined

  const res = await fetch('/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: true }),
    signal,
  })

  if (!res.ok) throw new Error(await readError(res))
  if (!res.body) throw new Error('Response contained no body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let content = ''
  let usage: StreamResult['usage']

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })

    // Keep the trailing fragment in `buffer` — it may be an incomplete line.
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue

      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') continue

      let frame: SseFrame
      try {
        frame = JSON.parse(payload) as SseFrame
      } catch {
        continue // Malformed/partial frame — skip rather than kill the stream.
      }

      // An error can arrive mid-stream, after a 200 has already been sent.
      if (frame.error) {
        const msg = typeof frame.error === 'string' ? frame.error : frame.error.message
        throw new Error(msg || 'Stream returned an error')
      }

      const delta = frame.choices?.[0]?.delta?.content
      if (typeof delta === 'string' && delta) {
        if (ttft === undefined) ttft = performance.now() - started
        content += delta
        onDelta(delta)
      }
      if (frame.usage) usage = frame.usage
    }
  }

  return { content, usage, ms: performance.now() - started, ttft }
}
