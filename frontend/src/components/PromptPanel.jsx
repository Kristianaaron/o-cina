import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IconArrowUp,
  IconChevronDown,
} from './icons'
import {
  agentAvatarUrl,
  isDemoAgent,
  mergeFieldAgents,
  shortLabel,
} from '../lib/agentField'

const API_BASE = import.meta.env.VITE_API_URL || ''

/**
 * Nav prompt — coding-harness GUI chat (Cursor-style transcript).
 * Blurred backdrop; linear turns + bottom composer. Esc / talk / ✕ exits.
 */
export default function PromptPanel({ open, onClose }) {
  const [agents, setAgents] = useState([])
  const [agentId, setAgentId] = useState('')
  const [projects, setProjects] = useState([])
  const [projectId, setProjectId] = useState('')
  const [text, setText] = useState('')
  const [messages, setMessages] = useState([])
  const [sessionId, setSessionId] = useState(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [projectMenuOpen, setProjectMenuOpen] = useState(false)
  const [lastMemoryCount, setLastMemoryCount] = useState(0)
  const inputRef = useRef(null)
  const rootRef = useRef(null)
  const messagesEndRef = useRef(null)
  const pollAbortRef = useRef(0)

  useEffect(() => {
    if (!open) {
      setMenuOpen(false)
      setProjectMenuOpen(false)
      return
    }
    let cancelled = false
    Promise.all([
      fetch(`${API_BASE}/api/v1/agents`).then((r) => r.json()),
      fetch(`${API_BASE}/api/v1/projects`).then((r) => r.json()).catch(() => ({ projects: [] })),
    ])
      .then(([agentData, projectData]) => {
        if (cancelled) return
        const list = mergeFieldAgents(agentData.agents || [])
        setAgents(list)
        setAgentId((cur) => {
          if (cur && list.some((a) => a.id === cur)) return cur
          const preferred =
            list.find((a) => !isDemoAgent(a) && (a.status === 'running' || a.status === 'starting'))
            || list.find((a) => !isDemoAgent(a))
            || list[0]
          return preferred?.id || ''
        })
        const projs = projectData.projects || []
        setProjects(projs)
        setProjectId((cur) => {
          if (cur && projs.some((p) => p.id === cur)) return cur
          return projs[0]?.id || ''
        })
      })
      .catch(() => {
        if (!cancelled) setAgents(mergeFieldAgents([]))
      })
    return () => {
      cancelled = true
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const t = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(t)
  }, [open, agentId])

  useEffect(() => {
    if (!open) return
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, open])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (menuOpen || projectMenuOpen) {
          setMenuOpen(false)
          setProjectMenuOpen(false)
        } else onClose()
      }
    }
    const onPointerDown = (e) => {
      if (!rootRef.current?.contains(e.target)) {
        setMenuOpen(false)
        setProjectMenuOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointerDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointerDown)
    }
  }, [open, onClose, menuOpen, projectMenuOpen])

  useEffect(() => {
    if (!open) return
    setSessionId(null)
    setError(null)
    setLastMemoryCount(0)
  }, [agentId, projectId, open])

  const selected = useMemo(
    () => agents.find((a) => a.id === agentId) || null,
    [agents, agentId],
  )
  const selectedProject = useMemo(
    () => projects.find((p) => p.id === projectId) || null,
    [projects, projectId],
  )
  const agentLabel = selected
    ? shortLabel(selected.name)
    : agents.length
      ? 'Agent'
      : 'No agents'
  const demo = selected ? isDemoAgent(selected) : false
  const canSend = Boolean(agentId && !demo && text.trim() && !sending)

  async function sendMessage() {
    const line = text.trim()
    if (!line || !agentId || demo || sending) return

    setSending(true)
    setError(null)
    setMessages((prev) => [...prev, { role: 'user', text: line, timestamp: Date.now() }])
    setText('')

    try {
      const body = {
        agent_id: agentId,
        prompt: line,
        session_id: sessionId,
      }
      if (projectId) body.project_id = projectId

      const res = await fetch(`${API_BASE}/api/v1/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}))
        throw new Error(errData.detail || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setSessionId(data.session_id)
      setLastMemoryCount(data.memory_count || 0)
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          text: '',
          taskId: data.task_id,
          status: 'pending',
          timestamp: Date.now(),
          memoryCount: data.memory_count || 0,
        },
      ])
      pollResponse(data.task_id)
    } catch (e) {
      setError(e.message || 'Could not send prompt')
      setSending(false)
    }
  }

  async function pollResponse(taskId) {
    const token = ++pollAbortRef.current
    let attempts = 0
    const maxAttempts = 60

    const poll = async () => {
      if (token !== pollAbortRef.current) return
      attempts += 1
      try {
        const res = await fetch(`${API_BASE}/api/v1/tasks/${taskId}`)
        if (!res.ok) throw new Error('Task fetch failed')
        const task = await res.json()

        if (task.status === 'completed') {
          const msgRes = await fetch(`${API_BASE}/api/v1/tasks/${taskId}/messages?role=assistant`)
          let responseText = '(no response)'
          if (msgRes.ok) {
            const msgs = await msgRes.json()
            const reply = Array.isArray(msgs) ? msgs[0] : msgs
            responseText = reply?.payload?.text || reply?.payload?.response || responseText
          }
          setMessages((prev) =>
            prev.map((m) =>
              m.taskId === taskId
                ? { ...m, text: responseText, status: 'completed' }
                : m,
            ),
          )
          setSending(false)
          return
        }

        if (task.status === 'failed' || task.status === 'error') {
          const errMsg = task.error || task.context?.error || 'Task failed'
          setMessages((prev) =>
            prev.map((m) =>
              m.taskId === taskId
                ? { ...m, text: `Error: ${errMsg}`, status: 'error' }
                : m,
            ),
          )
          setError(errMsg)
          setSending(false)
          return
        }

        setMessages((prev) =>
          prev.map((m) =>
            m.taskId === taskId ? { ...m, status: 'processing' } : m,
          ),
        )

        if (attempts < maxAttempts) setTimeout(poll, 2000)
        else {
          setMessages((prev) =>
            prev.map((m) =>
              m.taskId === taskId
                ? { ...m, text: 'Timed out waiting for response', status: 'error' }
                : m,
            ),
          )
          setError('Response timed out')
          setSending(false)
        }
      } catch (err) {
        setMessages((prev) =>
          prev.map((m) =>
            m.taskId === taskId
              ? { ...m, text: `Error: ${err.message}`, status: 'error' }
              : m,
          ),
        )
        setError(err.message)
        setSending(false)
      }
    }

    setTimeout(poll, 1000)
  }

  function handleClose() {
    pollAbortRef.current += 1
    setSending(false)
    onClose()
  }

  if (!open) return null

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[45] border-0 bg-zinc-950/60 backdrop-blur-md"
        aria-label="Close prompt"
        onClick={handleClose}
      />

      {/* Transcript column */}
      <div className="pointer-events-none fixed inset-0 z-[48] flex flex-col">
        <div className="pointer-events-auto mx-auto flex w-full max-w-xl flex-1 flex-col overflow-y-auto px-4 pb-36 pt-10 sm:px-6 sm:pt-14">
          {messages.length === 0 ? (
            <button
              type="button"
              onClick={handleClose}
              className="flex flex-1 flex-col items-center justify-center border-0 bg-transparent pb-8 text-center"
            >
              <p className="font-mono text-sm text-zinc-300/90">
                {selected
                  ? `Ask ${selected.name}`
                  : 'Select an agent to chat'}
              </p>
              <p className="mt-1.5 max-w-xs font-mono text-[11px] text-zinc-500">
                Shared project memory · Esc or talk icon to exit
              </p>
            </button>
          ) : (
            <div className="flex flex-col gap-6 py-2">
              {messages.map((msg, i) => (
                <Turn
                  key={`${msg.timestamp}-${i}`}
                  msg={msg}
                  agent={selected}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
      </div>

      {/* Composer — original prompt bar */}
      <div
        ref={rootRef}
        className="fixed inset-x-0 bottom-0 z-[48] flex justify-center px-3 pb-[5.25rem] sm:px-4 sm:pb-[5.5rem]"
        role="dialog"
        aria-label="Prompt chat"
      >
        <div className="w-full max-w-xl">
          <div className="relative flex min-h-10 items-end gap-1.5 rounded-2xl border border-zinc-700/70 bg-[#141416]/95 py-1 pl-3 pr-1 shadow-[0_12px_36px_rgba(0,0,0,0.5)] backdrop-blur-xl">
            <textarea
              ref={inputRef}
              rows={1}
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                if (error) setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  sendMessage()
                }
              }}
              placeholder={
                demo
                  ? 'Preview agent — register a real one to chat'
                  : selected
                    ? `Message ${selected.name}…`
                    : 'Select an agent…'
              }
              disabled={!agentId || demo}
              className="max-h-28 min-h-[2rem] min-w-0 flex-1 resize-none bg-transparent py-1.5 text-[13px] leading-snug text-zinc-100 placeholder:text-zinc-500 focus:outline-none disabled:opacity-50"
              autoComplete="off"
            />

            <div className="mb-0.5 flex shrink-0 items-center gap-1">
              <AgentPicker
                agents={agents}
                agentId={agentId}
                agentLabel={agentLabel}
                menuOpen={menuOpen}
                setMenuOpen={(v) => {
                  setMenuOpen(v)
                  if (v) setProjectMenuOpen(false)
                }}
                onSelect={(id) => {
                  setAgentId(id)
                  setMenuOpen(false)
                  setError(null)
                }}
              />

              <button
                type="button"
                onClick={sendMessage}
                disabled={!canSend}
                title="Send"
                aria-label="Send"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-950 transition-opacity hover:bg-white disabled:opacity-40"
              >
                <IconArrowUp className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={handleClose}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
                aria-label="Close prompt"
                title="Close (Esc)"
              >
                <CloseGlyph />
              </button>
            </div>
          </div>

          <div className="mt-1.5 flex items-center gap-2 px-2.5">
            <ProjectPicker
              projects={projects}
              projectId={projectId}
              selected={selectedProject}
              menuOpen={projectMenuOpen}
              setMenuOpen={(v) => {
                setProjectMenuOpen(v)
                if (v) setMenuOpen(false)
              }}
              onSelect={(id) => {
                setProjectId(id)
                setProjectMenuOpen(false)
                setError(null)
              }}
            />
            <span className="font-mono text-[11px] text-zinc-500">
              {lastMemoryCount > 0
                ? `Memory · ${lastMemoryCount} recalled`
                : selectedProject
                  ? 'Memory bank linked'
                  : 'No project memory'}
            </span>
            <div className="flex-1" />
            {messages.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setMessages([])
                  setSessionId(null)
                  setError(null)
                  setLastMemoryCount(0)
                }}
                className="font-mono text-[10px] text-zinc-500 underline hover:text-zinc-300"
              >
                clear
              </button>
            )}
            {error && (
              <span className="max-w-[40%] truncate font-mono text-[10px] text-rose-400/90">
                {error}
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/** Single turn — linear transcript (user prompt block + agent response). */
function Turn({ msg, agent }) {
  if (msg.role === 'user') {
    return (
      <div className="ml-auto w-full max-w-[92%]">
        <div className="rounded-xl border border-zinc-700/50 bg-zinc-900/70 px-3.5 py-2.5 text-[14px] leading-relaxed text-zinc-100 shadow-sm backdrop-blur-md">
          <p className="whitespace-pre-wrap">{msg.text}</p>
        </div>
      </div>
    )
  }

  const thinking = msg.status === 'pending' || msg.status === 'processing'
  const failed = msg.status === 'error'

  return (
    <div className="w-full">
      <div className="mb-2 flex items-center gap-2">
        {agent && (
          <img
            src={agentAvatarUrl(agent)}
            alt=""
            className="node-bit-avatar h-5 w-5 rounded-full bg-[#121218] object-contain p-0.5 ring-1 ring-white/10"
            draggable={false}
          />
        )}
        <span className="text-[12px] font-medium text-zinc-300">
          {agent?.name || 'Agent'}
        </span>
        {thinking && (
          <span className="animate-pulse text-[11px] text-zinc-500">Thinking…</span>
        )}
        {failed && (
          <span className="text-[11px] text-rose-400">Failed</span>
        )}
        {msg.memoryCount > 0 && (
          <span className="rounded bg-zinc-800/80 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500">
            {msg.memoryCount} mem
          </span>
        )}
      </div>

      <div className="pl-7 text-[14px] leading-relaxed text-zinc-200">
        {thinking && !msg.text ? (
          <div className="flex items-center gap-1.5 text-zinc-500">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400" />
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:120ms]" />
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-400 [animation-delay:240ms]" />
          </div>
        ) : (
          <MessageBody text={msg.text} />
        )}
      </div>
    </div>
  )
}

/** Lightweight markdown-ish body — paragraphs + fenced code (harness default). */
function MessageBody({ text }) {
  const blocks = useMemo(() => splitCodeFences(text || ''), [text])

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        if (block.type === 'code') {
          return (
            <pre
              key={i}
              className="overflow-x-auto rounded-lg border border-zinc-800 bg-zinc-950/90 p-3 font-mono text-[12px] leading-relaxed text-zinc-300"
            >
              {block.lang && (
                <div className="mb-2 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                  {block.lang}
                </div>
              )}
              <code className="whitespace-pre">{block.content}</code>
            </pre>
          )
        }
        return (
          <p key={i} className="whitespace-pre-wrap">
            {block.content}
          </p>
        )
      })}
    </div>
  )
}

function splitCodeFences(raw) {
  const parts = []
  const re = /```([\w-]*)\n?([\s\S]*?)```/g
  let last = 0
  let m
  while ((m = re.exec(raw)) !== null) {
    if (m.index > last) {
      const prose = raw.slice(last, m.index).trim()
      if (prose) parts.push({ type: 'prose', content: prose })
    }
    parts.push({ type: 'code', lang: m[1] || '', content: m[2].replace(/\n$/, '') })
    last = m.index + m[0].length
  }
  const tail = raw.slice(last).trim()
  if (tail) parts.push({ type: 'prose', content: tail })
  if (parts.length === 0 && raw) parts.push({ type: 'prose', content: raw })
  return parts
}

function AgentPicker({ agents, agentId, agentLabel, menuOpen, setMenuOpen, onSelect }) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-0.5 rounded-full px-1 py-0.5 text-zinc-300 transition-colors hover:bg-zinc-800/70"
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-label="Select agent"
      >
        <span className="max-w-[5.5rem] truncate text-[12px] font-medium sm:max-w-[7rem]">
          {agentLabel}
        </span>
        <IconChevronDown className="h-3 w-3 text-zinc-500" />
      </button>

      {menuOpen && (
        <ul
          role="listbox"
          className="absolute bottom-[calc(100%+0.4rem)] right-0 z-10 max-h-48 min-w-[12rem] overflow-y-auto rounded-xl border border-zinc-700/80 bg-zinc-950 py-1 shadow-2xl"
        >
          {agents.length === 0 && (
            <li className="px-2.5 py-1.5 font-mono text-[11px] text-zinc-500">No agents</li>
          )}
          {agents.map((a) => {
            const active = a.id === agentId
            const preview = isDemoAgent(a)
            return (
              <li key={a.id} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => onSelect(a.id)}
                  className={[
                    'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] transition-colors',
                    active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-900',
                  ].join(' ')}
                >
                  <span className="min-w-0 flex-1 truncate font-medium">{a.name}</span>
                  <span className="shrink-0 font-mono text-[9px] uppercase text-zinc-500">
                    {preview ? 'preview' : a.harness || 'agent'}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function ProjectPicker({ projects, projectId, selected, menuOpen, setMenuOpen, onSelect }) {
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setMenuOpen((v) => !v)}
        className="flex items-center gap-0.5 rounded-full px-1 py-0.5 text-zinc-400 transition-colors hover:bg-zinc-800/70 hover:text-zinc-200"
        aria-haspopup="listbox"
        aria-expanded={menuOpen}
        aria-label="Select project memory bank"
        title="Shared project memory bank"
      >
        <span className="max-w-[7rem] truncate text-[11px] font-medium sm:max-w-[9rem]">
          {selected?.name || (projects.length ? 'Project' : 'No project')}
        </span>
        <IconChevronDown className="h-3 w-3 text-zinc-500" />
      </button>

      {menuOpen && (
        <ul
          role="listbox"
          className="absolute bottom-[calc(100%+0.4rem)] left-0 z-10 max-h-48 min-w-[12rem] overflow-y-auto rounded-xl border border-zinc-700/80 bg-zinc-950 py-1 shadow-2xl"
        >
          <li role="option" aria-selected={!projectId}>
            <button
              type="button"
              onClick={() => onSelect('')}
              className={[
                'flex w-full px-2.5 py-1.5 text-left text-[12px] transition-colors',
                !projectId ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-400 hover:bg-zinc-900',
              ].join(' ')}
            >
              No memory bank
            </button>
          </li>
          {projects.map((p) => {
            const active = p.id === projectId
            return (
              <li key={p.id} role="option" aria-selected={active}>
                <button
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className={[
                    'flex w-full px-2.5 py-1.5 text-left text-[12px] transition-colors',
                    active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-300 hover:bg-zinc-900',
                  ].join(' ')}
                >
                  <span className="truncate">{p.name}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function CloseGlyph() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  )
}
