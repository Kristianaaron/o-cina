/** Immutable helpers for the o-cina pane multiplexer layout. */

import { statusMeta } from './status'

let _seq = 0

export function nextPaneId(prefix = 'pane') {
  _seq += 1
  return `${prefix}_${Date.now().toString(36)}_${_seq}`
}

export function createLeaf(agentId = null) {
  return { kind: 'leaf', id: nextPaneId('leaf'), agentId }
}

export function createSplit(orientation, left, right, sizes = [0.5, 0.5]) {
  return {
    kind: 'split',
    id: nextPaneId('split'),
    orientation, // 'horizontal' = side by side · 'vertical' = stacked
    children: [left, right],
    sizes,
  }
}

const EPS = 1e-6

function equalSizes(n) {
  return Array.from({ length: n }, () => 1 / n)
}

function normSizes(sizes, n) {
  if (!Array.isArray(sizes) || sizes.length !== n) return equalSizes(n)
  const clean = sizes.map((v) => (Number.isFinite(v) && v > 0 ? v : 0))
  const sum = clean.reduce((acc, v) => acc + v, 0)
  if (sum <= EPS) return equalSizes(n)
  return clean.map((v) => v / sum)
}

/**
 * Canonical tree: every split carries `sizes` (fractions summing to 1),
 * same-direction splits are flattened into one n-ary row/column (so dragging
 * a divider can push every pane in that row), and single-child splits collapse.
 */
export function normalizeTree(node) {
  if (!node || node.kind === 'leaf') return node
  const own = normSizes(node.sizes, node.children.length)
  const kids = []
  const sizes = []
  node.children.forEach((child, i) => {
    const c = normalizeTree(child)
    if (!c) return
    if (c.kind === 'split' && c.orientation === node.orientation) {
      c.children.forEach((g, j) => {
        kids.push(g)
        sizes.push(own[i] * c.sizes[j])
      })
    } else {
      kids.push(c)
      sizes.push(own[i])
    }
  })
  if (kids.length === 0) return null
  if (kids.length === 1) return kids[0]
  return { ...node, children: kids, sizes: normSizes(sizes, kids.length) }
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

/**
 * Split a leaf; returns { tree, newLeafId }.
 * Inside a row/column of the same direction the new pane joins that row and
 * takes half of the split pane's space — neighbours keep their size.
 */
export function splitLeaf(node, leafId, orientation, { before = false, leaf = null } = {}) {
  const fresh = leaf || createLeaf(null)
  let placed = false
  const walk = (n) => {
    if (n.kind === 'leaf') {
      if (n.id !== leafId) return n
      placed = true
      return createSplit(orientation, before ? fresh : n, before ? n : fresh)
    }
    const sizes = normSizes(n.sizes, n.children.length)
    if (n.orientation === orientation) {
      const i = n.children.findIndex((c) => c.kind === 'leaf' && c.id === leafId)
      if (i >= 0) {
        placed = true
        const at = before ? i : i + 1
        const children = [...n.children]
        children.splice(at, 0, fresh)
        const nextSizes = [...sizes]
        nextSizes[i] = sizes[i] / 2
        nextSizes.splice(at, 0, sizes[i] / 2)
        return { ...n, children, sizes: nextSizes }
      }
    }
    return { ...n, sizes, children: n.children.map(walk) }
  }
  const tree = normalizeTree(walk(node))
  return { tree, newLeafId: placed ? fresh.id : null }
}

/** Remove a leaf; its space flows back to its siblings, single-child splits collapse. */
export function removeLeaf(node, leafId) {
  if (!node) return null
  if (node.kind === 'leaf') return node.id === leafId ? null : node
  const sizes = normSizes(node.sizes, node.children.length)
  const kids = []
  const kept = []
  node.children.forEach((c, i) => {
    const next = removeLeaf(c, leafId)
    if (next) {
      kids.push(next)
      kept.push(sizes[i])
    }
  })
  if (kids.length === 0) return null
  if (kids.length === 1) return kids[0]
  return normalizeTree({ ...node, children: kids, sizes: normSizes(kept, kids.length) })
}

/** Swap two panes in place (ids travel with them, so their sessions survive). */
export function swapLeaves(node, a, b) {
  const la = findLeaf(node, a)
  const lb = findLeaf(node, b)
  if (!la || !lb || a === b) return node
  return mapTree(node, (leaf) => (leaf.id === a ? lb : leaf.id === b ? la : leaf))
}

/**
 * Drag-to-dock: move `srcId` next to `targetId`.
 * zone: 'left' | 'right' | 'top' | 'bottom' docks beside it; 'center' swaps.
 */
export function moveLeaf(node, srcId, targetId, zone) {
  if (!node || srcId === targetId) return node
  if (zone === 'center') return swapLeaves(node, srcId, targetId)
  const src = findLeaf(node, srcId)
  if (!src || !findLeaf(node, targetId)) return node
  const without = removeLeaf(node, srcId)
  if (!without) return node
  const orientation = zone === 'left' || zone === 'right' ? 'horizontal' : 'vertical'
  const before = zone === 'left' || zone === 'top'
  return splitLeaf(without, targetId, orientation, { before, leaf: src }).tree
}

export function updateSplitSizes(node, splitId, sizes) {
  if (!node || node.kind === 'leaf') return node
  if (node.id === splitId) return { ...node, sizes }
  return { ...node, children: node.children.map((c) => updateSplitSizes(c, splitId, sizes)) }
}

/** Equal shares for one split (or every split when `splitId` is omitted). */
export function equalizeSplits(node, splitId = null) {
  if (!node || node.kind === 'leaf') return node
  const self = !splitId || node.id === splitId
  return {
    ...node,
    sizes: self ? equalSizes(node.children.length) : normSizes(node.sizes, node.children.length),
    children: node.children.map((c) => equalizeSplits(c, splitId)),
  }
}

/** Minimum pixels a subtree needs along an axis. */
export function minExtent(node, axis, minPane, gap) {
  if (node.kind === 'leaf') return minPane[axis]
  const along = (node.orientation === 'horizontal' ? 'w' : 'h') === axis
  const mins = node.children.map((c) => minExtent(c, axis, minPane, gap))
  return along
    ? mins.reduce((a, b) => a + b, 0) + gap * (node.children.length - 1)
    : Math.max(...mins)
}

/**
 * Move divider `index` by `delta` (fraction of the row). Space is taken from
 * the panes on the far side in order, so a pane at its minimum pushes the next.
 */
export function resizeSizes(sizes, index, delta, mins = []) {
  const next = [...sizes]
  if (!delta) return next
  const n = next.length
  const grow = delta > 0 ? index : index + 1
  const order = []
  if (delta > 0) for (let j = index + 1; j < n; j += 1) order.push(j)
  else for (let j = index; j >= 0; j -= 1) order.push(j)
  let remaining = Math.abs(delta)
  for (const j of order) {
    const room = Math.max(0, next[j] - (mins[j] || 0))
    const take = Math.min(room, remaining)
    next[j] -= take
    remaining -= take
    if (remaining <= EPS) break
  }
  next[grow] += Math.abs(delta) - remaining
  return next
}

/** Pixel rects for every pane and divider inside `rect`. */
export function computeLayout(root, rect, gap = 6) {
  const leaves = new Map()
  const dividers = []
  const walk = (n, r) => {
    if (n.kind === 'leaf') {
      leaves.set(n.id, r)
      return
    }
    const horiz = n.orientation === 'horizontal'
    const sizes = normSizes(n.sizes, n.children.length)
    const avail = Math.max(0, (horiz ? r.w : r.h) - gap * (n.children.length - 1))
    let pos = horiz ? r.x : r.y
    n.children.forEach((c, i) => {
      const len = avail * sizes[i]
      walk(c, horiz ? { x: pos, y: r.y, w: len, h: r.h } : { x: r.x, y: pos, w: r.w, h: len })
      pos += len
      if (i < n.children.length - 1) {
        dividers.push({
          id: `${n.id}:${i}`,
          splitId: n.id,
          index: i,
          orientation: n.orientation,
          available: avail,
          rect: horiz ? { x: pos, y: r.y, w: gap, h: r.h } : { x: r.x, y: pos, w: r.w, h: gap },
        })
        pos += gap
      }
    })
  }
  if (root) walk(root, rect)
  return { leaves, dividers }
}

/** Splits from the root down to `leafId`, with the child index taken at each. */
export function pathToLeaf(node, leafId, path = []) {
  if (!node) return null
  if (node.kind === 'leaf') return node.id === leafId ? path : null
  for (let i = 0; i < node.children.length; i += 1) {
    const hit = pathToLeaf(node.children[i], leafId, [...path, { split: node, index: i }])
    if (hit) return hit
  }
  return null
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

/** Leaves in reading order (left→right, top→bottom). */
export function listLeaves(node, out = []) {
  if (!node) return out
  if (node.kind === 'leaf') {
    out.push(node)
    return out
  }
  node.children.forEach((c) => listLeaves(c, out))
  return out
}

/** Leaf id `step` places away from `leafId`, wrapping around. */
export function cycleLeafId(node, leafId, step = 1) {
  const leaves = listLeaves(node)
  if (!leaves.length) return null
  const at = Math.max(0, leaves.findIndex((l) => l.id === leafId))
  return leaves[(at + step + leaves.length) % leaves.length].id
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

/** Map agent process status → pane chrome (working / idle / blocked / offline). */
export function paneAgentState(status) {
  const meta = statusMeta(status)
  return { ...meta, label: meta.key }
}

const STORAGE_KEY = 'ocina.paneLayout.v1'
const WORKSPACE_KEY = 'ocina.paneWorkspaces.v1'
const WORKSPACE_KEY_LEGACY = 'ocina.terminalWorkspaces.v1'

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

/** Named pane workspace (saved multiplexer layout). */
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
    const raw = localStorage.getItem(WORKSPACE_KEY) || localStorage.getItem(WORKSPACE_KEY_LEGACY)
    if (raw) {
      const data = JSON.parse(raw)
      if (data?.workspaces?.length) {
        return {
          activeId: data.activeId || data.workspaces[0].id,
          workspaces: data.workspaces.map((w) => ({
            ...w,
            tree: normalizeTree(w.tree) || createLeaf(null),
          })),
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
