/** Deterministic layout + visual helpers for the dashboard agent field. */

import { agentBitAvatarUrl, SPRITE_VARIANT_COUNT } from './bitSprites'

export { SPRITE_VARIANT_COUNT }

const ACCENTS = [
  { glow: '#22d3ee', soft: 'rgba(34,211,238,0.28)', label: 'cyan' },
  { glow: '#f0c832', soft: 'rgba(240,200,50,0.26)', label: 'gold' },
  { glow: '#a78bfa', soft: 'rgba(167,139,250,0.26)', label: 'violet' },
  { glow: '#34d399', soft: 'rgba(52,211,153,0.26)', label: 'mint' },
  { glow: '#fb7185', soft: 'rgba(251,113,133,0.22)', label: 'rose' },
]

export function isAgentLive(status) {
  return status === 'running' || status === 'starting'
}

export function accentForAgent(agent, index = 0) {
  const seed = String(agent?.id || agent?.name || index)
  let h = 0
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return ACCENTS[h % ACCENTS.length]
}

export function shortLabel(name = '') {
  const clean = String(name).trim()
  if (!clean) return 'AGT'
  const parts = clean.split(/[\s-_]+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0] + (parts[1][1] || '')).toUpperCase().slice(0, 5)
  }
  return clean.slice(0, 5).toUpperCase()
}

export function truncate(text, max = 42) {
  const s = String(text || '').trim()
  if (!s) return '—'
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

export function agentAvatarUrl(agent, { dim = false } = {}) {
  const custom = agent?.config?.avatar || agent?.config?.image || agent?.config?.portrait
  if (typeof custom === 'string' && custom.length > 0) return custom
  return agentBitAvatarUrl(agent, { dim })
}

/**
 * Minimum cell pitch as % of field — keeps discs visually spaced (~3× disc at 1400px).
 * Large herds expand past the viewport; pan/zoom to explore.
 */
const CELL_PITCH_PCT = 18

/**
 * Place agents on a uniform centered grid (live above, idle below).
 * Coordinates are percentages of the field; may exceed 0–100 when spaced out.
 */
export function layoutAgents(agents) {
  const live = []
  const idle = []
  agents.forEach((a) => {
    if (isAgentLive(a.status)) live.push(a)
    else idle.push(a)
  })

  const positions = new Map()

  const placeGrid = (list, { cy, pitch = CELL_PITCH_PCT }) => {
    const n = list.length
    if (n === 0) return
    if (n === 1) {
      positions.set(list[0].id, { x: 50, y: cy })
      return
    }

    // Slightly wide aspect so rows stay even
    const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.35)))
    const rows = Math.ceil(n / cols)
    const gridW = cols * pitch
    const gridH = rows * pitch
    const left = 50 - gridW / 2
    const top = cy - gridH / 2

    list.forEach((a, i) => {
      const row = Math.floor(i / cols)
      const col = i % cols
      const inRow = row === rows - 1 ? n - row * cols : cols
      const rowOffset = (cols - inRow) / 2
      positions.set(a.id, {
        x: left + (col + rowOffset + 0.5) * pitch,
        y: top + (row + 0.5) * pitch,
      })
    })
  }

  if (idle.length === 0) {
    placeGrid(live, { cy: 48 })
  } else {
    const liveRows = Math.max(1, Math.ceil(Math.sqrt(live.length * 1.35)))
    const idleRows = Math.max(1, Math.ceil(Math.sqrt(idle.length * 1.35)))
    const liveH = liveRows * CELL_PITCH_PCT
    const idleH = idleRows * CELL_PITCH_PCT
    const gap = 6
    const totalH = liveH + gap + idleH
    const liveCy = 50 - totalH / 2 + liveH / 2
    const idleCy = liveCy + liveH / 2 + gap + idleH / 2
    placeGrid(live, { cy: liveCy })
    placeGrid(idle, { cy: idleCy, pitch: CELL_PITCH_PCT * 0.95 })
  }

  return positions
}

/**
 * Build connector edges:
 * 1) workflow graph edges between assigned agents that are both present
 * 2) mesh among currently live agents (orchestration signal)
 */
export function buildConnections(agents, workflows = [], tasks = []) {
  const byId = new Map(agents.map((a) => [a.id, a]))
  const edges = []
  const seen = new Set()

  const add = (from, to, kind = 'live') => {
    if (!from || !to || from === to) return
    if (!byId.has(from) || !byId.has(to)) return
    const key = [from, to].sort().join('→')
    if (seen.has(key)) return
    seen.add(key)
    edges.push({ id: key, from, to, kind })
  }

  for (const wf of workflows) {
    const nodes = wf.nodes || []
    const nodeAgent = {}
    for (const n of nodes) {
      if (n.agent_id) nodeAgent[n.ref_id] = n.agent_id
    }
    for (const e of wf.edges || []) {
      add(nodeAgent[e.source_ref], nodeAgent[e.target_ref], 'workflow')
    }
  }

  // Tasks that mention peer agents in context
  for (const task of tasks) {
    const assigned = task.assigned_agent_id
    const peers = task.context?.peer_agent_ids || task.context?.agents || []
    if (assigned && Array.isArray(peers)) {
      peers.forEach((p) => add(assigned, p, 'task'))
    }
  }

  const live = agents.filter((a) => isAgentLive(a.status))
  if (live.length >= 2 && edges.filter((e) => e.kind !== 'workflow').length === 0) {
    // Soft mesh: ring always; light diagonals that stay O(n) at hundreds of nodes
    const n = live.length
    for (let i = 0; i < n; i += 1) {
      add(live[i].id, live[(i + 1) % n].id, 'live')
    }
    if (n <= 64) {
      for (let i = 0; i < n; i += 2) {
        add(live[i].id, live[(i + 2) % n].id, 'live')
      }
    } else {
      const stride = Math.max(3, Math.round(Math.sqrt(n)))
      for (let i = 0; i < n; i += 1) {
        add(live[i].id, live[(i + stride) % n].id, 'live')
      }
    }
  }

  return edges
}

export function straightPath(x1, y1, x2, y2) {
  return `M ${x1} ${y1} L ${x2} ${y2}`
}

export function curvedPath(x1, y1, x2, y2) {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const cx = mx - dy * 0.18
  const cy = my + dx * 0.12
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
}

export function taskSnippet(agent, tasks = []) {
  const mine = tasks.find((t) => t.assigned_agent_id === agent.id && !['completed', 'cancelled', 'failed'].includes(t.status))
    || tasks.find((t) => t.assigned_agent_id === agent.id)
  if (!mine) {
    if (isAgentLive(agent.status)) return { label: 'Listening', detail: agent.harness || 'agent' }
    return { label: 'Idle', detail: agent.status || 'stopped' }
  }
  const prompt = mine.context?.prompt || mine.current_node || mine.status
  return {
    label: truncate(prompt, 36),
    detail: mine.status,
    taskId: mine.id,
    speed: mine.context?.speed || mine.context?.pkt_min || null,
    load: mine.context?.load ?? null,
  }
}

export function formatUptime(startedAt) {
  if (!startedAt) return '—'
  const secs = Math.max(0, Math.round(Date.now() / 1000 - startedAt))
  if (secs < 60) return `${secs}s`
  if (secs < 3600) return `${Math.round(secs / 60)}m`
  return `${Math.round(secs / 3600)}h`
}

/** UI-only agents for dashboard preview (not in API). */
export function isDemoAgent(agent) {
  return agent?.config?.preview === true || String(agent?.id || '').startsWith('demo-')
}

const DEMO_HARNESSES = ['hermes', 'claude-code', 'codex', 'opencode']
const DEMO_ROLES = [
  'Research', 'Build', 'Review', 'Ops', 'Deploy', 'Test', 'Sync', 'Index',
  'Watch', 'Plan', 'Draft', 'Lint', 'Ship', 'Probe', 'Audit', 'Cache',
  'Route', 'Parse', 'Fetch', 'Guard', 'Tune', 'Map', 'Scan', 'Relay',
]

/** Preview herd size — keep small so Vercel LED radiance stays crisp. */
export const DEMO_FIELD_COUNT = 6

/** Preview herd — active agents so node view scale is visible. */
export const DEMO_FIELD_AGENTS = Array.from({ length: DEMO_FIELD_COUNT }, (_, i) => {
  const role = DEMO_ROLES[i % DEMO_ROLES.length]
  const n = String(i + 1).padStart(3, '0')
  return {
    id: `demo-agent-${n}`,
    name: `${role}-${n}`,
    harness: DEMO_HARNESSES[i % DEMO_HARNESSES.length],
    model: 'preview',
    provider: 'local',
    status: 'running',
    pid: 91000 + i,
    pgid: 91000 + i,
    process_started_at: Date.now() / 1000 - (60 + i * 17),
    skills: [role.toLowerCase()],
    config: { preview: true },
  }
})

export const DEMO_FIELD_TASKS = DEMO_FIELD_AGENTS.slice(0, 6).map((a, i) => ({
  id: `demo-task-${a.id}`,
  assigned_agent_id: a.id,
  status: 'running',
  current_node: a.skills?.[0] || 'work',
  context: {
    prompt: `Preview workload for ${a.name}`,
    load: 40 + (i * 9) % 50,
    pkt_min: 0.08 + (i % 5) * 0.03,
  },
}))

/** Append preview nodes when the API has no live agents (so active UI is visible). */
export function mergeFieldAgents(apiAgents = []) {
  const hasLive = apiAgents.some((a) => isAgentLive(a.status))
  if (hasLive) return apiAgents
  const ids = new Set(apiAgents.map((a) => a.id))
  const demos = DEMO_FIELD_AGENTS.filter((d) => !ids.has(d.id))
  return [...apiAgents, ...demos]
}

export function mergeFieldTasks(apiTasks = [], fieldAgents = []) {
  if (!fieldAgents.some(isDemoAgent)) return apiTasks
  const ids = new Set(apiTasks.map((t) => t.id))
  const demos = DEMO_FIELD_TASKS.filter((t) => !ids.has(t.id))
  return [...apiTasks, ...demos]
}
