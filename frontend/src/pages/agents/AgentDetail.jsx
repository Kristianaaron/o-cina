import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import {
  fetchAgent, startAgent, stopAgent, restartAgent, deleteAgent,
  fetchAgentMetrics, fetchAgentLogs,
} from '../../lib/store/agentsSlice'
import AgentChat from '../../components/AgentChat'
import AgentTerminal from '../../components/AgentTerminal'
import {
  agentAvatarUrl,
  formatUptime,
  isAgentLive,
  shortLabel,
} from '../../lib/agentField'

const STATUS_COLORS = {
  registered: 'bg-zinc-700 text-zinc-300',
  starting: 'bg-yellow-900/50 text-yellow-300',
  running: 'bg-emerald-900/50 text-emerald-300',
  stopping: 'bg-yellow-900/50 text-yellow-300',
  stopped: 'bg-zinc-700 text-zinc-400',
  error: 'bg-red-900/50 text-red-300',
  offline: 'bg-zinc-800 text-zinc-500',
}

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono ${STATUS_COLORS[status] || STATUS_COLORS.registered}`}>
      <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
        status === 'running' ? 'bg-emerald-400 animate-pulse' :
        status === 'starting' || status === 'stopping' ? 'bg-yellow-400 animate-pulse' :
        status === 'error' ? 'bg-red-400' :
        'bg-zinc-500'
      }`} />
      {status}
    </span>
  )
}

export default function AgentDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const dispatch = useDispatch()

  const agent = useSelector(state => {
    const sel = state.agents.selected
    if (sel && sel.id === id) return sel
    const found = state.agents.list.find(a => a.id === id)
    return found || null
  })
  const metrics = useSelector(state => state.agents.metrics)
  const logs = useSelector(state => state.agents.logs)
  const loading = useSelector(state => state.agents.loading)
  const actionInProgress = useSelector(state => state.agents.actionInProgress)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [activeTab, setActiveTab] = useState('chat') // 'chat' | 'logs' | 'config'
  const [viewMode, setViewMode] = useState('gui') // 'gui' (chat) | 'tui' (terminal)
  const logsRef = useRef(null)

  // Shared message state between Chat and Terminal
  const [sharedMessages, setSharedMessages] = useState([])
  const [sharedSessionId, setSharedSessionId] = useState(null)

  // Fetch agent on mount
  useEffect(() => {
    dispatch(fetchAgent(id))
  }, [id, dispatch])

  // Poll metrics while running
  useEffect(() => {
    if (agent?.status === 'running') {
      const interval = setInterval(() => {
        dispatch(fetchAgentMetrics(id))
      }, 3000)
      return () => clearInterval(interval)
    }
  }, [agent?.status, id, dispatch])

  // Poll logs periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (agent?.status === 'running' || agent?.status === 'starting') {
        dispatch(fetchAgentLogs(id))
      }
    }, 2000)
    return () => clearInterval(interval)
  }, [agent?.status, id, dispatch])

  // Fetch logs when agent loaded
  useEffect(() => {
    if (agent) {
      dispatch(fetchAgentLogs(id))
    }
  }, [agent?.id])

  // Scroll logs to bottom
  useEffect(() => {
    if (logsRef.current) {
      logsRef.current.scrollTop = logsRef.current.scrollHeight
    }
  }, [logs])

  const handleStart = () => {
    dispatch(startAgent(id))
    dispatch(fetchAgent(id))
  }

  const handleStop = () => {
    dispatch(stopAgent(id))
    dispatch(fetchAgent(id))
  }

  const handleRestart = () => {
    dispatch(restartAgent(id))
    dispatch(fetchAgent(id))
  }

  const handleDelete = () => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      setTimeout(() => setConfirmDelete(false), 3000)
      return
    }
    dispatch(deleteAgent(id))
    navigate('/agents')
  }

  const canStart = agent?.status && ['registered', 'stopped', 'error', 'offline'].includes(agent.status)
  const canStop = agent?.status && ['running', 'starting', 'error'].includes(agent.status)
  const canRestart = agent?.status && ['running', 'stopped', 'error'].includes(agent.status)

  if (loading && !agent) {
    return <p className="text-zinc-500 text-sm font-mono font-normal">Loading agent...</p>
  }

  if (!agent) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-400 text-sm font-mono font-normal">Agent not found</p>
        <button onClick={() => navigate('/agents')} className="mt-4 text-sm text-zinc-500 hover:text-zinc-300 underline">
          ← Back to agents
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => navigate('/agents')}
          className="mb-3 font-mono text-xs text-zinc-500 hover:text-zinc-300"
        >
          ← Back to agents
        </button>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <img
              src={agentAvatarUrl(agent)}
              alt=""
              className="node-bit-avatar h-12 w-12 shrink-0 rounded-full bg-[#121218] object-contain object-center p-1.5 ring-1 ring-white/10"
              style={isAgentLive(agent.status) ? { boxShadow: '0 0 16px rgba(255, 255, 255, 0.22)' } : undefined}
              draggable={false}
            />
            <div className="min-w-0">
              <h1 className="font-mono text-2xl font-semibold tracking-wide">
                {shortLabel(agent.name)}
              </h1>
              <p className="mt-0.5 truncate font-mono text-sm text-zinc-500" title={agent.name}>
                {agent.name}
                {agent.harness ? ` · ${agent.harness}` : ''}
                {agent.model ? ` · ${agent.model}` : ''}
              </p>
            </div>
          </div>
          <StatusBadge status={agent.status} />
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleStart}
          disabled={!canStart || !!actionInProgress}
          className="rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-1.5 font-mono text-[11px] font-medium text-zinc-950 transition-colors hover:bg-white disabled:opacity-30"
        >
          Start
        </button>
        <button
          type="button"
          onClick={handleStop}
          disabled={!canStop || !!actionInProgress}
          className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 px-3 py-1.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-30"
        >
          Stop
        </button>
        <button
          type="button"
          onClick={handleRestart}
          disabled={!canRestart || !!actionInProgress}
          className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 px-3 py-1.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-30"
        >
          Restart
        </button>
        <div className="flex-1" />
        <Link
          to={`/?view=herd&agent=${agent.id}`}
          className="rounded-lg border border-zinc-700/60 bg-zinc-950/60 px-3 py-1.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
        >
          Open in panes
        </Link>
        <button
          type="button"
          onClick={handleDelete}
          className={`rounded-lg border px-3 py-1.5 font-mono text-[11px] transition-colors ${
            confirmDelete
              ? 'border-red-700 bg-red-900 text-red-200 hover:bg-red-800'
              : 'border-zinc-800 bg-zinc-900 text-zinc-500 hover:border-red-900 hover:text-red-400'
          }`}
        >
          {confirmDelete ? 'Click again to confirm' : 'Delete'}
        </button>
      </div>

      {actionInProgress && (
        <p className="animate-pulse font-mono text-sm text-yellow-400">
          {actionInProgress}...
        </p>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-zinc-600">PID</p>
          <p className="font-mono text-sm text-zinc-200">{agent.pid || '—'}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-zinc-600">Process group</p>
          <p className="font-mono text-sm text-zinc-200">{agent.pgid || '—'}</p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-zinc-600">Uptime</p>
          <p className="font-mono text-sm text-zinc-200">
            {formatUptime(agent.process_started_at)}
          </p>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 p-3">
          <p className="mb-1 font-mono text-[10px] uppercase tracking-wider text-zinc-600">Last heartbeat</p>
          <p className="font-mono text-sm text-zinc-200">
            {agent.last_heartbeat
              ? `${Math.round((Date.now() / 1000 - agent.last_heartbeat))}s ago`
              : '—'}
          </p>
        </div>
      </div>

      {/* Skills */}
      {agent.skills?.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {agent.skills.map((s) => (
            <span key={s} className="rounded-full bg-zinc-800 px-2 py-0.5 font-mono text-xs text-zinc-400">
              {s}
            </span>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-zinc-800">
        {['chat', 'logs', 'config'].map((tab) => (
          <button
            key={tab}
            type="button"
            onClick={() => setActiveTab(tab)}
            className={`border-b-2 px-4 py-2 font-mono text-sm transition-colors ${
              activeTab === tab
                ? 'border-zinc-200 text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Chat / TUI — GUI is progressive chat; TUI is raw terminal */}
      {activeTab === 'chat' && (
        <div className="overflow-hidden rounded-xl border border-zinc-800">
          <div className="flex items-center justify-between gap-3 border-b border-zinc-800 bg-zinc-900/80 px-3 py-2">
            <div className="min-w-0 font-mono text-[11px] text-zinc-500">
              {viewMode === 'gui' ? (
                <>
                  <span className="text-zinc-400">Chat with </span>
                  <span className="text-zinc-200">{agent.name}</span>
                </>
              ) : (
                <>
                  <span className="text-zinc-400">Terminal · </span>
                  <span className="text-zinc-200">{agent.name}</span>
                </>
              )}
            </div>
            <div
              className="inline-flex shrink-0 rounded-lg border border-zinc-700/60 bg-zinc-950/80 p-0.5"
              role="group"
              aria-label="View mode"
            >
              <button
                type="button"
                onClick={() => setViewMode('tui')}
                className={`rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  viewMode === 'tui'
                    ? 'bg-zinc-100 font-medium text-zinc-950'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="Terminal — less chrome, raw shell"
              >
                TUI
              </button>
              <button
                type="button"
                onClick={() => setViewMode('gui')}
                className={`rounded-md px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors ${
                  viewMode === 'gui'
                    ? 'bg-zinc-100 font-medium text-zinc-950'
                    : 'text-zinc-500 hover:text-zinc-300'
                }`}
                title="Chat — more progressive disclosure"
              >
                GUI
              </button>
            </div>
          </div>

          <div className="relative min-h-[400px]">
            <div className={viewMode === 'gui' ? '' : 'hidden'}>
              <AgentChat
                agentId={agent.id}
                agentName={agent.name}
                externalMessages={sharedMessages}
                onMessagesChange={setSharedMessages}
                externalSessionId={sharedSessionId}
                onSessionIdChange={setSharedSessionId}
                hideHeader
              />
            </div>
            <div className={viewMode === 'tui' ? '' : 'hidden'}>
              <AgentTerminal
                agentId={agent.id}
                agentName={agent.name}
                chrome={false}
              />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div
          ref={logsRef}
          className="h-96 overflow-y-auto whitespace-pre-wrap rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-300"
        >
          {logs || 'No logs available.'}
        </div>
      )}

      {activeTab === 'config' && (
        <div className="overflow-auto rounded-xl border border-zinc-800 bg-zinc-950 p-4 font-mono text-xs text-zinc-300">
          <pre>{JSON.stringify(agent.config || {}, null, 2)}</pre>
        </div>
      )}

      {/* Metrics (if running) */}
      {metrics?.running && (
        <div className="space-y-2 rounded-xl border border-zinc-800 bg-zinc-900/70 p-4">
          <h3 className="font-mono text-xs uppercase tracking-wider text-zinc-500">Live metrics</h3>
          <div className="grid grid-cols-3 gap-4 font-mono text-sm">
            <div>
              <span className="text-zinc-500">PID: </span>
              <span className="text-zinc-200">{metrics.metrics?.pid}</span>
            </div>
            <div>
              <span className="text-zinc-500">Alive: </span>
              <span className={metrics.metrics?.alive ? 'text-emerald-400' : 'text-red-400'}>
                {metrics.metrics?.alive ? 'yes' : 'no'}
              </span>
            </div>
            <div>
              <span className="text-zinc-500">Uptime: </span>
              <span className="text-zinc-200">
                {Math.round(metrics.metrics?.uptime || 0)}s
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
