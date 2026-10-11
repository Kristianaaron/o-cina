import { useEffect, useState } from 'react'
import { useSelector, useDispatch } from 'react-redux'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { fetchAgents, setFilters, registerAgent } from '../../lib/store/agentsSlice'
import {
  agentAvatarUrl,
  formatUptime,
  isAgentLive,
  shortLabel,
  truncate,
} from '../../lib/agentField'
import { plural } from '../../lib/format'
import { IconAdd, IconAgents, IconPanes } from '../../components/icons'
import {
  Avatar,
  Button,
  EmptyState,
  Field,
  Input,
  Modal,
  Notice,
  PageHeader,
  Select,
  StatusPill,
  Surface,
  Tag,
  inputClass,
} from '../../components/ui'

function AgentCard({ agent }) {
  const navigate = useNavigate()
  const live = isAgentLive(agent.status)
  const open = () => navigate(`/agents/${agent.id}`)

  return (
    <Surface
      interactive
      role="button"
      tabIndex={0}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      className="flex flex-col gap-4 p-4"
    >
      <div className="flex items-start gap-3">
        <Avatar src={agentAvatarUrl(agent)} live={live} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-mono text-[13px] font-semibold tracking-wide text-zinc-50" title={agent.name}>
            {shortLabel(agent.name)}
          </h3>
          <p className="mt-0.5 truncate font-mono text-[11px] text-zinc-500">
            {truncate(`${agent.harness || 'agent'}${agent.model ? ` · ${agent.model}` : ''}`, 40)}
          </p>
        </div>
        <StatusPill status={agent.status} />
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px]">
        <dt className="text-zinc-600">uptime</dt>
        <dd className="truncate text-right text-zinc-300">{formatUptime(agent.process_started_at)}</dd>
        <dt className="text-zinc-600">pid</dt>
        <dd className="truncate text-right text-zinc-300">{agent.pid || '—'}</dd>
      </dl>

      {agent.skills?.length > 0 && (
        <div className="mt-auto flex flex-wrap gap-1">
          {agent.skills.slice(0, 3).map((sk) => <Tag key={sk}>{sk}</Tag>)}
          {agent.skills.length > 3 && <Tag>+{agent.skills.length - 3}</Tag>}
        </div>
      )}
    </Surface>
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
  const [params, setParams] = useSearchParams()

  const [search, setSearch] = useState('')
  const [harnessFilter, setHarnessFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const showRegister = params.get('register') === '1'
  const [regForm, setRegForm] = useState(EMPTY_FORM)
  const [regError, setRegError] = useState('')
  const [registering, setRegistering] = useState(false)

  const setShowRegister = (on) => {
    const next = new URLSearchParams(params)
    if (on) next.set('register', '1')
    else next.delete('register')
    setParams(next, { replace: true })
  }

  useEffect(() => {
    const query = {}
    if (search) query.search = search
    if (harnessFilter) query.harness = harnessFilter
    if (statusFilter) query.status = statusFilter
    dispatch(setFilters(query))
    dispatch(fetchAgents(query))
  }, [search, harnessFilter, statusFilter, dispatch])

  const harnessTypes = [...new Set(list.map((a) => a.harness))].filter(Boolean)
  const liveCount = list.filter((a) => isAgentLive(a.status)).length

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
        skills: regForm.skills.split(',').map((sk) => sk.trim()).filter(Boolean),
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

  const filterClass = `${inputClass.replace('w-full ', '')} h-8 py-0 text-xs`

  return (
    <div>
      <PageHeader
        title="Agents"
        subtitle={loading ? 'Loading…' : `${plural(total, 'agent')} · ${liveCount} live`}
        actions={(
          <>
            <Button to="/?view=panes">
              <IconPanes className="h-3.5 w-3.5" />
              Open panes
            </Button>
            <Button variant="primary" onClick={() => setShowRegister(true)}>
              <IconAdd className="h-3.5 w-3.5" />
              Register agent
            </Button>
          </>
        )}
      />

      <div className="mb-6 flex flex-wrap gap-2">
        <input
          type="search"
          placeholder="Search agents…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${filterClass} w-full sm:w-64`}
        />
        <select
          value={harnessFilter}
          onChange={(e) => setHarnessFilter(e.target.value)}
          className={`${filterClass} select-field`}
          aria-label="Harness"
        >
          <option value="">All harnesses</option>
          {harnessTypes.map((h) => <option key={h} value={h}>{h}</option>)}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className={`${filterClass} select-field`}
          aria-label="Status"
        >
          <option value="">All statuses</option>
          {['running', 'stopped', 'error', 'offline', 'registered'].map((st) => (
            <option key={st} value={st}>{st}</option>
          ))}
        </select>
      </div>

      {error && <div className="mb-6"><Notice>{error}</Notice></div>}

      {loading && list.length === 0 ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Surface key={i} className="h-40 animate-pulse" />)}
        </div>
      ) : list.length === 0 ? (
        <EmptyState
          icon={IconAgents}
          title={search || harnessFilter || statusFilter ? 'No agents match these filters' : 'No agents yet'}
          body="Register a harness — Hermes, Claude Code, Codex or your own — to bring it into the command center."
          action={<Button variant="primary" onClick={() => setShowRegister(true)}>Register agent</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
        </div>
      )}

      <Modal
        open={showRegister}
        title="Register agent"
        description="Add a harness to the command center."
        onClose={() => setShowRegister(false)}
        footer={(
          <>
            <Button variant="ghost" onClick={() => setShowRegister(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleRegister} disabled={!regForm.name.trim() || registering}>
              {registering ? 'Registering…' : 'Register'}
            </Button>
          </>
        )}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => { e.preventDefault(); handleRegister() }}
        >
          <Field label="Name">
            <Input
              value={regForm.name}
              onChange={(e) => setRegForm({ ...regForm, name: e.target.value })}
              placeholder="scout-01"
              autoFocus
            />
          </Field>
          <Field label="Harness">
            <Select
              value={regForm.harness}
              onChange={(e) => setRegForm({ ...regForm, harness: e.target.value })}
            >
              {['hermes', 'claude-code', 'codex', 'opencode'].map((h) => <option key={h} value={h}>{h}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Model" hint="optional">
              <Input value={regForm.model} onChange={(e) => setRegForm({ ...regForm, model: e.target.value })} />
            </Field>
            <Field label="Provider" hint="optional">
              <Input value={regForm.provider} onChange={(e) => setRegForm({ ...regForm, provider: e.target.value })} />
            </Field>
          </div>
          <Field label="Skills" hint="comma-separated">
            <Input value={regForm.skills} onChange={(e) => setRegForm({ ...regForm, skills: e.target.value })} />
          </Field>
          {regError && <Notice>{regError}</Notice>}
          <button type="submit" hidden />
        </form>
      </Modal>
    </div>
  )
}
