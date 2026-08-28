import { describe, it, expect, vi, afterEach } from 'vitest'
import { streamChat } from './chat'

/** Builds a Response whose body streams the given string pieces verbatim. */
function sseResponse(chunks: string[], init: ResponseInit = {}) {
  const encoder = new TextEncoder()
  return new Response(
    new ReadableStream({
      start(controller) {
        for (const c of chunks) controller.enqueue(encoder.encode(c))
        controller.close()
      },
    }),
    { status: 200, ...init },
  )
}

const delta = (text: string) =>
  `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`

function mockFetch(res: Response) {
  const fn = vi.fn().mockResolvedValue(res)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => vi.unstubAllGlobals())

describe('streamChat', () => {
  it('concatenates deltas and reports them incrementally', async () => {
    mockFetch(sseResponse([delta('Hello'), delta(' '), delta('world'), 'data: [DONE]\n\n']))
    const seen: string[] = []
    const out = await streamChat('gpt-4o', [{ role: 'user', content: 'hi' }], {
      onDelta: t => seen.push(t),
    })
    expect(out.content).toBe('Hello world')
    expect(seen).toEqual(['Hello', ' ', 'world'])
  })

  it('reassembles a frame split across chunk boundaries', async () => {
    // The network can cut mid-JSON; a naive line reader drops this token.
    const frame = delta('split')
    mockFetch(sseResponse([frame.slice(0, 20), frame.slice(20), 'data: [DONE]\n\n']))
    const out = await streamChat('m', [{ role: 'user', content: 'x' }], { onDelta: () => {} })
    expect(out.content).toBe('split')
  })

  it('handles several frames arriving in one chunk', async () => {
    mockFetch(sseResponse([delta('a') + delta('b') + delta('c')]))
    const out = await streamChat('m', [{ role: 'user', content: 'x' }], { onDelta: () => {} })
    expect(out.content).toBe('abc')
  })

  it('captures the trailing usage frame', async () => {
    mockFetch(sseResponse([
      delta('hi'),
      `data: ${JSON.stringify({ choices: [], usage: { total_tokens: 42, prompt_tokens: 10 } })}\n\n`,
      'data: [DONE]\n\n',
    ]))
    const out = await streamChat('m', [{ role: 'user', content: 'x' }], { onDelta: () => {} })
    expect(out.usage?.total_tokens).toBe(42)
    expect(out.usage?.prompt_tokens).toBe(10)
  })

  it('ignores [DONE] and unparseable frames instead of failing', async () => {
    mockFetch(sseResponse([delta('ok'), 'data: {not json\n\n', ': comment\n\n', 'data: [DONE]\n\n']))
    const out = await streamChat('m', [{ role: 'user', content: 'x' }], { onDelta: () => {} })
    expect(out.content).toBe('ok')
  })

  it('measures time to first token separately from total duration', async () => {
    mockFetch(sseResponse([delta('x'), 'data: [DONE]\n\n']))
    const out = await streamChat('m', [{ role: 'user', content: 'x' }], { onDelta: () => {} })
    expect(out.ttft).toBeTypeOf('number')
    expect(out.ms).toBeGreaterThanOrEqual(0)
  })

  it('leaves ttft undefined when no content ever arrives', async () => {
    mockFetch(sseResponse(['data: [DONE]\n\n']))
    const out = await streamChat('m', [{ role: 'user', content: 'x' }], { onDelta: () => {} })
    expect(out.content).toBe('')
    expect(out.ttft).toBeUndefined()
  })

  it('surfaces the upstream message from a non-OK response', async () => {
    mockFetch(new Response(JSON.stringify({ error: { message: 'No service for model foo' } }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    }))
    await expect(
      streamChat('foo', [{ role: 'user', content: 'x' }], { onDelta: () => {} }),
    ).rejects.toThrow('No service for model foo')
  })

  it('supports a bare string error field', async () => {
    mockFetch(new Response(JSON.stringify({ error: 'Invalid or missing API key' }), { status: 401 }))
    await expect(
      streamChat('m', [{ role: 'user', content: 'x' }], { onDelta: () => {} }),
    ).rejects.toThrow('Invalid or missing API key')
  })

  it('throws on an error frame that arrives mid-stream after a 200', async () => {
    mockFetch(sseResponse([delta('partial'), `data: ${JSON.stringify({ error: { message: 'rate limited' } })}\n\n`]))
    await expect(
      streamChat('m', [{ role: 'user', content: 'x' }], { onDelta: () => {} }),
    ).rejects.toThrow('rate limited')
  })

  it('falls back to status text on an unparseable error body', async () => {
    mockFetch(new Response('', { status: 502, statusText: 'Bad Gateway' }))
    await expect(
      streamChat('m', [{ role: 'user', content: 'x' }], { onDelta: () => {} }),
    ).rejects.toThrow(/502/)
  })

  it('posts the model, message history and stream flag', async () => {
    const fn = mockFetch(sseResponse(['data: [DONE]\n\n']))
    await streamChat('claude-sonnet-4', [
      { role: 'user', content: 'first' },
      { role: 'assistant', content: 'reply' },
      { role: 'user', content: 'second' },
    ], { onDelta: () => {} })

    const [url, opts] = fn.mock.calls[0]
    expect(url).toBe('/v1/chat/completions')
    const body = JSON.parse(opts.body)
    expect(body.model).toBe('claude-sonnet-4')
    expect(body.stream).toBe(true)
    expect(body.messages).toHaveLength(3)
    expect(body.messages[2]).toEqual({ role: 'user', content: 'second' })
  })
})
