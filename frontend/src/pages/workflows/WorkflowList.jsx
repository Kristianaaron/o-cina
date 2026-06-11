import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  listWorkflows, deleteWorkflow, createWorkflow, listTemplates,
} from '../../api/workflows'

const NODE_TYPE_ICONS = {
  agent: '🤖',
  approval: '✅',
  decision: '🔀',
  subflow: '📦',
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

  if (loading) return <div className="text-zinc-500 font-mono">Loading workflows…</div>

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-mono text-2xl font-semibold">Workflows</h1>
          <p className="text-zinc-500 text-sm mt-1">DAG-based agent orchestration with guardrails</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={loadTemplates}
            className="px-3 py-2 text-sm bg-zinc-800 hover:bg-zinc-700 rounded-lg border border-zinc-700 transition-colors"
          >
            From Template
          </button>
          <button
            onClick={() => handleNew(null)}
            className="px-3 py-2 text-sm bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors"
          >
            + New Workflow
          </button>
        </div>
      </div>

      {error && <div className="text-red-400 text-sm font-mono bg-red-950/50 p-3 rounded-lg">{error}</div>}

      {/* Template modal */}
      {showTemplates && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowTemplates(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-lg space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-lg font-semibold">Workflow Templates</h2>
              <button onClick={() => setShowTemplates(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {templates.map((t) => (
                <div key={t.name} className="border border-zinc-700 rounded-lg p-4 hover:border-zinc-500 transition-colors">
                  <h3 className="font-semibold text-sm">{t.name}</h3>
                  <p className="text-zinc-500 text-xs mt-1">{t.description}</p>
                  <p className="text-zinc-600 text-xs mt-1">{t.nodes.length} nodes, {t.edges.length} edges</p>
                  <button
                    onClick={() => handleNew(t)}
                    className="mt-3 px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 rounded transition-colors"
                  >
                    Use Template
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Workflow list */}
      {workflows.length === 0 ? (
        <div className="text-center py-16 text-zinc-600">
          <p className="font-mono text-lg">No workflows yet</p>
          <p className="text-sm mt-2">Create one from scratch or use a template to get started.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {workflows.map((wf) => (
            <div
              key={wf.id}
              className="flex items-center justify-between p-4 bg-zinc-900/50 border border-zinc-800 rounded-lg hover:border-zinc-600 transition-colors cursor-pointer"
              onClick={() => navigate(`/workflows/${wf.id}`)}
            >
              <div>
                <h3 className="font-mono font-semibold text-sm">{wf.name}</h3>
                {wf.description && <p className="text-zinc-500 text-xs mt-1">{wf.description}</p>}
                <div className="flex gap-3 mt-2 text-xs text-zinc-600 font-mono">
                  <span>ID: {wf.id.slice(0, 8)}</span>
                  <span>Guardrails: {Object.keys(wf.guardrails || {}).length} rules</span>
                </div>
              </div>
              <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                <button
                  onClick={() => navigate(`/workflows/${wf.id}`)}
                  className="px-2 py-1 text-xs text-zinc-400 hover:text-white border border-zinc-700 rounded transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(wf.id)}
                  className="px-2 py-1 text-xs text-red-400 hover:text-red-300 border border-red-900/50 rounded transition-colors"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
