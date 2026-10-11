/**
 * Obsidian-style force-directed layout in field-% space (0–100).
 * Stays gently warm so nodes keep a soft organic drift after settling.
 *
 * Spacing scales with field size: a handful stay close; ~100 get more air.
 */

import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from 'd3-force'

/**
 * Tune forces by node count.
 * n≈6 → compact cluster; n≈100 → clearer gaps and a wider cloud.
 */
export function spacingForCount(n) {
  const count = Math.max(1, n)
  // 0 at ≤6, 1 at ≥100
  const t = Math.min(1, Math.max(0, (count - 6) / 94))
  const e = t * t // ease-in so mid-size fields don't blow out early
  return {
    linkDist: 13 + e * 20,
    collideR: 6.2 + e * 5.2,
    charge: -(70 + e * 360),
    seedRadius: 9 + e * 26,
    centerStrength: 0.11 - e * 0.07,
    axisStrength: 0.035 - e * 0.022,
    distanceMax: 36 + e * 50,
  }
}

/** Deterministic seed on a ring so the first paint isn't a pile. */
export function seedForceNodes(agents, { cx = 50, cy = 48, radius } = {}) {
  const n = agents.length
  if (n === 0) return []
  const r = radius ?? spacingForCount(n).seedRadius
  if (n === 1) {
    return [{ id: agents[0].id, x: cx, y: cy, vx: 0, vy: 0 }]
  }
  return agents.map((a, i) => {
    const t = (i / n) * Math.PI * 2 - Math.PI / 2
    const jitter = ((i * 17) % 7) - 3
    return {
      id: a.id,
      x: cx + Math.cos(t) * r + jitter * 0.12,
      y: cy + Math.sin(t) * (r * 0.72) + jitter * 0.1,
      vx: 0,
      vy: 0,
    }
  })
}

export function positionsFromNodes(nodes) {
  const map = new Map()
  for (const n of nodes) {
    map.set(n.id, { x: n.x, y: n.y })
  }
  return map
}

function applySpacingForces(sim, n) {
  const s = spacingForCount(n)
  const link = sim.force('link')
  if (link) {
    link.distance((l) => (l.kind === 'workflow' ? s.linkDist * 0.85 : s.linkDist))
  }
  sim.force('charge')?.strength(s.charge).distanceMax(s.distanceMax)
  sim.force('collide')?.radius(s.collideR)
  sim.force('center')?.strength(s.centerStrength)
  sim.force('x')?.strength(s.axisStrength)
  sim.force('y')?.strength(s.axisStrength * 1.15)
  return s
}

/**
 * Build a live simulation. Call stop() on teardown.
 * Coordinates are percentages of the field (same as AgentNode left/top %).
 */
export function createAgentForceSim(agents, edges = [], {
  /** Keep alpha slightly warm — perpetual organic micro-motion */
  drift = true,
} = {}) {
  const spacing = spacingForCount(agents.length)
  const nodes = seedForceNodes(agents, { radius: spacing.seedRadius })
  const byId = new Map(nodes.map((n) => [n.id, n]))

  const links = edges
    .map((e) => {
      if (!byId.has(e.from) || !byId.has(e.to)) return null
      return { source: e.from, target: e.to, kind: e.kind }
    })
    .filter(Boolean)

  const sim = forceSimulation(nodes)
    .force(
      'link',
      forceLink(links)
        .id((d) => d.id)
        .distance((l) => (l.kind === 'workflow' ? spacing.linkDist * 0.85 : spacing.linkDist))
        .strength((l) => (l.kind === 'workflow' ? 0.7 : 0.5)),
    )
    .force(
      'charge',
      forceManyBody()
        .strength(spacing.charge)
        .distanceMin(4)
        .distanceMax(spacing.distanceMax),
    )
    .force(
      'collide',
      forceCollide()
        .radius(spacing.collideR)
        .strength(0.92)
        .iterations(2),
    )
    .force('center', forceCenter(50, 48).strength(spacing.centerStrength))
    .force('x', forceX(50).strength(spacing.axisStrength))
    .force('y', forceY(48).strength(spacing.axisStrength * 1.15))
    .velocityDecay(0.42)
    .alphaDecay(0.014)
    .alphaMin(0.001)

  if (drift) {
    // Never fully freeze — soft Obsidian-like residual motion
    sim.alphaTarget(0.035)
  }

  return {
    sim,
    nodes,
    links,
    tick() {
      sim.tick()
      // Soft wander — tiny curl so settled graphs still breathe
      if (drift) {
        const t = performance.now() * 0.00035
        for (let i = 0; i < nodes.length; i += 1) {
          const node = nodes[i]
          const phase = i * 1.7
          node.vx += Math.sin(t + phase) * 0.004
          node.vy += Math.cos(t * 0.9 + phase) * 0.004
          // Keep inside a soft field margin
          node.x = Math.min(94, Math.max(6, node.x))
          node.y = Math.min(90, Math.max(10, node.y))
        }
      }
      return positionsFromNodes(nodes)
    },
    reheat(alpha = 0.35) {
      sim.alpha(Math.max(sim.alpha(), alpha)).restart()
    },
    stop() {
      sim.stop()
    },
  }
}

/**
 * Sync simulation membership when agents/edges change; preserve positions.
 */
export function syncForceSim(handle, agents, edges) {
  if (!handle) return createAgentForceSim(agents, edges)

  const { sim, nodes } = handle
  const posKeep = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y, vx: n.vx, vy: n.vy }]))
  const ids = new Set(agents.map((a) => a.id))

  for (let i = nodes.length - 1; i >= 0; i -= 1) {
    if (!ids.has(nodes[i].id)) nodes.splice(i, 1)
  }

  const existing = new Set(nodes.map((n) => n.id))
  const newcomers = agents.filter((a) => !existing.has(a.id))
  if (newcomers.length) {
    const seeded = seedForceNodes(newcomers, {
      radius: spacingForCount(agents.length).seedRadius,
    })
    for (const n of seeded) {
      const keep = posKeep.get(n.id)
      nodes.push(keep ? { ...n, ...keep } : n)
    }
  }

  for (const n of nodes) {
    const keep = posKeep.get(n.id)
    if (keep) {
      n.x = keep.x
      n.y = keep.y
      n.vx = keep.vx || 0
      n.vy = keep.vy || 0
    }
  }

  const byId = new Map(nodes.map((n) => [n.id, n]))
  const links = edges
    .map((e) => {
      if (!byId.has(e.from) || !byId.has(e.to)) return null
      return { source: byId.get(e.from), target: byId.get(e.to), kind: e.kind }
    })
    .filter(Boolean)

  sim.nodes(nodes)
  sim.force('link').links(links)
  applySpacingForces(sim, nodes.length)
  handle.links = links
  handle.reheat(0.4)
  return handle
}
