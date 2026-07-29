import { useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { Link, useNavigate } from 'react-router-dom'
import { fetchAgents, setFilters, registerAgent } from '../../lib/store/agentsSlice'
import {
  agentAvatarUrl,
  formatUptime,
  isAgentLive,
  shortLabel,
  truncate,
} from '../../lib/agentField'
import { IconPlus, IconAgents } from '../../components/icons'

function ListBtn({ children, onClick, primary, className = '', ...rest }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 font-mono text-[11px] transition-colors disabled:opacity-50',
        primary
          ? 'border-zinc-200 bg-zinc-100 font-medium text-zinc-950 hover:bg-white'
          : 'border-zinc-700/60 bg-zinc-950/60 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100',
        className,
      ].join(' ')}
      {...rest}
    >
      {children}
    </button>
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

function AgentCard({ agent }) {
  const navigate = useNavigate()
  const live = isAgentLive(agent.status)
  const load = live ? `${40 + (agent.name?.length || 0) % 45}%` : '—'
  const uptime = formatUptime(agent.process_started_at)

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/agents/${agent.id}`)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          navigate(`/agents/${agent.id}`)
        }
      }}
      className="group flex cursor-pointer flex-col gap-3 rounded-2xl border border-zinc-700/70 bg-zinc-950/80 p-3 shadow-lg transition-colors hover:border-zinc-500 focus:outline-none focus-visible:border-zinc-400"
    >
      <div className="flex items-start gap-3">
        <img
          src={agentAvatarUrl(agent)}
          alt=""
          className="node-bit-avatar h-11 w-11 shrink-0 rounded-full bg-[#121218] object-contain object-center p-1.5 ring-1 ring-white/10"
          style={live ? { boxShadow: '0 0 16px rgba(255, 255, 255, 0.22)' } : undefined}
          draggable={false}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate font-mono text-sm font-semibold tracking-wide text-zinc-100">
              {shortLabel(agent.name)}
            </h3>
            <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[9px] uppercase ${
              live
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-zinc-800 text-zinc-500'
            }`}>
              {live ? 'active' : agent.status || 'idle'}
            </span>
          </div>
          <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500" title={agent.name}>
            {truncate(`${agent.harness || 'agent'}${agent.model ? ` · ${agent.model}` : ''}`, 40)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        <Metric label="LOAD" value={load} />
        <Metric label="ACTIVE" value={uptime} />
        <Metric label="HARNESS" value={agent.harness || '—'} />
        <Metric
          label="PID"
          value={agent.pid ? String(agent.pid) : '—'}
        />
      </div>

      {agent.skills?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {agent.skills.slice(0, 4).map((s) => (
            <span
              key={s}
              className="rounded-full bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-400"
            >
              {s}
            </span>
          ))}
          {agent.skills.length > 4 && (
            <span className="rounded-full bg-zinc-900 px-2 py-0.5 font-mono text-[10px] text-zinc-600">
              +{agent.skills.length - 4}
            </span>
          )}
        </div>
      )}

      <div className="mt-auto truncate font-mono text-[10px] text-zinc-600" title={agent.name}>
        {agent.name}
      </div>
    </div>
  )
}

const EMPTY_FORM = {
  name: '',
  harness: 'hermes',
  model: '',
  provider: '',
  skills: '',
}

export default function AgentListPage() {
  const dispatch = useDispatch()
  const { list, total, loading, error, filters } = useSelector((state) => state.agents)

  const [search, setSearch] = useState('')
  const [harnessFilter, setHarnessFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showRegister, setShowRegister] = useState(false)
  const [regForm, setRegForm] = useState(EMPTY_FORM)
  const [regError, setRegError] = useState('')
  const [registering, setRegistering] = useState(false)

  useEffect(() => {
    const params = {}
    if (search) params.search = search
    if (harnessFilter) params.harness = harnessFilter
    if (statusFilter) params.status = statusFilter
    dispatch(setFilters(params))
    dispatch(fetchAgents(params))
  }, [search, harnessFilter, statusFilter, dispatch])

  const harnessTypes = [...new Set(list.map((a) => a.harness))].filter(Boolean)

  const handleRegister = async () => {
    if (!regForm.name.trim()) return
    setRegError('')
    setRegistering(true)
    try {
      await dispatch(registerAgent({
        name: regForm.name.trim(),
        harness: regForm.harness,
        model: regForm.model || null,
        provider: regForm.provider || null,
        skills: regForm.skills.split(',').map((s) => s.trim()).filter(Boolean),
        config: {},
      })).unwrap()
      setRegForm(EMPTY_FORM)
      setShowRegister(false)
      dispatch(fetchAgents(filters))
    } catch (e) {
      setRegError(e.message || 'Registration failed')
    } finally {
      setRegistering(false)
    }
  }

  const fieldClass =
    'w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold">Agents</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Registered harnesses and their live status
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/?view=herd"
            className="inline-flex items-center rounded-lg border border-zinc-700/60 bg-zinc-950/60 px-3 py-1.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
          >
            Open panes
          </Link>
          <ListBtn primary onClick={() => setShowRegister(true)}>
            <IconPlus className="h-3.5 w-3.5" />
            Register agent
          </ListBtn>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full max-w-xs rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 font-mono text-xs text-zinc-200 placeholder:text-zinc-600 focus:border-zinc-600 focus:outline-none sm:w-56"
        />
        <select
          value={harnessFilter}
          onChange={(e) => setHarnessFilter(e.target.value)}
          className="select-field rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-3 font-mono text-xs text-zinc-200 focus:border-zinc-600 focus:outline-none"
        >
          <option value="">All harnesses</option>
          {harnessTypes.map((h) => (
            <option key={h} value={h}>{h}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="select-field rounded-lg border border-zinc-800 bg-zinc-900 py-1.5 pl-3 font-mono text-xs text-zinc-200 focus:border-zinc-600 focus:outline-none"
        >
          <option value="">All statuses</option>
          <option value="running">running</option>
          <option value="stopped">stopped</option>
          <option value="error">error</option>
          <option value="offline">offline</option>
          <option value="registered">registered</option>
        </select>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/40 bg-red-950/40 p-3 font-mono text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <p className="font-mono text-sm text-zinc-500">Loading agents…</p>
      )}

      {!loading && !error && (
        <>
          <p className="font-mono text-[11px] uppercase tracking-wider text-zinc-600">
            {total} agent{total !== 1 ? 's' : ''}
          </p>

          {list.length === 0 ? (
            <div className="py-16 text-center text-zinc-600">
              <IconAgents className="mx-auto mb-3 h-8 w-8 text-zinc-700" />
              <p className="font-mono text-lg">No agents yet</p>
              <p className="mt-2 text-sm">Register a harness to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
              {list.map((agent) => (
                <AgentCard key={agent.id} agent={agent} />
              ))}
            </div>
          )}
        </>
      )}

      {showRegister && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowRegister(false)}
        >
          <div
            className="w-full max-w-md space-y-5 rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="register-agent-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="register-agent-title" className="font-mono text-lg font-semibold text-zinc-100">
                  Register agent
                </h2>
                <p className="mt-1 font-mono text-xs text-zinc-500">
                  Add a harness to the command center
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRegister(false)}
                className="text-zinc-500 transition-colors hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  Name *
                </label>
                <input
                  value={regForm.name}
                  onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
                  placeholder="scout-01"
                  className={`mt-1 ${fieldClass}`}
                  autoFocus
                />
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  Harness
                </label>
                <select
                  value={regForm.harness}
                  onChange={(e) => setRegForm({ ...regForm, harness: e.target.value })}
                  className={`mt-1 select-field ${fieldClass}`}
                >
                  <option value="hermes">hermes</option>
                  <option value="claude-code">claude-code</option>
                  <option value="codex">codex</option>
                  <option value="opencode">opencode</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    Model
                  </label>
                  <input
                    value={regForm.model}
                    onChange={(e) => setRegForm({ ...regForm, model: e.target.value })}
                    placeholder="optional"
                    className={`mt-1 ${fieldClass}`}
                  />
                </div>
                <div>
                  <label className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    Provider
                  </label>
                  <input
                    value={regForm.provider}
                    onChange={(e) => setRegForm({ ...regForm, provider: e.target.value })}
                    placeholder="optional"
                    className={`mt-1 ${fieldClass}`}
                  />
                </div>
              </div>
              <div>
                <label className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                  Skills
                </label>
                <input
                  value={regForm.skills}
                  onChange={(e) => setRegForm({ ...regForm, skills: e.target.value })}
                  placeholder="comma-separated"
                  className={`mt-1 ${fieldClass}`}
                />
              </div>
            </div>

            {regError && (
              <p className="font-mono text-xs text-red-400">{regError}</p>
            )}

            <div className="flex justify-end gap-2">
              <ListBtn onClick={() => setShowRegister(false)}>Cancel</ListBtn>
              <ListBtn
                primary
                onClick={handleRegister}
                disabled={!regForm.name.trim() || registering}
              >
                {registering ? '…' : 'Register'}
              </ListBtn>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
