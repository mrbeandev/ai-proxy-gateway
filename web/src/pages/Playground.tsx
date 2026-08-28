/**
 * Playground — a single throwaway conversation for smoke-testing services.
 *
 * Deliberately stateless: no persistence, no conversation list, no branching.
 * "Clear" wipes it and you start fresh. The value here is answering "does this
 * service/model actually work?" in one keystroke, so failures are surfaced
 * verbatim rather than as a generic toast.
 */
import { useState, useRef, useEffect, useCallback } from 'react'
import { Send, Trash2, Square, AlertCircle, CornerDownLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { api } from '@/lib/api'
import { streamChat, type ChatMessage } from '@/lib/chat'
import { cn, formatNumber, providerLabel } from '@/lib/utils'
import { ProviderLogo } from '@/components/ProviderLogo'

interface Turn extends ChatMessage {
  id: string
  /** Populated on assistant turns once the stream completes. */
  meta?: { ms: number; ttft?: number; tokens?: number }
  error?: boolean
}

const STORAGE_KEY = 'playground:model'

export default function Playground() {
  const [models, setModels] = useState<{ id: string; owned_by: string }[]>([])
  const [model, setModel] = useState<string>('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [loadErr, setLoadErr] = useState('')

  const abortRef = useRef<AbortController | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // Load the model list from /v1/models — the same catalogue an API client sees.
  useEffect(() => {
    let cancelled = false
    api.getV1Models()
      .then(list => {
        if (cancelled) return
        setModels(list)
        const remembered = localStorage.getItem(STORAGE_KEY)
        setModel(remembered && list.some(m => m.id === remembered) ? remembered : list[0]?.id ?? '')
      })
      .catch(e => !cancelled && setLoadErr(e instanceof Error ? e.message : 'Failed to load models'))
    return () => { cancelled = true }
  }, [])

  // Pin to the bottom as tokens stream in.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [turns])

  const pickModel = useCallback((id: string) => {
    setModel(id)
    localStorage.setItem(STORAGE_KEY, id)
  }, [])

  const stop = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setBusy(false)
  }, [])

  const send = useCallback(async () => {
    const prompt = input.trim()
    if (!prompt || !model || busy) return

    const userTurn: Turn = { id: crypto.randomUUID(), role: 'user', content: prompt }
    const replyId = crypto.randomUUID()

    // Send the full history so multi-turn context works, then append the
    // placeholder the stream will fill in.
    const history: ChatMessage[] = [...turns, userTurn]
      .filter(t => !t.error)
      .map(({ role, content }) => ({ role, content }))

    setTurns(t => [...t, userTurn, { id: replyId, role: 'assistant', content: '' }])
    setInput('')
    setBusy(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const result = await streamChat(model, history, {
        signal: ctrl.signal,
        onDelta: text =>
          setTurns(t => t.map(x => (x.id === replyId ? { ...x, content: x.content + text } : x))),
      })
      setTurns(t => t.map(x => x.id === replyId
        ? { ...x, content: result.content, meta: { ms: result.ms, ttft: result.ttft, tokens: result.usage?.total_tokens } }
        : x))
    } catch (e) {
      const aborted = e instanceof DOMException && e.name === 'AbortError'
      setTurns(t => t.flatMap(x => {
        if (x.id !== replyId) return [x]
        // A cancelled stream keeps whatever text already arrived; a genuine
        // failure becomes an error turn showing the upstream message.
        if (aborted) return x.content ? [x] : []
        return [{ ...x, content: e instanceof Error ? e.message : 'Request failed', error: true }]
      }))
    } finally {
      abortRef.current = null
      setBusy(false)
      inputRef.current?.focus()
    }
  }, [input, model, busy, turns])

  const clear = useCallback(() => {
    stop()
    setTurns([])
    setInput('')
    inputRef.current?.focus()
  }, [stop])

  // Group the select by provider so 56 models stay navigable.
  const grouped = models.reduce<Record<string, { id: string; owned_by: string }[]>>((acc, m) => {
    (acc[m.owned_by] ??= []).push(m)
    return acc
  }, {})

  return (
    <div className="mx-auto flex h-[calc(100vh-7rem)] w-full max-w-3xl flex-col gap-3">
      {/* Model bar */}
      <div className="flex items-center gap-2">
        <Select value={model} onValueChange={v => pickModel(v ?? '')}>
          <SelectTrigger className="h-9 flex-1 font-mono text-xs" aria-label="Model">
            <SelectValue placeholder={loadErr ? 'Failed to load models' : 'Select a model'} />
          </SelectTrigger>
          <SelectContent className="max-h-80">
            {Object.entries(grouped).map(([provider, list]) => (
              <SelectGroup key={provider}>
                <SelectLabel className="flex items-center gap-1.5">
                  <ProviderLogo provider={provider} className="h-3 w-3" />
                  {providerLabel(provider)}
                </SelectLabel>
                {list.map(m => (
                  <SelectItem key={m.id} value={m.id} className="font-mono text-xs">{m.id}</SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost" size="sm" onClick={clear}
          disabled={!turns.length && !input}
          className="h-9 shrink-0 text-muted-foreground"
        >
          <Trash2 size={14} /> Clear
        </Button>
      </div>

      {/* Transcript */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain rounded-xl bg-card p-4">
        {turns.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1.5 text-center">
            <p className="text-sm font-medium">Test a model</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              {loadErr
                ? loadErr
                : models.length === 0
                  ? 'No models yet — add a service first.'
                  : 'Send a prompt to check that routing, keys and streaming all work. Nothing is saved.'}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {turns.map(t => (
              <div key={t.id} className={cn('flex flex-col gap-1', t.role === 'user' && 'items-end')}>
                <div
                  className={cn(
                    'max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap break-words',
                    t.role === 'user' && 'bg-secondary',
                    t.role === 'assistant' && !t.error && 'bg-muted/60',
                    t.error && 'bg-destructive/10 text-destructive',
                  )}
                >
                  {t.error && <AlertCircle size={13} className="mr-1.5 inline-block align-[-2px]" />}
                  {t.content || (
                    <span className="inline-flex gap-1 py-1" aria-label="Waiting for response">
                      {[0, 1, 2].map(i => (
                        <span
                          key={i}
                          className="h-1.5 w-1.5 animate-pulse rounded-full bg-muted-foreground"
                          style={{ animationDelay: `${i * 160}ms` }}
                        />
                      ))}
                    </span>
                  )}
                </div>
                {t.meta && (
                  <span className="px-1 text-[10px] tabular-nums text-muted-foreground">
                    {(t.meta.ms / 1000).toFixed(2)}s
                    {t.meta.ttft !== undefined && ` · ${Math.round(t.meta.ttft)}ms to first token`}
                    {t.meta.tokens ? ` · ${formatNumber(t.meta.tokens)} tokens` : ''}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="flex items-end gap-2">
        <Textarea
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
          }}
          placeholder={model ? 'Send a message…  (Enter to send, Shift+Enter for newline)' : 'Add a service to get started'}
          disabled={!model}
          rows={1}
          className="max-h-40 min-h-9"
          aria-label="Prompt"
        />
        {busy ? (
          <Button size="sm" variant="outline" onClick={stop} className="h-9 shrink-0">
            <Square size={12} className="fill-current" /> Stop
          </Button>
        ) : (
          <Button size="sm" onClick={send} disabled={!input.trim() || !model} className="h-9 shrink-0">
            <Send size={14} /> Send
          </Button>
        )}
      </div>
      <p className="-mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
        <CornerDownLeft size={10} /> Requests route through your gateway and appear in Logs.
      </p>
    </div>
  )
}
