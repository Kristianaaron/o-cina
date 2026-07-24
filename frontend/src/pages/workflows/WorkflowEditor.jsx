import { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ReactFlow,
  Controls,
  Background,
  MarkerType,
  useNodesState,
  useEdgesState,
  addEdge,
  Panel,
  Handle,
  Position,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import {
  getWorkflow, updateWorkflow, validateWorkflow, executeWorkflow,
  listTasks, getTaskStatus, stopTask, approveTask,
} from '../../api/workflows'
import { api } from '../../api/agents'

// ── Custom node styles ────────────────────────────────────────────────────

const NODE_STYLES = {
  agent: {
    bg: '#18181b', border: '#22c55e', text: '#22c55e', icon: '🤖',
  },
  approval: {
    bg: '#18181b', border: '#f59e0b', text: '#f59e0b', icon: '✅',
  },
  decision: {
    bg: '#18181b', border: '#3b82f6', text: '#3b82f6', icon: '🔀',
  },
  subflow: {
    bg: '#18181b', border: '#a855f7', text: '#a855f7', icon: '📦',
  },
}

function WorkflowNode({ data }) {
  const style = NODE_STYLES[data.node_type] || NODE_STYLES.agent
  return (
    <div className={`px-4 py-3 rounded-lg border text-sm font-mono shadow-lg ${
      data.status === 'running' ? 'animate-pulse' :
      data.status === 'completed' ? 'opacity-80' : ''
    }`}
      style={{ background: style.bg, borderColor: style.border, color: style.text }}
    >
      <Handle type="target" position={Position.Left} style={{ background: style.border }} />
      <div className="flex items-center gap-2">
        <span>{style.icon}</span>
        <span className="font-semibold">{data.ref_id}</span>
      </div>
      {data.agent_name && <div className="text-xs opacity-70 mt-1">{data.agent_name}</div>}
      {data.status && data.status !== 'idle' && (
        <div className="text-xs mt-1 uppercase tracking-wider" style={{ color: style.text }}>
          ● {data.status}
        </div>
      )}
      <Handle type="source" position={Position.Right} style={{ background: style.border }} />
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
  const [nodes, setNodes, onNodesChange] = useNodesState([])
  const [edges, setEdges, onEdgesChange] = useEdgesState([])
  const [agents, setAgents] = useState([])
  const [wf, setWf] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [showConfig, setShowConfig] = useState(false)
  const [configData, setConfigData] = useState({})
  const [taskId, setTaskId] = useState(null)
  const [taskStatus, setTaskStatus] = useState(null)
  const [draftSaved, setDraftSaved] = useState(false)
  const taskPollRef = useRef(null)
  const nextPosRef = useRef(0)

  // Load workflow
  const loadWorkflow = useCallback(async () => {
    try {
      const data = await getWorkflow(id)
      const allAgents = await api.listAgents()
      const agentMap = {}
      for (const a of (allAgents.agents || [])) {
        agentMap[a.id] = a.name
      }

      setAgents(allAgents.agents || [])
      setWf(data.workflow)

      // Convert DB nodes to React Flow nodes
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
        labelStyle: { fill: '#71717a' },
        markerEnd: { type: MarkerType.ArrowClosed, color: '#71717a' },
        style: { stroke: '#52525b' },
        data_rules: e.data_rules,
      }))
      setEdges(flowEdges)
      nextPosRef.current = (data.nodes || []).length
    } catch (e) {
      alert(e.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { loadWorkflow() }, [loadWorkflow])

  // ── Node operations ──────────────────────────────────────────────

  const onConnect = useCallback((params) => {
    setEdges((prev) => addEdge({
      ...params,
      label: '',
      labelStyle: { fill: '#71717a' },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#71717a' },
      style: { stroke: '#52525b' },
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

  const handleSave = async () => {
    setSaving(true)
    try {
      const payload = {
        name: wf?.name || 'Untitled',
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
      }
      await updateWorkflow(id, payload)
    } catch (e) {
      alert(e.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Validate ─────────────────────────────────────────────────────

  const handleValidate = async () => {
    setValidating(true)
    setValidation(null)
    try {
      // Save first to persist nodes/edges
      await handleSave()
      const result = await validateWorkflow(id)
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
      const result = await executeWorkflow(id, {})
      setTaskId(result.task_id)
      setTaskStatus(result.status)
      startPolling(id, result.task_id)
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
      await stopTask(id, taskId)
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
      await approveTask(id, taskId)
    } catch (e) {
      alert(e.message)
    }
  }

  if (loading) return <div className="text-zinc-500 font-mono">Loading workflow…</div>

  return (
    <div className="h-[calc(100vh-120px)] flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-3 shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={() => {
            if (confirm('Are you sure you want to cancel? This workflow will not be saved.')) {
              navigate('/workflows')
            }
          }} className="text-red-400 hover:text-red-300 text-sm">
            ✕ Cancel
          </button>
          <h1 className="font-mono text-lg font-semibold">{wf?.name}</h1>
          {draftSaved && <span className="text-xs text-zinc-500 font-mono">Draft saved</span>}
          {taskStatus && (
            <span className={`text-xs font-mono px-2 py-0.5 rounded ${
              taskStatus.status === 'completed' ? 'bg-emerald-900/50 text-emerald-400' :
              taskStatus.status === 'failed' ? 'bg-red-900/50 text-red-400' :
              taskStatus.status === 'cancelled' ? 'bg-zinc-800 text-zinc-400' :
              'bg-amber-900/50 text-amber-400'
            }`}>
              {taskStatus.status}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {validation && (
            <span className={`text-xs font-mono mr-2 ${validation.valid ? 'text-emerald-400' : 'text-red-400'}`}>
              {validation.valid ? `✓ Valid (${validation.node_count} nodes)` : `✗ ${validation.error}`}
            </span>
          )}
          <button onClick={handleValidate} disabled={validating}
            className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 transition-colors disabled:opacity-50">
            {validating ? 'Validating…' : 'Validate DAG'}
          </button>
          <button onClick={handleSave} disabled={saving}
            className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 rounded transition-colors disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button onClick={async () => {
            setDraftSaved(false)
            await handleSave()
            setDraftSaved(true)
            setTimeout(() => setDraftSaved(false), 3000)
          }} className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 transition-colors">
            💾 Save as Draft
          </button>
          {!taskStatus && (
            <button onClick={handleExecute}
              className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 rounded transition-colors">
              ▶ Execute
            </button>
          )}
          {taskStatus && ['running', 'pending', 'waiting_approval'].includes(taskStatus.status) && (
            <button onClick={handleStop}
              className="px-3 py-1.5 text-xs bg-red-900/50 hover:bg-red-800/50 text-red-400 rounded border border-red-900 transition-colors">
              ■ Stop
            </button>
          )}
          {taskStatus?.status === 'waiting_approval' && (
            <button onClick={handleApprove}
              className="px-3 py-1.5 text-xs bg-amber-600 hover:bg-amber-500 rounded transition-colors">
              ✓ Approve
            </button>
          )}
        </div>
      </div>

      {/* Graph + sidebar */}
      <div className="flex flex-1 min-h-0">
        {/* React Flow */}
        <div className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg overflow-hidden">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            defaultEdgeOptions={{
              markerEnd: { type: MarkerType.ArrowClosed, color: '#71717a' },
              style: { stroke: '#52525b' },
            }}
          >
            <Background color="#27272a" gap={20} />
            <Controls />
            <Panel position="top-left" className="flex flex-col gap-2">
              <div className="text-xs font-mono text-zinc-500 mb-1">Add node:</div>
              {Object.keys(NODE_STYLES).map((type) => (
                <button key={type} onClick={() => addNode(type)}
                  className="px-2 py-1 text-xs bg-zinc-900 border border-zinc-700 rounded hover:border-zinc-500 transition-colors flex items-center gap-1"
                  style={{ color: NODE_STYLES[type].text }}
                >
                  {NODE_STYLES[type].icon} {type}
                </button>
              ))}
            </Panel>
          </ReactFlow>
        </div>

        {/* Task status sidebar */}
        {taskStatus && taskStatus.nodes && (
          <div className="w-72 ml-3 bg-zinc-900/50 border border-zinc-800 rounded-lg p-4 overflow-y-auto shrink-0">
            <h3 className="font-mono text-sm font-semibold mb-3">Execution Progress</h3>
            <div className="space-y-2">
              {taskStatus.nodes.map((n) => (
                <div key={n.ref_id} className="text-xs font-mono flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${
                    n.status === 'completed' ? 'bg-emerald-500' :
                    n.status === 'running' ? 'bg-amber-500 animate-pulse' :
                    n.status === 'waiting' ? 'bg-blue-500' :
                    n.status === 'cancelled' ? 'bg-zinc-600' :
                    'bg-zinc-700'
                  }`} />
                  <span className="text-zinc-400">{n.ref_id}</span>
                  <span className="ml-auto" style={{
                    color: n.status === 'completed' ? '#22c55e' :
                           n.status === 'running' ? '#f59e0b' :
                           n.status === 'cancelled' ? '#71717a' : '#a1a1aa'
                  }}>{n.status}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Config modal */}
      {showConfig && selectedNode && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setShowConfig(false)}>
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-mono text-lg font-semibold">
                Configure: {selectedNode.data.ref_id} ({selectedNode.data.node_type})
              </h2>
              <button onClick={() => setShowConfig(false)} className="text-zinc-500 hover:text-white">✕</button>
            </div>

            {/* Node type color */}
            <div className="flex items-center gap-2">
              <span style={{ color: NODE_STYLES[selectedNode.data.node_type]?.text || '#fff' }}>
                {NODE_STYLES[selectedNode.data.node_type]?.icon || '🤖'}
              </span>
              <span className="text-sm text-zinc-400">{selectedNode.data.ref_id}</span>
            </div>

            {/* Agent assignment (for agent nodes) */}
            {selectedNode.data.node_type === 'agent' && (
              <div>
                <label className="text-xs text-zinc-500 font-mono">Assign Agent</label>
                <select
                  value={configData.agent_id || ''}
                  onChange={(e) => setConfigData({ ...configData, agent_id: e.target.value })}
                  className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200"
                >
                  <option value="">-- Unassigned --</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.harness})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Prompt */}
            <div>
              <label className="text-xs text-zinc-500 font-mono">Prompt (optional)</label>
              <textarea
                value={configData.prompt || ''}
                onChange={(e) => setConfigData({ ...configData, prompt: e.target.value })}
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded p-2 text-sm text-zinc-200 h-20 resize-y"
                placeholder="Node-specific prompt override…"
              />
            </div>

            {/* Custom config (JSON) */}
            <div>
              <label className="text-xs text-zinc-500 font-mono">Additional Config (JSON)</label>
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
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded p-2 text-xs font-mono text-zinc-200 h-24 resize-y"
              />
            </div>

            <div className="flex gap-2 justify-between">
              <button onClick={() => deleteNode(selectedNode.id)}
                className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 border border-red-900/50 rounded transition-colors">
                Delete Node
              </button>
              <div className="flex gap-2">
                <button onClick={() => setShowConfig(false)}
                  className="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 rounded border border-zinc-700 transition-colors">
                  Cancel
                </button>
                <button onClick={handleConfigSave}
                  className="px-3 py-1.5 text-xs bg-emerald-600 hover:bg-emerald-500 rounded transition-colors">
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
