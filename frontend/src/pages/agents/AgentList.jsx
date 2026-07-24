import { useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Link } from 'react-router-dom'
import { fetchAgents, setFilters, registerAgent } from '../../lib/store/agentsSlice'

// Status badge colors
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

export default function AgentListPage() {
  const dispatch = useDispatch()
  const { list, total, loading, error, filters } = useSelector(state => state.agents)

  const [search, setSearch] = useState('')
  const [harnessFilter, setHarnessFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showRegister, setShowRegister] = useState(false)
  const [regForm, setRegForm] = useState({ name: '', harness: 'hermes', model: '', provider: '', skills: '' })
  const [regError, setRegError] = useState('')
  const [regSuccess, setRegSuccess] = useState('')

  // Fetch agents on mount and when filters change
  useEffect(() => {
    const params = {}
    if (search) params.search = search
    if (harnessFilter) params.harness = harnessFilter
    if (statusFilter) params.status = statusFilter
    dispatch(setFilters(params))
    dispatch(fetchAgents(params))
  }, [search, harnessFilter, statusFilter, dispatch])

  // Derive unique harness types for filter dropdown
  const harnessTypes = [...new Set(list.map(a => a.harness))].filter(Boolean)

  const handleRegister = async () => {
    setRegError('')
    setRegSuccess('')
    try {
      await dispatch(registerAgent({
        name: regForm.name,
        harness: regForm.harness,
        model: regForm.model || null,
        provider: regForm.provider || null,
        skills: regForm.skills.split(',').map(s => s.trim()).filter(Boolean),
        config: {},
      })).unwrap()
      setRegSuccess('Agent registered')
      setRegForm({ name: '', harness: 'hermes', model: '', provider: '', skills: '' })
      setShowRegister(false)
      // Refetch
      dispatch(fetchAgents(filters))
    } catch (e) {
      setRegError(e.message || 'Registration failed')
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="font-mono text-2xl font-semibold">Agents</h1>
        <div className="flex gap-2">
          <Link
            to="/terminals"
            className="px-3 py-1.5 text-sm bg-zinc-900 hover:bg-zinc-800 rounded border border-zinc-700 font-mono text-zinc-300"
          >
            Open Herd
          </Link>
          <button
            onClick={() => setShowRegister(!showRegister)}
            className="px-3 py-1.5 text-sm bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 font-mono"
          >
            {showRegister ? 'Cancel' : '+ Register Agent'}
          </button>
        </div>
      </div>

      {/* Register form */}
      {showRegister && (
        <div className="bg-zinc-900 border border-zinc-800 rounded p-4 space-y-3">
          <h3 className="font-mono text-sm font-semibold text-zinc-400">Register New Agent</h3>
          <div className="grid grid-cols-2 gap-3">
            <input
              placeholder="Name *"
              value={regForm.name}
              onChange={e => setRegForm({ ...regForm, name: e.target.value })}
              className="bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
            />
            <select
              value={regForm.harness}
              onChange={e => setRegForm({ ...regForm, harness: e.target.value })}
              className="bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
            >
              <option value="hermes">hermes</option>
              <option value="claude-code">claude-code</option>
              <option value="codex">codex</option>
              <option value="opencode">opencode</option>
            </select>
            <input
              placeholder="Model (optional)"
              value={regForm.model}
              onChange={e => setRegForm({ ...regForm, model: e.target.value })}
              className="bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
            />
            <input
              placeholder="Provider (optional)"
              value={regForm.provider}
              onChange={e => setRegForm({ ...regForm, provider: e.target.value })}
              className="bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
            />
            <input
              placeholder="Skills (comma-separated)"
              value={regForm.skills}
              onChange={e => setRegForm({ ...regForm, skills: e.target.value })}
              className="col-span-2 bg-zinc-950 border border-zinc-700 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-500"
            />
          </div>
          {regError && <p className="text-red-400 text-sm">{regError}</p>}
          {regSuccess && <p className="text-emerald-400 text-sm">{regSuccess}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleRegister}
              disabled={!regForm.name}
              className="px-3 py-1.5 text-sm bg-zinc-100 text-zinc-950 rounded font-mono disabled:opacity-40 hover:bg-white"
            >
              Register
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <input
          type="text"
          placeholder="Search by name..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm w-56 focus:outline-none focus:border-zinc-600 font-mono"
        />
        <select
          value={harnessFilter}
          onChange={e => setHarnessFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-600 font-mono"
        >
          <option value="">All Harnesses</option>
          {harnessTypes.map(h => <option key={h} value={h}>{h}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="bg-zinc-900 border border-zinc-800 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-zinc-600 font-mono"
        >
          <option value="">All Statuses</option>
          <option value="running">running</option>
          <option value="stopped">stopped</option>
          <option value="error">error</option>
          <option value="offline">offline</option>
          <option value="registered">registered</option>
        </select>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-950/50 border border-red-900 rounded p-3 text-red-300 text-sm font-mono">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && <p className="text-zinc-500 text-sm font-mono">Loading agents...</p>}

      {/* Agent cards */}
      {!loading && !error && (
        <>
          <p className="text-zinc-500 text-xs font-mono">{total} agent{total !== 1 ? 's' : ''}</p>
          <div className="grid gap-3">
            {list.map(agent => (
              <Link
                key={agent.id}
                to={`/agents/${agent.id}`}
                className="block bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded p-4 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="font-mono font-medium text-zinc-100">{agent.name}</h3>
                    <div className="flex gap-2 mt-1 text-xs text-zinc-500 font-mono">
                      <span>{agent.harness}</span>
                      {agent.model && <span>· {agent.model}</span>}
                      {agent.provider && <span>· {agent.provider}</span>}
                    </div>
                  </div>
                  <StatusBadge status={agent.status} />
                </div>
                <div className="flex items-center justify-between text-xs text-zinc-500 font-mono">
                  <div className="flex gap-2">
                    {agent.skills?.length > 0 && (
                      <div className="flex gap-1">
                        {agent.skills.slice(0, 3).map(s => (
                          <span key={s} className="bg-zinc-800 px-1.5 py-0.5 rounded">{s}</span>
                        ))}
                        {agent.skills.length > 3 && <span>+{agent.skills.length - 3}</span>}
                      </div>
                    )}
                  </div>
                  {agent.pid && <span>PID {agent.pid}</span>}
                  {agent.process_started_at && (
                    <span>{Math.round((Date.now() / 1000 - agent.process_started_at) / 60)}m uptime</span>
                  )}
                </div>
              </Link>
            ))}
          </div>

          {list.length === 0 && (
            <p className="text-zinc-600 text-sm font-mono text-center py-8">No agents registered yet.</p>
          )}
        </>
      )}
    </div>
  )
}
