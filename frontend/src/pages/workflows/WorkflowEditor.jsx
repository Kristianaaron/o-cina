import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  MarkerType,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  getWorkflow, createWorkflow, updateWorkflow, validateWorkflow, executeWorkflow,
  listTasks, getTaskStatus, stopTask, approveTask,
} from '../../api/workflows'
import { api } from '../../api/agents'
import { agentAvatarUrl } from '../../lib/agentField'
import {
  IconAgents,
  IconApprove,
  IconDecision,
  IconSubflow,
} from '../../components/icons'

// ── Monochrome node type meta ─────────────────────────────────────────────

const NODE_META = {
  agent: { label: 'agent', Icon: IconAgents },
  approval: { label: 'approval', Icon: IconApprove },
  decision: { label: 'decision', Icon: IconDecision },
  subflow: { label: 'subflow', Icon: IconSubflow },
}

const EDGE_STYLE = {
  stroke: '#9a9aa3',
  strokeWidth: 1.35,
}

const EDGE_MARKER = {
  type: MarkerType.ArrowClosed,
  color: '#9a9aa3',
  width: 16,
  height: 16,
}

function WorkflowNode({ data }) {
  const meta = NODE_META[data.node_type] || NODE_META.agent
  const Icon = meta.Icon
  const isAgent = data.node_type === 'agent'
  const running = data.status === 'running'
  const avatarSrc = isAgent
    ? agentAvatarUrl({
        id: data.agent_id || data.ref_id,
        name: data.agent_name || data.ref_id,
      })
    : null

  // Eclipse backlight: blurred white plate (same silhouette) behind opaque face.
  // Static — no spin. Light peeks only where blur spills past the face edge.
  return (
    <div className="wf-node" data-status={data.status || 'idle'}>
      <div className="wf-node__shell">
        <div className="wf-node__backlight" aria-hidden>
          <span className="wf-node__backlight-bloom" />
          <span className="wf-node__backlight-plate" />
        </div>
        <div className="wf-node__face">
          <Handle
            type="target"
            position={Position.Left}
            className="!h-2 !w-2 !border-0 !bg-zinc-300"
          />
          <div className="wf-node__body">
            <div className="wf-node__sprite">
              {isAgent ? (
                <img src={avatarSrc} alt="" className="node-bit-avatar" draggable={false} />
              ) : (
                <Icon className="h-5 w-5 text-zinc-200" />
              )}
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13px] font-semibold tracking-wide text-zinc-100">
                {data.ref_id}
              </div>
              <div className="truncate font-mono text-[10px] uppercase tracking-[0.14em] text-zinc-500">
                {meta.label}
                {data.agent_name ? ` · ${data.agent_name}` : ''}
              </div>
            </div>
          </div>
          {data.status && data.status !== 'idle' && (
            <div className="wf-node__status font-mono text-[10px] uppercase tracking-wider text-zinc-400">
              <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${
                running
                  ? 'bg-zinc-100 shadow-[0_0_8px_rgba(255,255,255,0.45)]'
                  : data.status === 'completed'
                    ? 'bg-zinc-400'
                    : 'bg-zinc-600'
              }`} />
              {data.status}
            </div>
          )}
          <Handle
            type="source"
            position={Position.Right}
            className="!h-2 !w-2 !border-0 !bg-zinc-300"
          />
        </div>
      </div>
    </div>
  )
}

const nodeTypes = { workflow: WorkflowNode }

// ── Editor ─────────────────────────────────────────────────────────────────

const DEFAULT_LAYOUT = [
  { x: 250, y: 50 },
  { x: 550, y: 50 },
  { x: 850, y: 50 },
  { x: 250, y: 250 },
  { x: 550, y: 250 },
  { x: 850, y: 250 },
]

export default function WorkflowEditor() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isNew = id === 'new'
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [agents, setAgents] = useState([])
  const [wf, setWf] = useState(null)
  const [workflowId, setWorkflowId] = useState(isNew ? null : id)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [showConfig, setShowConfig] = useState(false)
  const [configData, setConfigData] = useState({})
  const [taskId, setTaskId] = useState(null)
  const [taskStatus, setTaskStatus] = useState(null)
  const [showRunModal, setShowRunModal] = useState(false)
  const [saveFlash, setSaveFlash] = useState(false)
  const [changeSavedToast, setChangeSavedToast] = useState(false)
  const taskPollRef = useRef(null)
  const nextPosRef = useRef(0)
  const nameInputRef = useRef(null)
  const savedNameRef = useRef('')
  const toastTimerRef = useRef(null)

  const showChangeSaved = () => {
    setChangeSavedToast(true)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => setChangeSavedToast(false), 2200)
  }

  useEffect(() => () => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
  }, [])

  // Load workflow (or empty draft for /workflows/new)
  const loadWorkflow = useCallback(async () => {
    try {
      const allAgents = await api.listAgents()
      const agentMap = {}
      for (const a of (allAgents.agents || [])) {
        agentMap[a.id] = a.name
      }
      setAgents(allAgents.agents || [])

      if (isNew) {
        setWf({
          name: 'Untitled Workflow',
          description: '',
          guardrails: { max_iterations: 10, timeout_per_task: 1800 },
        })
        savedNameRef.current = 'Untitled Workflow'
        setNodes([])
        setEdges([])
        setWorkflowId(null)
        nextPosRef.current = 0
        return
      }

      const data = await getWorkflow(id)
      setWf(data.workflow)
      setWorkflowId(data.workflow?.id || id)
      savedNameRef.current = data.workflow?.name || ''

      const positions = DEFAULT_LAYOUT
      const flowNodes = (data.nodes || []).map((n, i) => ({
        id: n.ref_id,
        type: 'workflow',
        position: { x: positions[i]?.x || 100, y: positions[i]?.y || 100 },
        data: {
          ref_id: n.ref_id,
          node_type: n.node_type,
          config: n.config,
          agent_id: n.agent_id,
          agent_name: agentMap[n.agent_id] || '',
          status: n.status,
        },
      }))
      setNodes(flowNodes)

      const flowEdges = (data.edges || []).map((e) => ({
        id: `${e.source_ref}->${e.target_ref}`,
        source: e.source_ref,
        target: e.target_ref,
        label: e.label,
        labelStyle: { fill: '#71717a', fontSize: 10 },
        markerEnd: EDGE_MARKER,
        style: EDGE_STYLE,
        data_rules: e.data_rules,
      }))
      setEdges(flowEdges)
      nextPosRef.current = (data.nodes || []).length
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }, [id, isNew, setNodes, setEdges])

  useEffect(() => { loadWorkflow() }, [loadWorkflow])

  // ── Node operations ──────────────────────────────────────────────

  const onConnect = useCallback((params) => {
    setEdges((prev) => addEdge({
      ...params,
      label: '',
      labelStyle: { fill: '#71717a', fontSize: 10 },
      markerEnd: EDGE_MARKER,
      style: EDGE_STYLE,
    }, prev))
  }, [setEdges])

  const onNodeClick = useCallback((_event, node) => {
    setSelectedNode(node)
    setConfigData(node.data.config || {})
    setShowConfig(true)
  }, [])

  const addNode = (type) => {
    const pos = DEFAULT_LAYOUT[nextPosRef.current] || { x: 250 + (nextPosRef.current % 3) * 300, y: 50 + Math.floor(nextPosRef.current / 3) * 200 }
    const refId = `node_${nextPosRef.current + 1}`
    setNodes((prev) => [...prev, {
      id: refId,
      type: 'workflow',
      position: pos,
      data: {
        ref_id: refId,
        node_type: type,
        config: {},
        agent_id: '',
        agent_name: '',
        status: 'idle',
      },
    }])
    nextPosRef.current++
  }

  const deleteNode = (refId) => {
    setNodes((prev) => prev.filter((n) => n.id !== refId))
    setEdges((prev) => prev.filter((e) => e.source !== refId && e.target !== refId))
    setSelectedNode(null)
    setShowConfig(false)
  }

  // ── Config panel ─────────────────────────────────────────────────

  const handleConfigSave = () => {
    if (!selectedNode) return
    setNodes((prev) =>
      prev.map((n) =>
        n.id === selectedNode.id
          ? { ...n, data: { ...n.data, config: configData } }
          : n
      )
    )
    // Update agent_id
    if (configData.agent_id) {
      const agent = agents.find((a) => a.id === configData.agent_id)
      setNodes((prev) =>
        prev.map((n) =>
          n.id === selectedNode.id
            ? { ...n, data: { ...n.data, agent_id: configData.agent_id, agent_name: agent?.name || '' } }
            : n
        )
      )
    }
    setShowConfig(false)
    setSelectedNode(null)
  }

  // ── Save ─────────────────────────────────────────────────────────

  const buildPayload = () => ({
    name: wf?.name || 'Untitled Workflow',
    description: wf?.description || '',
    guardrails: wf?.guardrails || { max_iterations: 10, timeout_per_task: 1800 },
    nodes: nodes.map((n) => ({
      ref_id: n.data.ref_id,
      agent_id: n.data.agent_id || null,
      node_type: n.data.node_type,
      config: n.data.config || {},
    })),
    edges: edges.map((e) => ({
      source_ref: e.source,
      target_ref: e.target,
      label: e.label || null,
      data_rules: e.data_rules || {},
    })),
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = buildPayload()
      if (!workflowId) {
        const created = await createWorkflow(payload)
        setWf(created)
        setWorkflowId(created.id)
        savedNameRef.current = created.name || payload.name
        navigate(`/workflows/${created.id}`, { replace: true })
        return created.id
      }
      const updated = await updateWorkflow(workflowId, payload)
      if (updated?.name) setWf((w) => ({ ...w, ...updated }))
      savedNameRef.current = updated?.name || payload.name
      return workflowId
    } catch (e) {
      alert(e.message)
      return null
    } finally {
      setSaving(false)
    }
  }

  /** Quiet-save name when the title input loses focus. */
  const handleNameBlur = async () => {
    const next = (wf?.name || '').trim() || 'Untitled Workflow'
    if (next !== (wf?.name || '')) {
      setWf((w) => ({ ...w, name: next }))
    }
    if (next === savedNameRef.current) return

    setSaving(true)
    try {
      const payload = { ...buildPayload(), name: next }
      if (!workflowId) {
        const created = await createWorkflow(payload)
        setWf(created)
        setWorkflowId(created.id)
        savedNameRef.current = created.name || next
        navigate(`/workflows/${created.id}`, { replace: true })
      } else {
        const updated = await updateWorkflow(workflowId, payload)
        if (updated) setWf((w) => ({ ...w, ...updated, name: updated.name || next }))
        savedNameRef.current = updated?.name || next
      }
      showChangeSaved()
    } catch (e) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  /** Persist, then open the run modal (Save replaces the old Draft/Execute chrome). */
  const handleSaveAndOpenRun = async () => {
    const savedId = await handleSave()
    if (!savedId) return
    setSaveFlash(true)
    setShowRunModal(true)
  }

  // ── Validate ─────────────────────────────────────────────────────

  const handleValidate = async () => {
    setValidating(true)
    setValidation(null)
    try {
      const savedId = await handleSave()
      if (!savedId) return
      const result = await validateWorkflow(savedId)
      setValidation(result)
    } catch (e) {
      setValidation({ valid: false, error: e.message })
    } finally {
      setValidating(false)
    }
  }

  // ── Execute ──────────────────────────────────────────────────────

  const handleExecute = async () => {
    try {
      const savedId = workflowId || await handleSave()
      if (!savedId) return
      setSaveFlash(false)
      setShowRunModal(true)
      const result = await executeWorkflow(savedId, {})
      setTaskId(result.task_id)
      setTaskStatus({ status: result.status || 'pending', nodes: [] })
      startPolling(savedId, result.task_id)
    } catch (e) {
      alert(e.message)
    }
  }

  const startPolling = (wfId, tid) => {
    if (taskPollRef.current) clearInterval(taskPollRef.current)
    taskPollRef.current = setInterval(async () => {
      try {
        const status = await getTaskStatus(wfId, tid)
        setTaskStatus(status)
        // Update node statuses
        if (status.nodes) {
          setNodes((prev) =>
            prev.map((n) => {
              const nodeStatus = status.nodes.find((sn) => sn.ref_id === n.id)
              if (nodeStatus) {
                return { ...n, data: { ...n.data, status: nodeStatus.status } }
              }
              return n
            })
          )
        }
        if (['completed', 'failed', 'cancelled'].includes(status.status)) {
          clearInterval(taskPollRef.current)
          taskPollRef.current = null
        }
      } catch (e) {
        // ignore
      }
    }, 1500)
  }

  const handleStop = async () => {
    try {
      if (!workflowId || !taskId) return
      await stopTask(workflowId, taskId)
      setTaskStatus((s) => ({ ...s, status: 'cancelled' }))
      if (taskPollRef.current) {
        clearInterval(taskPollRef.current)
        taskPollRef.current = null
      }
    } catch (e) {
      alert(e.message)
    }
  }

  const handleApprove = async () => {
    try {
      if (!workflowId || !taskId) return
      await approveTask(workflowId, taskId)
    } catch (e) {
      alert(e.message)
    }
  }

  if (loading) {
    return (
      <div className="flex h-full min-h-0 items-center justify-center bg-[#07070a] font-mono text-sm text-zinc-500">
        Loading workflow…
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-0 w-full overflow-hidden bg-[#07070a]">
      {/* Full-bleed graph */}
      <div className="wf-graph absolute inset-0">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{
            padding: 0.45,
            maxZoom: 0.65,
            minZoom: 0.25,
          }}
          defaultViewport={{ x: 0, y: 0, zoom: 0.6 }}
          minZoom={0.2}
          maxZoom={1.25}
          colorMode="dark"
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{
            markerEnd: EDGE_MARKER,
            style: EDGE_STYLE,
          }}
        >
          <Background
            id="wf-lines"
            variant={BackgroundVariant.Lines}
            gap={48}
            lineWidth={1}
            color="rgba(255, 255, 255, 0.03)"
            bgColor="#07070a"
          />
          <Controls
            position="bottom-right"
            className="!mb-[4.75rem] !mr-3 sm:!mb-20"
          />
        </ReactFlow>
        <div
          className="node-field-vignette pointer-events-none absolute inset-0 z-[4]"
          aria-hidden
        />
      </div>

      {/* Name-change toast */}
      {changeSavedToast && (
        <div
          className="pointer-events-none absolute inset-x-0 top-3 z-40 flex justify-center px-3 sm:top-4"
          role="status"
          aria-live="polite"
        >
          <span className="wf-toast rounded-full border border-zinc-600/70 bg-zinc-950/90 px-3 py-1.5 font-mono text-[11px] tracking-wide text-zinc-200 shadow-lg backdrop-blur-md">
            Change saved
          </span>
        </div>
      )}

      {/* Floating top chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start justify-between gap-3 p-3 sm:p-4">
        <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-2 rounded-xl border border-zinc-700/60 bg-zinc-950/80 px-2.5 py-1.5 backdrop-blur-md">
          <button
            type="button"
            onClick={() => {
              if (confirm('Leave without saving? Unsaved changes will be lost.')) {
                navigate('/workflows')
              }
            }}
            className="rounded-lg px-2 py-1 font-mono text-xs text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-zinc-100"
          >
            ← Back
          </button>
          <div className="h-4 w-px bg-zinc-700/80" aria-hidden />
          <input
            ref={nameInputRef}
            type="text"
            value={wf?.name ?? ''}
            onChange={(e) => setWf((w) => ({ ...w, name: e.target.value }))}
            onBlur={handleNameBlur}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur()
            }}
            aria-label="Workflow name"
            placeholder="Untitled Workflow"
            className="max-w-[12rem] min-w-[8rem] truncate bg-transparent font-mono text-sm font-semibold tracking-wide text-zinc-100 outline-none placeholder:text-zinc-600 focus:ring-0 sm:max-w-xs"
          />
          {taskStatus && (
            <button
              type="button"
              onClick={() => setShowRunModal(true)}
              className={`rounded px-1.5 py-0.5 font-mono text-[10px] uppercase transition-colors ${
                taskStatus.status === 'completed' ? 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700' :
                taskStatus.status === 'failed' ? 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700' :
                taskStatus.status === 'cancelled' ? 'bg-zinc-900 text-zinc-500 hover:bg-zinc-800' :
                'bg-zinc-800 text-zinc-100 hover:bg-zinc-700'
              }`}
            >
              {taskStatus.status}
            </button>
          )}
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-1.5">
          {validation && (
            <div className={`rounded-lg border border-zinc-700/60 bg-zinc-950/80 px-2.5 py-1.5 font-mono text-[10px] backdrop-blur-md ${
              validation.valid ? 'text-zinc-300' : 'text-zinc-500'
            }`}>
              {validation.valid ? `Valid · ${validation.node_count}` : validation.error}
            </div>
          )}
          <ChromeBtn onClick={handleValidate} disabled={validating}>
            {validating ? '…' : 'Validate'}
          </ChromeBtn>
          <ChromeBtn onClick={handleSaveAndOpenRun} disabled={saving} primary>
            {saving ? '…' : 'Save'}
          </ChromeBtn>
        </div>
      </div>

      {/* Floating add-node palette */}
      <div className="pointer-events-auto absolute left-3 top-[4.25rem] z-10 flex flex-col gap-1.5 rounded-xl border border-zinc-700/60 bg-zinc-950/80 p-2 backdrop-blur-md sm:left-4">
        <div className="px-1 font-mono text-[10px] uppercase tracking-[0.16em] text-zinc-500">
          Add node
        </div>
        {Object.entries(NODE_META).map(([type, meta]) => {
          const Icon = meta.Icon
          return (
            <button
              key={type}
              type="button"
              onClick={() => addNode(type)}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-700/50 bg-zinc-950/60 px-2.5 py-1.5 font-mono text-[11px] text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100"
            >
              <Icon className="h-3.5 w-3.5" />
              {meta.label}
            </button>
          )
        })}
      </div>

      {/* Save → run modal */}
      {showRunModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setShowRunModal(false)}
        >
          <div
            className="w-full max-w-md space-y-5 rounded-xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wf-run-modal-title"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="wf-run-modal-title" className="font-mono text-lg font-semibold text-zinc-100">
                  {taskStatus ? 'Run workflow' : 'Workflow saved'}
                </h2>
                <p className="mt-1 font-mono text-xs text-zinc-500">
                  {wf?.name || 'Untitled Workflow'}
                  {saveFlash && !taskStatus ? ' · ready to run' : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRunModal(false)}
                className="text-zinc-500 transition-colors hover:text-white"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {!taskStatus && (
              <p className="font-mono text-sm leading-relaxed text-zinc-400">
                Starts a new run of this workflow: validates the graph, creates a task, and
                walks each node in order. You can stop a run or approve waiting steps from here.
              </p>
            )}

            {taskStatus && (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                    Status
                  </span>
                  <span className={`rounded px-1.5 py-0.5 font-mono text-[11px] uppercase ${
                    taskStatus.status === 'completed' ? 'bg-zinc-800 text-zinc-200' :
                    taskStatus.status === 'failed' ? 'bg-zinc-800 text-zinc-400' :
                    taskStatus.status === 'cancelled' ? 'bg-zinc-900 text-zinc-500' :
                    'bg-zinc-800 text-zinc-100'
                  }`}>
                    {taskStatus.status}
                  </span>
                </div>

                {taskStatus.nodes?.length > 0 && (
                  <div className="max-h-[40vh] space-y-2 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/60 p-3">
                    {taskStatus.nodes.map((n) => (
                      <div key={n.ref_id} className="flex items-center gap-2 font-mono text-[11px]">
                        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          n.status === 'completed' ? 'bg-zinc-300' :
                          n.status === 'running' ? 'bg-zinc-100 shadow-[0_0_8px_rgba(255,255,255,0.4)]' :
                          n.status === 'waiting' ? 'bg-zinc-500' :
                          n.status === 'cancelled' ? 'bg-zinc-700' :
                          'bg-zinc-800'
                        }`} />
                        <span className="truncate text-zinc-400">{n.ref_id}</span>
                        <span className="ml-auto shrink-0 text-zinc-500">{n.status}</span>
                      </div>
                    ))}
                  </div>
                )}

                {taskStatus.result && (
                  <pre className="max-h-32 overflow-auto rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 font-mono text-[10px] text-zinc-500">
                    {typeof taskStatus.result === 'string'
                      ? taskStatus.result
                      : JSON.stringify(taskStatus.result, null, 2)}
                  </pre>
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowRunModal(false)}
                className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 font-mono text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
              >
                {taskStatus ? 'Close' : 'Save'}
              </button>

              {taskStatus && ['running', 'pending', 'waiting_approval'].includes(taskStatus.status) && (
                <button
                  type="button"
                  onClick={handleStop}
                  className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 font-mono text-xs text-zinc-300 transition-colors hover:bg-zinc-700"
                >
                  Stop
                </button>
              )}

              {taskStatus?.status === 'waiting_approval' && (
                <button
                  type="button"
                  onClick={handleApprove}
                  className="rounded bg-zinc-100 px-3 py-1.5 font-mono text-xs font-medium text-zinc-950 transition-colors hover:bg-white"
                >
                  Approve
                </button>
              )}

              {(!taskStatus || ['completed', 'failed', 'cancelled'].includes(taskStatus.status)) && (
                <button
                  type="button"
                  onClick={handleExecute}
                  className="rounded bg-zinc-100 px-3 py-1.5 font-mono text-xs font-medium text-zinc-950 transition-colors hover:bg-white"
                >
                  {taskStatus ? 'Run again' : 'Save and run'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Config modal */}
      {showConfig && selectedNode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => setShowConfig(false)}>
          <div className="w-full max-w-md space-y-4 rounded-xl border border-zinc-700 bg-zinc-900 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-lg font-semibold">
                Configure: {selectedNode.data.ref_id} ({selectedNode.data.node_type})
              </h2>
              <button type="button" onClick={() => setShowConfig(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>

            <div className="flex items-center gap-2.5">
              {(() => {
                const meta = NODE_META[selectedNode.data.node_type] || NODE_META.agent
                const Icon = meta.Icon
                const isAgent = selectedNode.data.node_type === 'agent'
                return (
                  <>
                    <div className="wf-node__sprite">
                      {isAgent ? (
                        <img
                          src={agentAvatarUrl({
                            id: selectedNode.data.agent_id || selectedNode.data.ref_id,
                            name: selectedNode.data.agent_name || selectedNode.data.ref_id,
                          })}
                          alt=""
                          className="node-bit-avatar"
                        />
                      ) : (
                        <Icon className="h-5 w-5 text-zinc-200" />
                      )}
                    </div>
                    <div>
                      <div className="text-sm text-zinc-200">{selectedNode.data.ref_id}</div>
                      <div className="font-mono text-[10px] uppercase tracking-wider text-zinc-500">
                        {meta.label}
                      </div>
                    </div>
                  </>
                )
              })()}
            </div>

            {selectedNode.data.node_type === 'agent' && (
              <div>
                <label className="font-mono text-xs text-zinc-500">Assign Agent</label>
                <select
                  value={configData.agent_id || ''}
                  onChange={(e) => setConfigData({ ...configData, agent_id: e.target.value })}
                  className="mt-1 w-full rounded border border-zinc-700 bg-zinc-800 p-2 text-sm text-zinc-200"
                >
                  <option value="">-- Unassigned --</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.harness})</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="font-mono text-xs text-zinc-500">Prompt (optional)</label>
              <textarea
                value={configData.prompt || ''}
                onChange={(e) => setConfigData({ ...configData, prompt: e.target.value })}
                className="mt-1 h-20 w-full resize-y rounded border border-zinc-700 bg-zinc-800 p-2 text-sm text-zinc-200"
                placeholder="Node-specific prompt override…"
              />
            </div>

            <div>
              <label className="font-mono text-xs text-zinc-500">Additional Config (JSON)</label>
              <textarea
                value={JSON.stringify({
                  ...configData,
                  prompt: undefined,
                  agent_id: undefined,
                }, null, 2)}
                onChange={(e) => {
                  try {
                    const extra = JSON.parse(e.target.value)
                    setConfigData({ ...configData, ...extra })
                  } catch {
                    // ignore invalid JSON
                  }
                }}
                className="mt-1 h-24 w-full resize-y rounded border border-zinc-700 bg-zinc-800 p-2 font-mono text-xs text-zinc-200"
              />
            </div>

            <div className="flex justify-between gap-2">
              <button
                type="button"
                onClick={() => deleteNode(selectedNode.id)}
                className="rounded border border-red-900/50 px-3 py-1.5 text-xs text-red-400 transition-colors hover:text-red-300"
              >
                Delete Node
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowConfig(false)}
                  className="rounded border border-zinc-700 bg-zinc-800 px-3 py-1.5 text-xs transition-colors hover:bg-zinc-700"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleConfigSave}
                  className="rounded bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-950 transition-colors hover:bg-white"
                >
                  Save Config
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ChromeBtn({ children, onClick, disabled, primary }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={[
        'rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors disabled:opacity-50',
        primary
          ? 'border-zinc-200 bg-zinc-100 font-medium text-zinc-950 hover:bg-white'
          : 'border-zinc-700/60 bg-zinc-950/80 text-zinc-300 backdrop-blur-md hover:border-zinc-500 hover:text-zinc-100',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
