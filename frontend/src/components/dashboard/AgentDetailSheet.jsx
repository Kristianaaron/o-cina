import { Link } from 'react-router-dom'
import {
  agentAvatarUrl,
  formatUptime,
  isAgentLive,
  isDemoAgent,
  shortLabel,
  taskSnippet,
  truncate,
} from '../../lib/agentField'

export default function AgentDetailSheet({
  agent,
  tasks = [],
  connections = [],
  onClose,
}) {
  if (!agent) return null

  const live = isAgentLive(agent.status)
  const demo = isDemoAgent(agent)
  const task = taskSnippet(agent, tasks)
  const routes = connections
    .filter((e) => e.from === agent.id || e.to === agent.id)
    .map((e) => (e.from === agent.id ? e.to : e.from))
  const uniqueRoutes = [...new Set(routes)]

  const load = task.load != null
    ? `${Math.round(Number(task.load))}%`
    : live ? `${40 + (agent.name?.length || 0) % 45}%` : '—'
  const speed = task.speed != null
    ? String(task.speed)
    : live ? `${(0.05 + (agent.pid || 3) % 9) / 10} pkt/min` : '—'

  return (
    <aside className="absolute left-3 top-3 z-20 flex w-[min(100%-1.5rem,20rem)] flex-col gap-3 rounded-2xl border border-zinc-700/70 bg-zinc-950/90 p-3 shadow-2xl backdrop-blur-xl sm:left-4 sm:top-4">
      <div className="flex items-start gap-3">
        <img
          src={agentAvatarUrl(agent)}
          alt=""
          className="node-bit-avatar h-11 w-11 rounded-full bg-[#121218] object-contain object-center p-1.5 ring-1 ring-white/10"
          style={live ? { boxShadow: '0 0 16px rgba(255, 255, 255, 0.22)' } : undefined}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate font-mono text-sm font-semibold tracking-wide">
              {shortLabel(agent.name)}
            </h2>
            <span className={`rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
              live
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-zinc-800 text-zinc-500'
            }`}>
              {live ? 'active' : agent.status || 'idle'}
            </span>
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">
            {truncate(`${agent.harness || 'agent'}${agent.model ? ` · ${agent.model}` : ''}`, 48)}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full border border-zinc-700 px-2 py-0.5 font-mono text-xs text-zinc-500 hover:text-zinc-200"
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Metric label="LOAD" value={load} />
        <Metric label="TASK" value={truncate(task.label, 14)} title={task.label} />
        <Metric label="ACTIVE" value={formatUptime(agent.process_started_at)} />
        <Metric label="SPEED" value={truncate(speed, 14)} title={String(speed)} />
      </div>

      <div>
        <div className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          Routes ({uniqueRoutes.length})
        </div>
        <div className="flex flex-wrap gap-1">
          {uniqueRoutes.length === 0 && (
            <span className="rounded-full bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-600">
              none
            </span>
          )}
          {uniqueRoutes.slice(0, 6).map((id) => (
            <span
              key={id}
              className="rounded-full bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-400"
            >
              — {id.slice(0, 6)}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-2">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-wider text-zinc-500">
          Current task
        </div>
        <p className="font-mono text-[11px] leading-relaxed text-zinc-300">
          {truncate(task.label, 72)}
        </p>
        <p className="mt-1 font-mono text-[10px] text-zinc-600">
          {task.detail}
          {task.taskId ? ` · ${task.taskId.slice(0, 8)}` : ''}
        </p>
      </div>

      <div className="flex gap-2">
        {demo ? (
          <Link
            to="/agents"
            className="flex-1 rounded-lg bg-zinc-100 py-2 text-center font-mono text-xs font-medium text-zinc-950 hover:bg-white"
          >
            Register real agent
          </Link>
        ) : (
          <>
            <Link
              to={`/agents/${agent.id}`}
              className="flex-1 rounded-lg bg-zinc-100 py-2 text-center font-mono text-xs font-medium text-zinc-950 hover:bg-white"
            >
              Open agent
            </Link>
            <Link
              to={`/?view=herd&agent=${agent.id}`}
              className="rounded-lg border border-zinc-700 px-3 py-2 font-mono text-xs text-zinc-300 hover:border-zinc-500"
            >
              Panes
            </Link>
          </>
        )}
      </div>
    </aside>
  )
}

function Metric({ label, value, title }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-2 py-1.5" title={title}>
      <div className="font-mono text-[9px] uppercase tracking-wider text-zinc-600">{label}</div>
      <div className="truncate font-mono text-xs text-zinc-200">{value}</div>
    </div>
  )
}
