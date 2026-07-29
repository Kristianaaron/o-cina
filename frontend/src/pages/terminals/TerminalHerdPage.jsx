import { useEffect, useMemo } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useSearchParams, Link } from 'react-router-dom'
import { fetchAgents } from '../../lib/store/agentsSlice'
import TerminalHerd from '../../components/TerminalHerd'

/** Full-bleed Herdr-style agent multiplexer. */
export default function TerminalHerdPage() {
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

  return (
    <div className="flex h-[calc(100vh-7rem)] min-h-[420px] flex-col overflow-hidden rounded-lg border border-zinc-800">
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-950 px-3 py-1.5">
        <div className="font-mono text-xs text-zinc-400">
          Terminal herd
          <span className="mx-2 text-zinc-600">·</span>
          <span className="text-zinc-500">multiplexer</span>
        </div>
        <Link to="/agents" className="font-mono text-[11px] text-zinc-500 hover:text-zinc-300">
          Agents →
        </Link>
      </div>
      {error && (
        <div className="px-3 py-2 text-xs font-mono text-red-300 bg-red-950/40 border-b border-red-900">
          {error}
        </div>
      )}
      {loading && list.length === 0 ? (
        <div className="flex-1 flex items-center justify-center font-mono text-sm text-zinc-500">
          Loading herd…
        </div>
      ) : (
        <div className="flex-1 min-h-0">
          <TerminalHerd agents={list} initialAgentIds={initialAgentIds} />
        </div>
      )}
    </div>
  )
}
