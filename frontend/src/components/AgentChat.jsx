import { useState, useRef, useEffect } from 'react'

// Same-origin by default (Vite proxies /api → backend). Override with VITE_API_URL if needed.
const API_BASE = import.meta.env.VITE_API_URL || ''

export default function AgentChat({
  agentId,
  agentName,
  projectId = null,
  externalMessages,
  onMessagesChange,
  externalSessionId,
  onSessionIdChange,
  onToggleTerminal,
  hideHeader = false,
}) {
  // Use external (shared) state if provided, otherwise internal
  const [internalMessages, setInternalMessages] = useState([])
  const [internalSessionId, setInternalSessionId] = useState(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  const messages = externalMessages ?? internalMessages
  const setMessages = onMessagesChange ?? setInternalMessages
  const sessionId = externalSessionId ?? internalSessionId
  const setSessionId = onSessionIdChange ?? setInternalSessionId

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.parentElement?.scrollTo({ top: 1e9, behavior: 'smooth' })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  async function sendMessage() {
    const text = input.trim()
    if (!text || sending) return

    setSending(true)
    setError(null)

    // Optimistically add user message
    const userMsg = { role: 'user', text, timestamp: Date.now() }
    setMessages(prev => [...prev, userMsg])
    setInput('')

    try {
      const res = await fetch(`${API_BASE}/api/v1/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: agentId,
          prompt: text,
          session_id: sessionId,
          ...(projectId ? { project_id: projectId } : {}),
        }),
      })

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `HTTP ${res.status}`)
      }

      const data = await res.json()
      setSessionId(data.session_id)

      // Add pending assistant message
      const assistantMsg = {
        role: 'assistant',
        text: '',
        taskId: data.task_id,
        status: 'pending',
        timestamp: Date.now(),
      }
      setMessages(prev => [...prev, assistantMsg])

      // Poll for response
      pollResponse(data.task_id)
    } catch (err) {
      setError(err.message)
      setSending(false)
    }
  }

  async function pollResponse(taskId) {
    let attempts = 0
    const maxAttempts = 60 // 2 minutes max

    const poll = async () => {
      attempts++
      try {
        const res = await fetch(`${API_BASE}/api/v1/tasks/${taskId}`)
        if (!res.ok) throw new Error('Task fetch failed')

        const task = await res.json()

        if (task.status === 'completed') {
          // Get the response message
          const msgRes = await fetch(`${API_BASE}/api/v1/tasks/${taskId}/messages?role=assistant`)
          if (msgRes.ok) {
            const msgs = await msgRes.json()
            const reply = Array.isArray(msgs) ? msgs[0] : msgs
            const responseText = reply?.payload?.text || reply?.payload?.response || '(no response)'

            setMessages(prev =>
              prev.map(m =>
                m.taskId === taskId
                  ? { ...m, text: responseText, status: 'completed' }
                  : m
              )
            )
          } else {
            setMessages(prev =>
              prev.map(m =>
                m.taskId === taskId
                  ? { ...m, text: '(response received but could not load)', status: 'completed' }
                  : m
              )
            )
          }
          setSending(false)
          return
        }

        if (task.status === 'failed' || task.status === 'error') {
          const errMsg = task.error || task.context?.error || 'Task failed'
          setMessages(prev =>
            prev.map(m =>
              m.taskId === taskId
                ? { ...m, text: `Error: ${errMsg}`, status: 'error' }
                : m
            )
          )
          setError(errMsg)
          setSending(false)
          return
        }

        // Still pending — update status indicator
        setMessages(prev =>
          prev.map(m =>
            m.taskId === taskId
              ? { ...m, status: 'processing' }
              : m
          )
        )

        if (attempts < maxAttempts) {
          setTimeout(poll, 2000)
        } else {
          setMessages(prev =>
            prev.map(m =>
              m.taskId === taskId
                ? { ...m, text: 'Timed out waiting for response', status: 'error' }
                : m
            )
          )
          setError('Response timed out after 2 minutes')
          setSending(false)
        }
      } catch (err) {
        setMessages(prev =>
          prev.map(m =>
            m.taskId === taskId
              ? { ...m, text: `Error: ${err.message}`, status: 'error' }
              : m
          )
        )
        setError(err.message)
        setSending(false)
      }
    }

    setTimeout(poll, 1000)
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  function clearChat() {
    setMessages([])
    setSessionId(null)
    setError(null)
  }

  const statusIndicator = (status) => {
    if (status === 'pending') return <span className="ml-2 animate-pulse text-zinc-500">queued</span>
    if (status === 'processing') return <span className="ml-2 animate-pulse text-zinc-500">thinking…</span>
    if (status === 'error') return <span className="ml-2 text-red-400">failed</span>
    return null
  }

  return (
    <div className="flex h-full min-h-[24rem] flex-col">
      {!hideHeader && (
        <div className="flex h-9 items-center gap-2 border-b border-white/[0.05] px-3 font-mono text-[11px]">
          <span className="text-zinc-500">chat with</span>
          <span className="text-zinc-200">{agentName || agentId?.slice(0, 8)}</span>
          {sessionId && <span className="text-zinc-600" title={sessionId}>· session active</span>}
          <div className="flex-1" />
          {onToggleTerminal && (
            <button type="button" onClick={onToggleTerminal} className="text-zinc-500 hover:text-zinc-200">
              terminal
            </button>
          )}
          {messages.length > 0 && (
            <button type="button" onClick={clearChat} className="text-zinc-500 hover:text-zinc-200">clear</button>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-5">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-center font-mono text-[12px] text-zinc-600">
              Prompt {agentName || 'this agent'} to start a session
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          msg.role === 'user' ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-xl bg-white/[0.05] px-3.5 py-2.5 text-[13px] leading-relaxed text-zinc-100 ring-1 ring-inset ring-white/[0.06]">
              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>
          ) : (
            <div key={i} className="max-w-[92%]">
              <p className="mb-1.5 font-mono text-[11px] text-zinc-400">
                {agentName}
                {statusIndicator(msg.status)}
              </p>
              {msg.text ? (
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-200">{msg.text}</p>
              ) : (
                <div className="flex items-center gap-1.5 py-1">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:120ms]" />
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:240ms]" />
                </div>
              )}
            </div>
          )
        ))}
        <div ref={messagesEndRef} />
      </div>

      {error && (
        <div className="flex items-center gap-2 border-t border-red-500/20 bg-red-500/[0.06] px-4 py-1.5 font-mono text-[11px] text-red-300">
          <span className="min-w-0 flex-1 truncate">{error}</span>
          <button type="button" onClick={() => setError(null)} className="text-red-300/70 hover:text-red-200">dismiss</button>
        </div>
      )}

      <div className="border-t border-white/[0.05] p-3">
        <div className="flex items-end gap-2 rounded-xl bg-white/[0.03] py-1.5 pl-3 pr-1.5 ring-1 ring-inset ring-white/[0.08] focus-within:ring-white/20">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${agentName || 'agent'}…`}
            rows={1}
            disabled={sending}
            className="max-h-32 min-h-[1.75rem] min-w-0 flex-1 resize-none bg-transparent py-1 text-[13px] text-zinc-100 placeholder:text-zinc-600 focus:outline-none disabled:opacity-50"
          />
          <button
            type="button"
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="flex h-7 shrink-0 items-center rounded-lg bg-zinc-100 px-3 font-mono text-[11px] font-medium text-zinc-950 transition-colors hover:bg-white disabled:opacity-30"
          >
            {sending ? '···' : 'Send'}
          </button>
        </div>
        <div className="mt-1.5 flex items-center px-1 font-mono text-[10px] text-zinc-600">
          <span>↵ send · ⇧↵ newline</span>
          <div className="flex-1" />
          {hideHeader && messages.length > 0 && (
            <button type="button" onClick={clearChat} className="hover:text-zinc-300">clear</button>
          )}
        </div>
      </div>
    </div>
  )
}
