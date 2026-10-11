import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import {
  getProject, listSessions, createSession, deleteSession,
  listMessages, addMessage,
  listMemories, createMemory, deleteMemory, searchMemories, memoryCount,
} from '../../api/projects'
import { IconAdd, IconClose, IconProjects } from '../../components/icons'
import { plural, timeAgo } from '../../lib/format'
import {
  Button,
  EmptyState,
  Eyebrow,
  IconButton,
  Notice,
  PageHeader,
  Segmented,
  Stat,
  Surface,
  Tag,
  cx,
  inputClass,
} from '../../components/ui'

const TABS = [
  { value: 'overview', label: 'Overview' },
  { value: 'sessions', label: 'Sessions' },
  { value: 'memory', label: 'Memory' },
  { value: 'search', label: 'Search' },
]

const SOURCES = ['user', 'agent', 'system', 'workflow']

// ── Overview ────────────────────────────────────────────────────────────────

function OverviewTab({ project }) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Sessions" value={project.session_count || 0} />
        <Stat label="Memories" value={project.memory_count || 0} />
        <Stat label="Created" value={timeAgo(project.created_at)} />
      </div>
      {project.tags?.length > 0 && (
        <div>
          <Eyebrow className="mb-2">Tags</Eyebrow>
          <div className="flex flex-wrap gap-1">
            {project.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sessions ────────────────────────────────────────────────────────────────

function SessionsTab({ projectId }) {
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [newSessionName, setNewSessionName] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState(null)

  const fetchSessions = async () => {
    try {
      const data = await listSessions(projectId)
      setSessions(data.sessions || [])
    } catch (e) {
      setError(e.message)
    }
  }

  const loadMessages = async (sessionId) => {
    try {
      const data = await listMessages(sessionId)
      setMessages(data.messages || [])
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => { fetchSessions() }, [projectId])

  const handleCreateSession = async (e) => {
    e.preventDefault()
    const summary = newSessionName.trim()
    if (!summary) return
    try {
      await createSession({ project_id: projectId, summary })
      setNewSessionName('')
      setCreating(false)
      fetchSessions()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDeleteSession = async (id) => {
    if (!confirm('Delete this session?')) return
    try {
      await deleteSession(id)
      if (activeSession?.id === id) {
        setActiveSession(null)
        setMessages([])
      }
      fetchSessions()
    } catch (e) {
      setError(e.message)
    }
  }

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!activeSession || !newMessage.trim()) return
    try {
      await addMessage(activeSession.id, { content: newMessage.trim() })
      setNewMessage('')
      loadMessages(activeSession.id)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-4">
      {error && <Notice onDismiss={() => setError(null)}>{error}</Notice>}
      <Surface className="flex h-[min(68vh,40rem)] min-h-[24rem] overflow-hidden">
        <div className="flex w-64 shrink-0 flex-col border-r border-white/[0.05]">
          <div className="flex h-11 items-center justify-between px-3">
            <Eyebrow>Sessions</Eyebrow>
            <IconButton label="New session" size="sm" onClick={() => setCreating(true)}>
              <IconAdd className="h-3.5 w-3.5" />
            </IconButton>
          </div>
          {creating && (
            <form onSubmit={handleCreateSession} className="px-2 pb-2">
              <input
                autoFocus
                value={newSessionName}
                onChange={(e) => setNewSessionName(e.target.value)}
                onBlur={() => !newSessionName && setCreating(false)}
                onKeyDown={(e) => e.key === 'Escape' && setCreating(false)}
                placeholder="Session name ↵"
                className={`${inputClass} h-8 py-0 text-xs`}
              />
            </form>
          )}
          <div className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-2">
            {sessions.length === 0 && !creating && (
              <p className="px-2 py-4 text-center font-mono text-[11px] text-zinc-600">No sessions yet</p>
            )}
            {sessions.map((s) => (
              <div
                key={s.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  setActiveSession(s)
                  loadMessages(s.id)
                }}
                className={cx(
                  'group flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 transition-colors',
                  activeSession?.id === s.id ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]',
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[13px] text-zinc-200">{s.summary || 'Untitled'}</div>
                  <div className="mt-0.5 font-mono text-[10px] text-zinc-600">{plural(s.message_count || 0, 'message')}</div>
                </div>
                <IconButton
                  label="Delete session"
                  size="sm"
                  className="opacity-0 hover:!text-red-300 group-hover:opacity-100"
                  onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id) }}
                >
                  <IconClose className="h-3 w-3" />
                </IconButton>
              </div>
            ))}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          {activeSession ? (
            <>
              <div className="flex h-11 items-center border-b border-white/[0.05] px-4 font-mono text-[12px] text-zinc-200">
                {activeSession.summary || 'Untitled'}
              </div>
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
                {messages.length === 0 ? (
                  <p className="mt-8 text-center font-mono text-[11px] text-zinc-600">No messages yet</p>
                ) : (
                  messages.map((m) => (
                    <div key={m.id} className={cx('flex', m.from_agent ? 'justify-start' : 'justify-end')}>
                      <div className={cx(
                        'max-w-[75%] rounded-xl px-3.5 py-2.5 text-[13px] leading-relaxed',
                        m.from_agent ? 'bg-white/[0.03] text-zinc-300 ring-1 ring-inset ring-white/[0.05]' : 'bg-white/[0.07] text-zinc-100',
                      )}>
                        {m.agent_name && <div className="mb-1 font-mono text-[10px] text-zinc-500">{m.agent_name}</div>}
                        <div className="whitespace-pre-wrap">{m.payload?.content || JSON.stringify(m.payload)}</div>
                        <div className="mt-1 font-mono text-[10px] text-zinc-600">
                          {new Date(m.timestamp * 1000).toLocaleTimeString()}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <form onSubmit={handleSendMessage} className="flex gap-2 border-t border-white/[0.05] p-3">
                <input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Add a message…"
                  className={`${inputClass} h-8 py-0`}
                />
                <Button type="submit" variant="primary" disabled={!newMessage.trim()}>Send</Button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center font-mono text-[12px] text-zinc-600">
              Select or create a session
            </div>
          )}
        </div>
      </Surface>
    </div>
  )
}

// ── Memory ──────────────────────────────────────────────────────────────────

function MemoryTab({ projectId }) {
  const [memories, setMemories] = useState([])
  const [count, setCount] = useState(0)
  const [newMemory, setNewMemory] = useState('')
  const [newTags, setNewTags] = useState('')
  const [source, setSource] = useState('user')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  const fetchMemories = async () => {
    try {
      setLoading(true)
      const [memData, countData] = await Promise.all([
        listMemories(projectId, { limit: 100 }),
        memoryCount(projectId),
      ])
      setMemories(memData.memories || [])
      setCount(countData.count || 0)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { fetchMemories() }, [projectId])

  const handleAddMemory = async (e) => {
    e.preventDefault()
    if (!newMemory.trim()) return
    try {
      const tags = newTags.split(',').map((t) => t.trim()).filter(Boolean)
      await createMemory(projectId, { content: newMemory.trim(), source, tags })
      setNewMemory('')
      setNewTags('')
      fetchMemories()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this memory?')) return
    try {
      await deleteMemory(projectId, id)
      fetchMemories()
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-5">
      <p className="font-mono text-[11px] text-zinc-500">
        {count} {count === 1 ? 'memory' : 'memories'} · semantically indexed
      </p>

      <Surface as="form" onSubmit={handleAddMemory} className="space-y-3 p-3">
        <textarea
          value={newMemory}
          onChange={(e) => setNewMemory(e.target.value)}
          placeholder="Store a note, fact or piece of context…"
          rows={2}
          className={`${inputClass} resize-y`}
        />
        <div className="flex flex-wrap gap-2">
          <input
            value={newTags}
            onChange={(e) => setNewTags(e.target.value)}
            placeholder="Tags, comma-separated"
            className={`${inputClass} h-8 min-w-[10rem] flex-1 py-0 text-xs`}
          />
          <Segmented
            size="sm"
            value={source}
            onChange={setSource}
            label="Memory source"
            options={SOURCES.map((s) => ({ value: s, label: s }))}
          />
          <Button type="submit" variant="primary" disabled={loading || !newMemory.trim()}>Store</Button>
        </div>
      </Surface>

      {error && <Notice onDismiss={() => setError(null)}>{error}</Notice>}

      {loading && memories.length === 0 ? (
        <p className="font-mono text-xs text-zinc-500">Loading memories…</p>
      ) : memories.length === 0 ? (
        <p className="py-10 text-center font-mono text-[12px] text-zinc-600">No memories stored yet.</p>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => (
            <Surface key={m.id} className="group p-4">
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-zinc-300">{m.content}</p>
              <div className="mt-3 flex items-center gap-2 font-mono text-[10px] text-zinc-600">
                <Tag>{m.source}</Tag>
                {m.tags?.map((tag) => <span key={tag}>#{tag}</span>)}
                <span className="ml-auto">{timeAgo(parseFloat(m.metadata?.created_at || m.created_at))}</span>
                <IconButton
                  label="Delete memory"
                  size="sm"
                  className="opacity-0 hover:!text-red-300 group-hover:opacity-100"
                  onClick={() => handleDelete(m.id)}
                >
                  <IconClose className="h-3 w-3" />
                </IconButton>
              </div>
            </Surface>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Search ──────────────────────────────────────────────────────────────────

function SearchTab({ projectId }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState('')
  const [error, setError] = useState(null)
  const [topK, setTopK] = useState(5)
  const [source, setSource] = useState('')

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    try {
      setError(null)
      const data = await searchMemories(projectId, query.trim(), topK, source || undefined)
      setResults(data.results || [])
      setSearched(query.trim())
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={handleSearch} className="space-y-3">
        <div className="flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search memories by meaning…"
            className={`${inputClass} h-10 py-0`}
          />
          <Button type="submit" variant="primary" className="!h-10">Search</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-zinc-500">
          <label className="flex items-center gap-2">
            top k
            <input
              type="number"
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value, 10) || 5)}
              min={1}
              max={20}
              className={`${inputClass} h-7 w-14 px-2 py-0 text-center text-xs`}
            />
          </label>
          <Segmented
            size="sm"
            value={source}
            onChange={setSource}
            label="Source filter"
            options={[{ value: '', label: 'all' }, ...SOURCES.map((s) => ({ value: s, label: s }))]}
          />
        </div>
      </form>

      {error && <Notice onDismiss={() => setError(null)}>{error}</Notice>}

      {searched && (
        <div className="space-y-2">
          <Eyebrow>{plural(results.length, 'result')} for “{searched}”</Eyebrow>
          {results.length === 0 ? (
            <p className="font-mono text-[12px] text-zinc-600">No matching memories.</p>
          ) : (
            results.map((r, i) => (
              <Surface key={r.id || i} className="p-4">
                <div className="mb-2 flex items-center gap-3 font-mono text-[10px] text-zinc-500">
                  <span className="relative h-1 w-16 overflow-hidden rounded-full bg-white/[0.06]">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-zinc-200" style={{ width: `${Math.max(0, Math.min(1, r.score)) * 100}%` }} />
                  </span>
                  <span>{(r.score * 100).toFixed(1)}%</span>
                  <span className="text-zinc-600">{r.metadata?.source || 'unknown'}</span>
                </div>
                <p className="text-[13px] leading-relaxed text-zinc-300">{r.content}</p>
              </Surface>
            ))
          )}
        </div>
      )}
    </div>
  )
}

// ── Page ────────────────────────────────────────────────────────────────────

export default function ProjectDetail() {
  const { id } = useParams()
  const [project, setProject] = useState(null)
  const [tab, setTab] = useState('overview')
  const [error, setError] = useState(null)

  useEffect(() => {
    getProject(id)
      .then((data) => { setProject(data); setError(null) })
      .catch((e) => setError(e.message))
  }, [id])

  if (error) {
    return (
      <EmptyState
        icon={IconProjects}
        title="Couldn’t load project"
        body={error}
        action={<Button to="/projects">Back to projects</Button>}
      />
    )
  }

  if (!project) {
    return <p className="font-mono text-sm text-zinc-500">Loading project…</p>
  }

  return (
    <div>
      <PageHeader
        back={{ to: '/projects', label: 'Projects' }}
        title={project.name}
        subtitle={project.description || 'No description'}
      />
      <div className="mb-6">
        <Segmented value={tab} onChange={setTab} options={TABS} label="Project sections" />
      </div>
      {tab === 'overview' && <OverviewTab project={project} />}
      {tab === 'sessions' && <SessionsTab projectId={id} />}
      {tab === 'memory' && <MemoryTab projectId={id} />}
      {tab === 'search' && <SearchTab projectId={id} />}
    </div>
  )
}
