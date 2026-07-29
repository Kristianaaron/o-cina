/** Immutable helpers for a Herdr-style binary-tree terminal layout. */

let _seq = 0

export function nextPaneId(prefix = 'pane') {
  _seq += 1
  return `${prefix}_${Date.now().toString(36)}_${_seq}`
}

export function createLeaf(agentId = null) {
  return { kind: 'leaf', id: nextPaneId('leaf'), agentId }
}

export function createSplit(orientation, left, right) {
  return {
    kind: 'split',
    id: nextPaneId('split'),
    orientation, // 'horizontal' | 'vertical' (Group orientation)
    children: [left, right],
  }
}

export function countLeaves(node) {
  if (!node) return 0
  if (node.kind === 'leaf') return 1
  return node.children.reduce((n, c) => n + countLeaves(c), 0)
}

export function mapTree(node, fn) {
  if (!node) return node
  if (node.kind === 'leaf') return fn(node)
  return { ...node, children: node.children.map((c) => mapTree(c, fn)) }
}

export function updateLeaf(node, leafId, patch) {
  return mapTree(node, (leaf) => (leaf.id === leafId ? { ...leaf, ...patch } : leaf))
}

export function findLeaf(node, leafId) {
  if (!node) return null
  if (node.kind === 'leaf') return node.id === leafId ? node : null
  for (const child of node.children) {
    const hit = findLeaf(child, leafId)
    if (hit) return hit
  }
  return null
}

export function findLeafByAgent(node, agentId) {
  if (!node || !agentId) return null
  if (node.kind === 'leaf') return node.agentId === agentId ? node : null
  for (const child of node.children) {
    const hit = findLeafByAgent(child, agentId)
    if (hit) return hit
  }
  return null
}

/** Split a leaf; returns { tree, newLeafId }. */
export function splitLeaf(node, leafId, orientation) {
  let newLeafId = null
  const tree = (function walk(n) {
    if (n.kind === 'leaf') {
      if (n.id !== leafId) return n
      const fresh = createLeaf(null)
      newLeafId = fresh.id
      return createSplit(orientation, n, fresh)
    }
    return { ...n, children: n.children.map(walk) }
  })(node)
  return { tree, newLeafId }
}

/** Remove a leaf; collapses single-child splits. */
export function removeLeaf(node, leafId) {
  if (!node) return null
  if (node.kind === 'leaf') return node.id === leafId ? null : node

  const kids = node.children.map((c) => removeLeaf(c, leafId)).filter(Boolean)
  if (kids.length === 0) return null
  if (kids.length === 1) return kids[0]
  return { ...node, children: kids }
}

export function firstLeafId(node) {
  if (!node) return null
  if (node.kind === 'leaf') return node.id
  for (const child of node.children) {
    const id = firstLeafId(child)
    if (id) return id
  }
  return null
}

export function collectAgentIds(node, set = new Set()) {
  if (!node) return set
  if (node.kind === 'leaf') {
    if (node.agentId) set.add(node.agentId)
    return set
  }
  node.children.forEach((c) => collectAgentIds(c, set))
  return set
}

/** Map O-cina agent status → Herdr-like semantic state. */
export function herdState(status) {
  switch (status) {
    case 'running':
    case 'starting':
      return { key: 'working', label: 'working', dot: 'bg-amber-400', text: 'text-amber-300' }
    case 'stopping':
      return { key: 'blocked', label: 'blocked', dot: 'bg-orange-400', text: 'text-orange-300' }
    case 'error':
      return { key: 'blocked', label: 'blocked', dot: 'bg-red-400', text: 'text-red-300' }
    case 'offline':
      return { key: 'offline', label: 'offline', dot: 'bg-zinc-600', text: 'text-zinc-500' }
    case 'stopped':
    case 'registered':
    default:
      return { key: 'idle', label: 'idle', dot: 'bg-zinc-500', text: 'text-zinc-400' }
  }
}

const STORAGE_KEY = 'ocina.terminalHerd.v1'
const WORKSPACE_KEY = 'ocina.terminalWorkspaces.v1'

export function loadLayout() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function saveLayout(tree, focusedId) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ tree, focusedId }))
  } catch {
    // ignore
  }
}

/** cmux / Herdr-style named workspace (saved pane layout). */
export function createWorkspace(name = 'Workspace', tree = null, focusedId = null) {
  const root = tree || createLeaf(null)
  return {
    id: nextPaneId('ws'),
    name: String(name || 'Workspace').trim() || 'Workspace',
    tree: root,
    focusedId: focusedId || firstLeafId(root),
    updatedAt: Date.now(),
  }
}

export function loadWorkspaces() {
  try {
    const raw = localStorage.getItem(WORKSPACE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (data?.workspaces?.length) {
        return {
          activeId: data.activeId || data.workspaces[0].id,
          workspaces: data.workspaces,
        }
      }
    }
  } catch {
    // fall through to migrate
  }

  // Migrate legacy single-layout storage into a default workspace
  const legacy = loadLayout()
  const ws = createWorkspace(
    'Default',
    legacy?.tree || createLeaf(null),
    legacy?.focusedId || null,
  )
  const state = { activeId: ws.id, workspaces: [ws] }
  saveWorkspaces(state)
  return state
}

export function saveWorkspaces(state) {
  try {
    localStorage.setItem(WORKSPACE_KEY, JSON.stringify(state))
    const active = state.workspaces.find((w) => w.id === state.activeId)
    if (active) saveLayout(active.tree, active.focusedId)
  } catch {
    // ignore
  }
}

export function getActiveWorkspace(state) {
  if (!state?.workspaces?.length) return null
  return state.workspaces.find((w) => w.id === state.activeId) || state.workspaces[0]
}

export function upsertActiveWorkspace(state, patch) {
  const active = getActiveWorkspace(state)
  if (!active) return state
  const next = {
    ...state,
    workspaces: state.workspaces.map((w) => (
      w.id === active.id
        ? { ...w, ...patch, updatedAt: Date.now() }
        : w
    )),
  }
  return next
}
