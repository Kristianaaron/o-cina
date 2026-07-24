import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import {
  fetchAgent, startAgent, stopAgent, restartAgent, deleteAgent,
  fetchAgentMetrics, fetchAgentLogs, clearSelected
} from '../../lib/store/agentsSlice'
import AgentChat from '../../components/AgentChat'
import AgentTerminal from '../../components/AgentTerminal'

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
  const [terminalView, setTerminalView] = useState(false) // toggle terminal overlay
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
    return <p className="text-zinc-500 text-sm font-mono">Loading agent...</p>
  }

  if (!agent) {
    return (
      <div className="text-center py-12">
        <p className="text-zinc-400 font-mono">Agent not found</p>
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
        <button onClick={() => navigate('/agents')} className="text-xs text-zinc-500 hover:text-zinc-300 font-mono mb-2">
          ← Back to agents
        </button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-mono text-2xl font-semibold">{agent.name}</h1>
            <div className="flex gap-2 mt-1 text-sm text-zinc-500 font-mono">
              <span>{agent.harness}</span>
              {agent.model && <span>· {agent.model}</span>}
              {agent.provider && <span>· {agent.provider}</span>}
            </div>
          </div>
          <StatusBadge status={agent.status} />
        </div>
      </div>

      {/* Controls */}
      <div className="flex gap-2">
        <button
          onClick={handleStart}
          disabled={!canStart || !!actionInProgress}
          className="px-3 py-1.5 text-sm bg-zinc-100 text-zinc-950 rounded font-mono disabled:opacity-30 hover:bg-white"
        >
          Start
        </button>
        <button
          onClick={handleStop}
          disabled={!canStop || !!actionInProgress}
          className="px-3 py-1.5 text-sm bg-zinc-800 text-zinc-200 rounded border border-zinc-700 font-mono disabled:opacity-30 hover:bg-zinc-700"
        >
          Stop
        </button>
        <button
          onClick={handleRestart}
          disabled={!canRestart || !!actionInProgress}
          className="px-3 py-1.5 text-sm bg-zinc-800 text-zinc-200 rounded border border-zinc-700 font-mono disabled:opacity-30 hover:bg-zinc-700"
        >
          Restart
        </button>
        <div className="flex-1" />
        <button
          onClick={handleDelete}
          className={`px-3 py-1.5 text-sm rounded border font-mono ${
            confirmDelete
              ? 'bg-red-900 text-red-200 border-red-700 hover:bg-red-800'
              : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-red-400 hover:border-red-900'
          }`}
        >
          {confirmDelete ? 'Click again to confirm' : 'Delete'}
        </button>
      </div>

      {actionInProgress && (
        <p className="text-yellow-400 text-xs font-mono animate-pulse">
          {actionInProgress}...
        </p>
      )}

      {/* Info grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <p className="text-zinc-500 text-xs font-mono mb-1">PID</p>
          <p className="font-mono text-zinc-200">{agent.pid || '—'}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <p className="text-zinc-500 text-xs font-mono mb-1">Process Group</p>
          <p className="font-mono text-zinc-200">{agent.pgid || '—'}</p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <p className="text-zinc-500 text-xs font-mono mb-1">Uptime</p>
          <p className="font-mono text-zinc-200">
            {agent.process_started_at
              ? Math.round((Date.now() / 1000 - agent.process_started_at) / 60) + 'm'
              : '—'}
          </p>
        </div>
        <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
          <p className="text-zinc-500 text-xs font-mono mb-1">Last Heartbeat</p>
          <p className="font-mono text-zinc-200">
            {agent.last_heartbeat
              ? Math.round((Date.now() / 1000 - agent.last_heartbeat)) + 's ago'
              : '—'}
          </p>
        </div>
      </div>

      {/* Skills */}
      {agent.skills?.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {agent.skills.map(s => (
            <span key={s} className="bg-zinc-800 px-2 py-0.5 rounded text-xs font-mono text-zinc-400">{s}</span>
          ))}
        </div>
      )}

      {/* Tabs — chat is primary, terminal is a toggle within chat */}
      <div className="flex gap-1 border-b border-zinc-800">
        {['chat', 'logs', 'config'].map(tab => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); if (tab !== 'chat') setTerminalView(false) }}
            className={`px-4 py-2 text-sm font-mono border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-zinc-200 text-zinc-100'
                : 'border-transparent text-zinc-500 hover:text-zinc-300'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content — both chat and terminal stay mounted, CSS toggles visibility */}
      {activeTab === 'chat' && (
        <div className="relative" style={{ minHeight: '400px' }}>
          <div className={terminalView ? 'hidden' : ''}>
            <AgentChat
              agentId={agent.id}
              agentName={agent.name}
              externalMessages={sharedMessages}
              onMessagesChange={setSharedMessages}
              externalSessionId={sharedSessionId}
              onSessionIdChange={setSharedSessionId}
              onToggleTerminal={() => setTerminalView(true)}
            />
          </div>
          <div className={terminalView ? '' : 'hidden'}>
            <AgentTerminal
              agentId={agent.id}
              agentName={agent.name}
              externalMessages={sharedMessages}
              onMessagesChange={setSharedMessages}
              onExitTerminal={() => setTerminalView(false)}
            />
          </div>
        </div>
      )}

      {activeTab === 'logs' && (
        <div
          ref={logsRef}
          className="bg-zinc-950 border border-zinc-800 rounded p-4 h-96 overflow-y-auto font-mono text-xs text-zinc-300 whitespace-pre-wrap"
        >
          {logs || 'No logs available.'}
        </div>
      )}

      {activeTab === 'config' && (
        <div className="bg-zinc-950 border border-zinc-800 rounded p-4 overflow-auto font-mono text-xs text-zinc-300">
          <pre>{JSON.stringify(agent.config || {}, null, 2)}</pre>
        </div>
      )}

      {/* Metrics (if running) */}
      {metrics?.running && (
        <div className="bg-zinc-900 border border-zinc-800 rounded p-4 space-y-2">
          <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-wider">Live Metrics</h3>
          <div className="grid grid-cols-3 gap-4 text-sm font-mono">
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
