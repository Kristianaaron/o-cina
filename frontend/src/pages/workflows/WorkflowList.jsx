import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listWorkflows, deleteWorkflow, createWorkflow, listTemplates,
} from '../../api/workflows'
import { IconPlus, IconTrash, IconWorkflows } from '../../components/icons'

function timeAgo(ts) {
  if (!ts) return ''
  const diff = Date.now() / 1000 - ts
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

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

export default function WorkflowList() {
  const navigate = useNavigate()
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(true)
  const [showTemplates, setShowTemplates] = useState(false)
  const [templates, setTemplates] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const data = await listWorkflows()
      setWorkflows(data.workflows || [])
      setError('')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id) => {
    if (!confirm('Delete this workflow?')) return
    try {
      await deleteWorkflow(id)
      setWorkflows((wfs) => wfs.filter((w) => w.id !== id))
    } catch (e) {
      alert(e.message)
    }
  }

  const handleNew = async (template) => {
    try {
      const wf = await createWorkflow({
        name: template ? `Copy of ${template.name}` : 'New Workflow',
        description: template?.description || '',
        nodes: template?.nodes || [],
        edges: template?.edges || [],
        guardrails: template?.guardrails || { max_iterations: 10, timeout_per_task: 1800 },
      })
      navigate(`/workflows/${wf.id}`)
    } catch (e) {
      alert(e.message)
    }
  }

  const loadTemplates = async () => {
    try {
      const data = await listTemplates()
      setTemplates(data.templates || [])
      setShowTemplates(true)
    } catch (e) {
      alert(e.message)
    }
  }

  if (loading) {
    return (
      <div className="font-mono text-sm text-zinc-500">Loading workflows…</div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-2xl font-semibold">Workflows</h1>
          <p className="mt-1 text-sm text-zinc-500">
            DAG-based agent orchestration with guardrails
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ListBtn onClick={loadTemplates}>From template</ListBtn>
          <ListBtn onClick={() => handleNew(null)} primary>
            <IconPlus className="h-3.5 w-3.5" />
            New workflow
          </ListBtn>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/40 bg-red-950/40 p-3 font-mono text-sm text-red-400">
          {error}
        </div>
      )}

      {showTemplates && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowTemplates(false)}
        >
          <div
            className="w-full max-w-lg space-y-4 rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wf-templates-title"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 id="wf-templates-title" className="font-mono text-lg font-semibold text-zinc-100">
                Workflow templates
              </h2>
              <button
                type="button"
                onClick={() => setShowTemplates(false)}
                className="text-zinc-500 transition-colors hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="max-h-96 space-y-3 overflow-y-auto">
              {templates.length === 0 ? (
                <p className="font-mono text-sm text-zinc-500">No templates available.</p>
              ) : (
                templates.map((t) => (
                  <div
                    key={t.name}
                    className="rounded-lg border border-zinc-700/60 bg-zinc-950/50 p-4 transition-colors hover:border-zinc-500"
                  >
                    <h3 className="font-mono text-sm font-semibold text-zinc-100">{t.name}</h3>
                    <p className="mt-1 text-xs text-zinc-500">{t.description}</p>
                    <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                      {t.nodes.length} nodes · {t.edges.length} edges
                    </p>
                    <ListBtn
                      onClick={() => handleNew(t)}
                      primary
                      className="mt-3"
                    >
                      Use template
                    </ListBtn>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {workflows.length === 0 ? (
        <div className="py-16 text-center text-zinc-600">
          <IconWorkflows className="mx-auto mb-3 h-8 w-8 text-zinc-700" />
          <p className="font-mono text-lg">No workflows yet</p>
          <p className="mt-2 text-sm">Create one from scratch or use a template to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/workflows/${wf.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(`/workflows/${wf.id}`)
                }
              }}
              className="group relative flex cursor-pointer flex-col rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:border-zinc-600 focus:outline-none focus-visible:border-zinc-500"
            >
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  handleDelete(wf.id)
                }}
                aria-label={`Delete ${wf.name}`}
                className="absolute right-2.5 top-2.5 rounded p-1 text-zinc-100 opacity-50 transition-opacity hover:bg-zinc-800 hover:opacity-100 group-hover:opacity-100"
              >
                <IconTrash className="h-3.5 w-3.5" />
              </button>

              <h3 className="truncate pr-7 font-mono text-sm font-semibold text-zinc-100 group-hover:text-white">
                {wf.name}
              </h3>
              {wf.description ? (
                <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{wf.description}</p>
              ) : (
                <p className="mt-1 text-xs text-zinc-600">No description</p>
              )}

              <div className="mt-auto flex items-center justify-between gap-2 pt-3 font-mono text-[10px] uppercase tracking-wider text-zinc-600">
                <span className="truncate">{wf.id.slice(0, 8)}</span>
                <span className="shrink-0">
                  {Object.keys(wf.guardrails || {}).length} rules
                  {wf.updated_at ? ` · ${timeAgo(wf.updated_at)}` : ''}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
