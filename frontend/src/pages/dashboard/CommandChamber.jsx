import { useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSelector } from 'react-redux'
import AgentNodeField from './AgentNodeField'
import Multiplexer from '../../components/panes/Multiplexer'
import { useAgentPoll } from '../../lib/useAgentPoll'

/**
 * Command center: the node field or the pane multiplexer, one toggle apart.
 */
export default function CommandChamber() {
  const [params, setParams] = useSearchParams()
  const view = params.get('view') === 'panes' ? 'panes' : 'nodes'

  const setView = (next) => {
    const nextParams = new URLSearchParams(params)
    if (next === 'panes') nextParams.set('view', 'panes')
    else nextParams.delete('view')
    setParams(nextParams, { replace: true })
  }

  return (
    <div className="relative flex h-full min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1">
        {view === 'nodes' ? (
          <AgentNodeField view={view} onViewChange={setView} />
        ) : (
          <PanesView view={view} onViewChange={setView} />
        )}
      </div>
    </div>
  )
}

function PanesView({ view, onViewChange }) {
  const { list, loading, error } = useSelector((state) => state.agents)
  const [params] = useSearchParams()
  useAgentPoll()

  const initialAgentIds = useMemo(() => {
    const raw = params.get('agents') || params.get('agent') || ''
    return raw.split(',').map((s) => s.trim()).filter(Boolean)
  }, [params])

  return (
    <Multiplexer
      agents={list}
      initialAgentIds={initialAgentIds}
      view={view}
      onViewChange={onViewChange}
      error={error}
      loading={loading && list.length === 0}
    />
  )
}
