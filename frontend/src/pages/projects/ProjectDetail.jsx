import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getProject, listSessions, getSession, createSession, deleteSession,
  listMessages, addMessage,
  listMemories, createMemory, deleteMemory, searchMemories, memoryCount,
} from '../../api/projects'

const TABS = ['Overview', 'Sessions', 'Memory', 'Search']

function TimeAgo({ ts }) {
  if (!ts) return <span>-</span>
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return <span>just now</span>
  if (diff < 3600) return <span>{Math.floor(diff / 60)}m ago</span>
  if (diff < 86400) return <span>{Math.floor(diff / 3600)}h ago</span>
  return <span>{Math.floor(diff / 86400)}d ago</span>
}

// ── Overview Tab ─────────────────────────────────────────────────────────────

function OverviewTab({ project }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-mono text-xl font-semibold">{project.name}</h2>
        {project.description && (
          <p className="text-zinc-500 mt-2 text-sm">{project.description}</p>
        )}
      </div>
      <div className="grid grid-cols-3 gap-4">
        <Stat label="Sessions" value={project.session_count || 0} />
        <Stat label="Memories" value={project.memory_count || 0} />
        <Stat label="Created" value={<TimeAgo ts={project.created_at} />} />
      </div>
      {project.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {project.tags.map((tag, i) => (
            <span key={i} className="text-xs px-2.5 py-1 rounded bg-zinc-800 text-zinc-400 font-mono">
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="bg-zinc-900/50 border border-zinc-800 rounded p-4">
      <div className="text-2xl font-mono font-semibold">{value}</div>
      <div className="text-xs text-zinc-500 mt-1 font-mono">{label}</div>
    </div>
  )
}

// ── Sessions Tab ─────────────────────────────────────────────────────────────

function SessionsTab({ projectId, project }) {
  const [sessions, setSessions] = useState([])
  const [activeSession, setActiveSession] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(false)
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

  const handleCreateSession = async () => {
    const summary = prompt('Session name:')
    if (!summary) return
    try {
      setLoading(true)
      await createSession({ project_id: projectId, summary })
      fetchSessions()
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
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
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="flex min-h-[400px] gap-4 h-[calc(100dvh-8rem)]">
      {/* Session list */}
      <div className="w-72 flex-shrink-0 flex flex-col border border-zinc-800 rounded overflow-hidden">
        <div className="p-3 border-b border-zinc-800 flex items-center justify-between">
          <span className="font-mono text-sm font-medium">Sessions</span>
          <button
            onClick={handleCreateSession}
            disabled={loading}
            className="text-xs bg-zinc-800 hover:bg-zinc-700 px-2 py-1 rounded transition-colors"
          >
            + New
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="p-4 text-zinc-600 text-sm text-center">No sessions yet</div>
          ) : (
            sessions.map((s) => (
              <div
                key={s.id}
                className={`p-3 border-b border-zinc-800/50 cursor-pointer transition-colors group ${
                  activeSession?.id === s.id ? 'bg-zinc-800/50' : 'hover:bg-zinc-900/50'
                }`}
                onClick={() => {
                  setActiveSession(s)
                  loadMessages(s.id)
                }}
              >
                <div className="text-sm font-medium truncate">{s.summary || 'Untitled'}</div>
                <div className="text-xs text-zinc-600 mt-1 flex items-center gap-2">
                  <span>{s.message_count} msgs</span>
                  <span className="ml-auto">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteSession(s.id) }}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-400"
                    >
                      ×
                    </button>
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 flex flex-col border border-zinc-800 rounded overflow-hidden">
        {activeSession ? (
          <>
            <div className="p-3 border-b border-zinc-800 font-mono text-sm">
              {activeSession.summary || 'Untitled'}
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {messages.length === 0 ? (
                <div className="text-zinc-600 text-sm text-center mt-8">No messages yet</div>
              ) : (
                messages.map((m) => (
                  <div key={m.id} className={`flex ${m.from_agent ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[70%] rounded-lg px-3 py-2 text-sm ${
                      m.from_agent
                        ? 'bg-zinc-800 text-zinc-300'
                        : 'bg-zinc-100 text-zinc-900'
                    }`}>
                      {m.agent_name && (
                        <div className="text-xs font-mono text-zinc-500 mb-1">{m.agent_name}</div>
                      )}
                      <div>{m.payload?.content || JSON.stringify(m.payload)}</div>
                      <div className="text-xs text-zinc-500 mt-1">
                        {new Date(m.timestamp * 1000).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <form onSubmit={handleSendMessage} className="p-3 border-t border-zinc-800 flex gap-2">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-700"
              />
              <button
                type="submit"
                className="bg-zinc-100 text-zinc-950 px-4 py-2 text-sm font-medium rounded hover:bg-white transition-colors"
              >
                Send
              </button>
            </form>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-zinc-600">
            <div className="text-center">
              <p className="font-mono">Select or create a session</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Memory Tab ───────────────────────────────────────────────────────────────

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
      const tags = newTags.split(',').map(t => t.trim()).filter(Boolean)
      await createMemory(projectId, {
        content: newMemory.trim(),
        source,
        tags,
      })
      setNewMemory('')
      setNewTags('')
      fetchMemories()
    } catch (e) {
      setError(e.message)
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

  const sourceBadge = (src) => {
    const colors = {
      user: 'bg-blue-500/20 text-blue-400',
      agent: 'bg-purple-500/20 text-purple-400',
      system: 'bg-amber-500/20 text-amber-400',
      workflow: 'bg-emerald-500/20 text-emerald-400',
    }
    return (
      <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${colors[src] || 'bg-zinc-800 text-zinc-400'}`}>
        {src}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-mono text-lg font-semibold">Memory Bank</h2>
          <p className="text-zinc-500 text-sm">
            {count} stored memory{count !== 1 ? 'ies' : 'y'} — semantically indexed
          </p>
        </div>
      </div>

      {/* Add memory form */}
      <form onSubmit={handleAddMemory} className="space-y-3 bg-zinc-900/30 border border-zinc-800 rounded p-4">
        <textarea
          value={newMemory}
          onChange={(e) => setNewMemory(e.target.value)}
          placeholder="Add a note, fact, or context to store..."
          rows={2}
          className="w-full bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-700 placeholder:text-zinc-600"
        />
        <div className="flex gap-3">
          <input
            type="text"
            value={newTags}
            onChange={(e) => setNewTags(e.target.value)}
            placeholder="Tags (comma-separated)"
            className="flex-1 bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-700 placeholder:text-zinc-600"
          />
          <select
            value={source}
            onChange={(e) => setSource(e.target.value)}
            className="bg-zinc-950 border border-zinc-800 rounded px-3 py-2 text-sm focus:outline-none focus:border-zinc-700"
          >
            <option value="user">User</option>
            <option value="agent">Agent</option>
            <option value="system">System</option>
            <option value="workflow">Workflow</option>
          </select>
          <button
            type="submit"
            disabled={loading || !newMemory.trim()}
            className="bg-zinc-100 text-zinc-950 px-4 py-2 text-sm font-medium rounded hover:bg-white transition-colors disabled:opacity-50"
          >
            Store
          </button>
        </div>
      </form>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 text-sm rounded">
          {error}
        </div>
      )}

      {/* Memory list */}
      {loading ? (
        <div className="text-zinc-500 font-mono text-sm">Loading memories...</div>
      ) : memories.length === 0 ? (
        <div className="text-center py-8 text-zinc-600">
          <p className="font-mono">No memories stored yet.</p>
          <p className="text-sm mt-1">Add a note above to get started.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => (
            <div
              key={m.id}
              className="bg-zinc-900/50 border border-zinc-800 rounded p-4 group hover:border-zinc-700 transition-colors"
            >
              <p className="text-sm text-zinc-300 whitespace-pre-wrap">{m.content}</p>
              <div className="flex items-center gap-2 mt-3 text-xs text-zinc-600">
                {sourceBadge(m.source)}
                {m.tags?.map((tag, i) => (
                  <span key={i} className="text-zinc-600 font-mono">#{tag}</span>
                ))}
                <span className="ml-auto font-mono">
                  <TimeAgo ts={parseFloat(m.metadata?.created_at || m.created_at)} />
                </span>
                <button
                  onClick={() => handleDelete(m.id)}
                  className="opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Search Tab ────────────────────────────────────────────────────────────────

function SearchTab({ projectId }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState(null)
  const [topK, setTopK] = useState(5)
  const [source, setSource] = useState(null)

  const handleSearch = async (e) => {
    e.preventDefault()
    if (!query.trim()) return
    try {
      setError(null)
      const data = await searchMemories(projectId, query.trim(), topK, source || undefined)
      setResults(data.results || [])
      setSearched(true)
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-mono text-lg font-semibold">Semantic Search</h2>
        <p className="text-zinc-500 text-sm">
          Search memories by meaning, not just keywords
        </p>
      </div>

      <form onSubmit={handleSearch} className="space-y-3">
        <div className="flex gap-3">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What are you looking for?"
            className="flex-1 bg-zinc-900 border border-zinc-800 rounded px-4 py-3 text-sm focus:outline-none focus:border-zinc-700 placeholder:text-zinc-600"
          />
          <button
            type="submit"
            className="bg-zinc-100 text-zinc-950 px-6 py-3 text-sm font-medium rounded hover:bg-white transition-colors"
          >
            Search
          </button>
        </div>
        <div className="flex gap-4 text-xs text-zinc-500">
          <label className="flex items-center gap-1.5">
            Top K:
            <input
              type="number"
              value={topK}
              onChange={(e) => setTopK(parseInt(e.target.value) || 5)}
              min={1}
              max={20}
              className="w-12 bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-center"
            />
          </label>
          <label className="flex items-center gap-1.5">
            Source:
            <select
              value={source || ''}
              onChange={(e) => setSource(e.target.value || null)}
              className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1"
            >
              <option value="">All</option>
              <option value="user">User</option>
              <option value="agent">Agent</option>
              <option value="system">System</option>
              <option value="workflow">Workflow</option>
            </select>
          </label>
        </div>
      </form>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 text-red-400 px-4 py-3 text-sm rounded">
          {error}
        </div>
      )}

      {searched && (
        <div>
          <div className="text-xs text-zinc-500 font-mono mb-3">
            {results.length} result{results.length !== 1 ? 's' : ''} for "{query}"
          </div>
          {results.length === 0 ? (
            <div className="text-zinc-600 text-sm">No matching memories found.</div>
          ) : (
            <div className="space-y-3">
              {results.map((r, i) => (
                <div
                  key={r.id || i}
                  className="bg-zinc-900/50 border border-zinc-800 rounded p-4 hover:border-zinc-700 transition-colors"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-mono text-zinc-600">
                      Score: {(r.score * 100).toFixed(1)}%
                    </span>
                    <span className="text-xs font-mono text-zinc-700">|</span>
                    <span className="text-xs font-mono text-zinc-500">
                      {r.metadata?.source || 'unknown'}
                    </span>
                  </div>
                  <p className="text-sm text-zinc-300">{r.content}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function ProjectDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [tab, setTab] = useState('Overview')
  const [error, setError] = useState(null)

  const fetchProject = async () => {
    try {
      const data = await getProject(id)
      setProject(data)
      setError(null)
    } catch (e) {
      setError(e.message)
    }
  }

  useEffect(() => { fetchProject() }, [id])

  if (error) {
    return (
      <div className="text-center py-16">
        <p className="text-red-400 font-mono">{error}</p>
        <button
          onClick={() => navigate('/projects')}
          className="mt-4 text-sm text-zinc-500 hover:text-zinc-300"
        >
          ← Back to Projects
        </button>
      </div>
    )
  }

  if (!project) {
    return <div className="text-zinc-500 font-mono text-sm">Loading...</div>
  }

  return (
    <div className="space-y-6">
      {/* Back link + Title */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate('/projects')}
          className="text-zinc-500 hover:text-zinc-300 text-sm"
        >
          ← Projects
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-zinc-800">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              tab === t
                ? 'border-white text-zinc-200'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'Overview' && <OverviewTab project={project} />}
      {tab === 'Sessions' && <SessionsTab projectId={id} project={project} />}
      {tab === 'Memory' && <MemoryTab projectId={id} />}
      {tab === 'Search' && <SearchTab projectId={id} />}
    </div>
  )
}
