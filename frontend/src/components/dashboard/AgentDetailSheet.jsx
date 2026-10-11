import {
  agentAvatarUrl,
  formatUptime,
  isAgentLive,
  isDemoAgent,
  shortLabel,
  taskSnippet,
  truncate,
} from '../../lib/agentField'
import { Avatar, Button, CloseGlyph, Eyebrow, IconButton, Stat, StatusPill } from '../ui'

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
    <aside className="ui-pop absolute left-3 top-[4.25rem] z-20 flex w-[min(100%-1.5rem,20rem)] flex-col gap-4 rounded-2xl bg-ink-1/85 p-4 shadow-float backdrop-blur-xl sm:left-4 sm:top-[4.75rem]">
      <div className="flex items-start gap-3">
        <Avatar src={agentAvatarUrl(agent)} live={live} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-mono text-sm font-semibold tracking-wide text-zinc-50">
            {shortLabel(agent.name)}
          </h2>
          <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">
            {truncate(`${agent.harness || 'agent'}${agent.model ? ` · ${agent.model}` : ''}`, 48)}
          </p>
          <div className="mt-2"><StatusPill status={agent.status} /></div>
        </div>
        <IconButton label="Close" size="sm" onClick={onClose}>
          <CloseGlyph />
        </IconButton>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Stat label="Load" value={load} />
        <Stat label="Task" value={truncate(task.label, 14)} title={task.label} />
        <Stat label="Active" value={formatUptime(agent.process_started_at)} />
        <Stat label="Speed" value={truncate(speed, 14)} title={String(speed)} />
      </div>

      <div>
        <Eyebrow className="mb-2">Routes · {uniqueRoutes.length}</Eyebrow>
        <div className="flex flex-wrap gap-1">
          {uniqueRoutes.length === 0 && (
            <span className="font-mono text-[10px] text-zinc-600">none</span>
          )}
          {uniqueRoutes.slice(0, 6).map((id) => (
            <span key={id} className="rounded-md bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
              {id.slice(0, 6)}
            </span>
          ))}
        </div>
      </div>

      <div className="rounded-xl bg-white/[0.02] p-3 ring-1 ring-inset ring-white/[0.05]">
        <Eyebrow className="mb-1.5">Current task</Eyebrow>
        <p className="text-[12px] leading-relaxed text-zinc-300">{truncate(task.label, 72)}</p>
        <p className="mt-1 font-mono text-[10px] text-zinc-600">
          {task.detail}
          {task.taskId ? ` · ${task.taskId.slice(0, 8)}` : ''}
        </p>
      </div>

      <div className="flex gap-2">
        {demo ? (
          <Button variant="primary" to="/agents" className="flex-1">Register real agent</Button>
        ) : (
          <>
            <Button variant="primary" to={`/agents/${agent.id}`} className="flex-1">Open agent</Button>
            <Button to={`/?view=panes&agent=${agent.id}`}>Open in pane</Button>
          </>
        )}
      </div>
    </aside>
  )
}
