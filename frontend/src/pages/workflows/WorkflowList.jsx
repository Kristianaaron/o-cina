import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listWorkflows, deleteWorkflow, createWorkflow, listTemplates,
} from '../../api/workflows'
import { IconAdd, IconTrash, IconWorkflows } from '../../components/icons'
import { plural, timeAgo } from '../../lib/format'
import {
  Button,
  EmptyState,
  IconButton,
  Modal,
  Notice,
  PageHeader,
  Surface,
} from '../../components/ui'

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

  return (
    <div>
      <PageHeader
        title="Workflows"
        subtitle={loading ? 'Loading…' : `${plural(workflows.length, 'workflow')} · DAG orchestration with guardrails`}
        actions={(
          <>
            <Button onClick={loadTemplates}>From template</Button>
            <Button variant="primary" onClick={() => handleNew(null)}>
              <IconAdd className="h-3.5 w-3.5" />
              New workflow
            </Button>
          </>
        )}
      />

      {error && <div className="mb-6"><Notice onDismiss={() => setError('')}>{error}</Notice></div>}

      <Modal
        open={showTemplates}
        title="Start from a template"
        description="Copies the graph and guardrails into a new workflow."
        width="max-w-lg"
        onClose={() => setShowTemplates(false)}
      >
        <div className="-mx-1 max-h-[55vh] space-y-2 overflow-y-auto px-1">
          {templates.length === 0 ? (
            <p className="font-mono text-xs text-zinc-500">No templates available.</p>
          ) : (
            templates.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => handleNew(t)}
                className="group block w-full rounded-xl bg-white/[0.02] p-4 text-left ring-1 ring-inset ring-white/[0.06] transition-colors hover:bg-white/[0.04] hover:ring-white/[0.14]"
              >
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-mono text-[13px] font-semibold text-zinc-100">{t.name}</h3>
                  <span className="font-mono text-[10px] text-zinc-600 group-hover:text-zinc-300">Use →</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{t.description}</p>
                <p className="mt-2 font-mono text-[10px] text-zinc-600">
                  {plural(t.nodes.length, 'node')} · {plural(t.edges.length, 'edge')}
                </p>
              </button>
            ))
          )}
        </div>
      </Modal>

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[0, 1, 2].map((i) => <Surface key={i} className="h-32 animate-pulse" />)}
        </div>
      ) : workflows.length === 0 ? (
        <EmptyState
          icon={IconWorkflows}
          title="No workflows yet"
          body="Chain agents into a DAG with approvals, decisions and guardrails."
          action={<Button variant="primary" onClick={() => handleNew(null)}>New workflow</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {workflows.map((wf) => (
            <Surface
              key={wf.id}
              interactive
              role="button"
              tabIndex={0}
              onClick={() => navigate(`/workflows/${wf.id}`)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  navigate(`/workflows/${wf.id}`)
                }
              }}
              className="group relative flex min-h-[8.5rem] flex-col p-4"
            >
              <div className="flex items-start gap-3">
                <h3 className="min-w-0 flex-1 truncate font-mono text-[13px] font-semibold text-zinc-50">{wf.name}</h3>
                <IconButton
                  label={`Delete ${wf.name}`}
                  size="sm"
                  className="-mr-1 -mt-1 opacity-0 hover:!text-red-300 group-hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleDelete(wf.id)
                  }}
                >
                  <IconTrash className="h-3.5 w-3.5" />
                </IconButton>
              </div>
              <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{wf.description || 'No description'}</p>
              <div className="mt-auto flex items-center justify-between gap-2 pt-4 font-mono text-[10px] text-zinc-600">
                <span>{plural(Object.keys(wf.guardrails || {}).length, 'guardrail')}</span>
                <span>{wf.updated_at ? timeAgo(wf.updated_at) : wf.id.slice(0, 8)}</span>
              </div>
            </Surface>
          ))}
        </div>
      )}
    </div>
  )
}
