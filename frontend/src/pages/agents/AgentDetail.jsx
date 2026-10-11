import { useEffect, useState, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
import {
  Avatar,
  Button,
  EmptyState,
  PageHeader,
  Segmented,
  Stat,
  StatusPill,
  Surface,
  Tag,
} from '../../components/ui'
import { IconAgents, IconPanes, IconPlay, IconRestart, IconStop } from '../../components/icons'

const TABS = [
  { value: 'chat', label: 'Chat' },
  { value: 'terminal', label: 'Terminal' },
  { value: 'logs', label: 'Logs' },
  { value: 'config', label: 'Config' },
]

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
  const [activeTab, setActiveTab] = useState('chat') // 'chat' | 'terminal' | 'logs' | 'config'
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
    return <p className="font-mono text-sm text-zinc-500">Loading agent…</p>
  }

  if (!agent) {
    return (
      <EmptyState
        icon={IconAgents}
        title="Agent not found"
        body="It may have been deleted, or the backend is unreachable."
        action={<Button to="/agents">Back to agents</Button>}
      />
    )
  }

  const live = isAgentLive(agent.status)

  return (
    <div>
      <PageHeader
        back={{ to: '/agents', label: 'Agents' }}
        leading={<Avatar src={agentAvatarUrl(agent)} live={live} size="lg" />}
        title={shortLabel(agent.name)}
        subtitle={[agent.name, agent.harness, agent.model].filter(Boolean).join(' · ')}
        actions={(
          <>
            <StatusPill status={agent.status} />
            <div className="mx-1 h-4 w-px bg-white/[0.08]" aria-hidden />
            {canStart && (
              <Button variant="primary" onClick={handleStart} disabled={!!actionInProgress}>
                <IconPlay className="h-3.5 w-3.5" /> Start
              </Button>
            )}
            {canStop && (
              <Button onClick={handleStop} disabled={!!actionInProgress}>
                <IconStop className="h-3.5 w-3.5" /> Stop
              </Button>
            )}
            {canRestart && (
              <Button onClick={handleRestart} disabled={!!actionInProgress}>
                <IconRestart className="h-3.5 w-3.5" /> Restart
              </Button>
            )}
            <Button to={`/?view=panes&agent=${agent.id}`}>
              <IconPanes className="h-3.5 w-3.5" /> Open in pane
            </Button>
            <Button variant={confirmDelete ? 'armed' : 'danger'} onClick={handleDelete}>
              {confirmDelete ? 'Confirm delete' : 'Delete'}
            </Button>
          </>
        )}
      />

      {actionInProgress && (
        <p className="-mt-4 mb-6 animate-pulse font-mono text-[11px] text-zinc-400">{actionInProgress}…</p>
      )}

      <div className="mb-4 grid grid-cols-2 gap-2 md:grid-cols-4">
        <Stat label="PID" value={agent.pid || '—'} />
        <Stat label="Process group" value={agent.pgid || '—'} />
        <Stat
          label="Uptime"
          value={metrics?.running ? `${Math.round(metrics.metrics?.uptime || 0)}s` : formatUptime(agent.process_started_at)}
        />
        <Stat
          label="Heartbeat"
          value={agent.last_heartbeat ? `${Math.round(Date.now() / 1000 - agent.last_heartbeat)}s ago` : '—'}
        />
      </div>

      {agent.skills?.length > 0 && (
        <div className="mb-6 flex flex-wrap gap-1">
          {agent.skills.map((sk) => <Tag key={sk}>{sk}</Tag>)}
        </div>
      )}

      <Surface className="overflow-hidden">
        <div className="flex h-12 items-center justify-between gap-3 border-b border-white/[0.05] px-3">
          <Segmented value={activeTab} onChange={setActiveTab} options={TABS} label="Agent session" />
          <span className="truncate font-mono text-[10px] text-zinc-600">
            {activeTab === 'terminal' ? 'raw pty' : activeTab === 'chat' ? 'shared session' : ''}
          </span>
        </div>

        {/* Chat and terminal stay mounted so switching keeps the session */}
        <div className={activeTab === 'chat' ? 'h-[min(62vh,36rem)]' : 'hidden'}>
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
        <div className={activeTab === 'terminal' ? 'h-[min(62vh,36rem)] p-2' : 'hidden'}>
          <AgentTerminal agentId={agent.id} agentName={agent.name} chrome={false} fill />
        </div>

        {activeTab === 'logs' && (
          <div
            ref={logsRef}
            className="h-[min(62vh,36rem)] overflow-y-auto whitespace-pre-wrap p-4 font-mono text-[11px] leading-relaxed text-zinc-400"
          >
            {logs || 'No logs yet.'}
          </div>
        )}

        {activeTab === 'config' && (
          <pre className="h-[min(62vh,36rem)] overflow-auto p-4 font-mono text-[11px] leading-relaxed text-zinc-400">
            {JSON.stringify(agent.config || {}, null, 2)}
          </pre>
        )}
      </Surface>
    </div>
  )
}
