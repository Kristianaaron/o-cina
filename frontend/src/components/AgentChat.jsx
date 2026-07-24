import { useState, useRef, useEffect } from 'react'

const API_BASE = import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8002`

export default function AgentChat({
  agentId,
  agentName,
  externalMessages,
  onMessagesChange,
  externalSessionId,
  onSessionIdChange,
  onToggleTerminal,
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
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
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
    switch (status) {
      case 'pending':
        return <span className="text-yellow-400 animate-pulse text-xs">● queued</span>
      case 'processing':
        return <span className="text-yellow-400 animate-pulse text-xs">● processing</span>
      case 'completed':
        return null
      case 'error':
        return <span className="text-red-400 text-xs">● failed</span>
      default:
        return null
    }
  }

  return (
    <div className="flex flex-col h-96">
      {/* Chat header */}
      <div className="flex items-center px-3 py-1 bg-zinc-900 border-t border-zinc-800 text-xs font-mono">
        <span className="text-zinc-400">chat with</span>
        <span className="text-zinc-200 ml-1">{agentName || agentId?.slice(0, 8)}</span>
        {sessionId && (
          <>
            <span className="text-zinc-600 mx-1">|</span>
            <span className="text-zinc-500" title={sessionId}>session active</span>
          </>
        )}
        <div className="flex-1" />
        {/* Terminal toggle */}
        {onToggleTerminal && (
          <button
            onClick={onToggleTerminal}
            className="text-zinc-500 hover:text-zinc-300 underline text-xs mr-2"
            title="Switch to terminal (TUI) view"
          >
            [TUI]
          </button>
        )}
        {messages.length > 0 && (
          <button onClick={clearChat} className="text-zinc-500 hover:text-zinc-300 underline text-xs">
            clear
          </button>
        )}
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-zinc-950">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-zinc-500 text-sm font-mono text-center">
              Type a message below to prompt {agentName || 'this agent'}
            </p>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-80% px-3 py-2 rounded text-sm font-mono whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-zinc-200 text-zinc-900'
                  : 'bg-zinc-900 border border-zinc-800 text-zinc-200'
              }`}
            >
              {msg.role === 'assistant' && !msg.text && msg.status !== 'completed' && (
                <div className="flex items-center gap-1.5">
                  <span className="animate-pulse">●</span>
                  <span className="text-zinc-500 italic">Waiting for response...</span>
                </div>
              )}
              {msg.text && (
                <>
                  <p className="text-xs text-zinc-500 mb-1">
                    {msg.role === 'user' ? 'You' : agentName}
                    {statusIndicator(msg.status)}
                  </p>
                  <p>{msg.text}</p>
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Error bar */}
      {error && (
        <div className="px-3 py-1 bg-red-900/30 text-red-300 text-xs font-mono flex items-center">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Input area */}
      <div className="p-2 bg-zinc-900 border-b border-zinc-800">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message to the agent..."
            rows={2}
            disabled={sending}
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-1.5 text-sm font-mono text-zinc-200 placeholder-zinc-600 resize-none disabled:opacity-50 focus:border-zinc-600"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className="px-3 py-1.5 bg-zinc-100 text-zinc-950 rounded font-mono text-sm disabled:opacity-30 hover:bg-white self-end"
          >
            {sending ? '···' : 'Send'}
          </button>
        </div>
        <p className="text-xs text-zinc-600 font-mono mt-1">Enter to send · Shift+Enter for newline · [TUI] for terminal view</p>
      </div>
    </div>
  )
}
