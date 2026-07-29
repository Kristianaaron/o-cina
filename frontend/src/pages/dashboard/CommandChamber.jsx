import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { useEffect } from 'react'
import AgentNodeField from './AgentNodeField'
import TerminalHerd from '../../components/TerminalHerd'
import { fetchAgents } from '../../lib/store/agentsSlice'
import { IconHerd, IconNodes } from '../../components/icons'

/**
 * Home surface: switch between the node field and the terminal pane herd.
 */
export default function CommandChamber() {
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'herd' ? 'herd' : 'nodes'

  const setView = (next) => {
    const nextParams = new URLSearchParams(params)
    if (next === 'herd') nextParams.set('view', 'herd')
    else nextParams.delete('view')
    setParams(nextParams, { replace: true })
  }

  const toggle = <ViewToggle view={view} onChange={setView} />

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        {view === 'nodes' ? (
          <AgentNodeField viewToggle={toggle} />
        ) : (
          <HerdPane viewToggle={toggle} />
        )}
      </div>
    </div>
  )
}

function ViewToggle({ view, onChange }) {
  return (
    <div
      className="inline-flex shrink-0 items-center gap-0.5 rounded-lg border border-zinc-700/70 bg-zinc-950/80 p-0.5"
      role="group"
      aria-label="Chamber view"
    >
      <ToggleBtn
        active={view === 'nodes'}
        onClick={() => onChange('nodes')}
        icon={IconNodes}
        label="Nodes"
      />
      <ToggleBtn
        active={view === 'herd'}
        onClick={() => onChange('herd')}
        icon={IconHerd}
        label="Panes"
      />
    </div>
  )
}

function ToggleBtn({ active, onClick, icon: Icon, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={[
        'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-mono text-[11px] font-medium transition-colors',
        active
          ? 'bg-zinc-100 text-zinc-950'
          : 'text-zinc-400 hover:bg-zinc-800/80 hover:text-zinc-100',
      ].join(' ')}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

function HerdPane({ viewToggle }) {
  const dispatch = useDispatch()
  const { list, loading, error } = useSelector((state) => state.agents)
  const [params] = useSearchParams()

  const initialAgentIds = useMemo(() => {
    const raw = params.get('agents') || params.get('agent') || ''
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  }, [params])

  useEffect(() => {
    dispatch(fetchAgents({}))
    const id = setInterval(() => dispatch(fetchAgents({})), 8000)
    return () => clearInterval(id)
  }, [dispatch])

  if (loading && list.length === 0) {
    return (
        <div className="flex h-full min-h-0 flex-col bg-[#07070a]">
        <header className="flex shrink-0 items-center gap-3 border-b border-zinc-800/80 bg-[#0a0a0e] px-3 py-2">
          {viewToggle}
          <div className="font-mono text-sm font-semibold text-zinc-100">Panes</div>
        </header>
        <div className="flex flex-1 items-center justify-center font-mono text-sm text-zinc-500">
          Loading herd…
        </div>
      </div>
    )
  }

  return (
    <TerminalHerd
      agents={list}
      initialAgentIds={initialAgentIds}
      viewToggle={viewToggle}
      error={error}
    />
  )
}
