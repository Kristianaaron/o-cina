import { describe, expect, it } from 'vitest'
import {
  buildConnections,
  isAgentLive,
  layoutAgents,
  mergeFieldAgents,
  shortLabel,
  truncate,
} from '../lib/agentField'
import { createAgentForceSim, seedForceNodes, spacingForCount } from '../lib/forceGraph'

describe('agentField', () => {
  it('marks running agents as live', () => {
    expect(isAgentLive('running')).toBe(true)
    expect(isAgentLive('stopped')).toBe(false)
  })

  it('layouts live and idle agents separately', () => {
    const agents = [
      { id: '1', name: 'A', status: 'running' },
      { id: '2', name: 'B', status: 'stopped' },
      { id: '3', name: 'C', status: 'running' },
    ]
    const pos = layoutAgents(agents)
    expect(pos.get('1').y).toBeLessThan(pos.get('2').y)
    expect(pos.get('3').y).toBeLessThan(pos.get('2').y)
  })

  it('builds live mesh when multiple agents are running', () => {
    const agents = [
      { id: 'a', status: 'running' },
      { id: 'b', status: 'running' },
      { id: 'c', status: 'running' },
    ]
    const edges = buildConnections(agents, [], [])
    expect(edges.length).toBeGreaterThan(0)
  })

  it('truncates and short-labels', () => {
    expect(shortLabel('Research Agent')).toMatch(/RA/i)
    expect(truncate('hello world this is long', 10).endsWith('…')).toBe(true)
  })

  it('adds preview agents when API has no live agents', () => {
    const merged = mergeFieldAgents([{ id: 'real-1', status: 'stopped' }])
    expect(merged.filter((a) => a.id?.startsWith('demo-') && a.status === 'running')).toHaveLength(6)
  })

  it('skips preview agents when API already has live agents', () => {
    const merged = mergeFieldAgents([{ id: 'real-1', status: 'running' }])
    expect(merged.some((a) => a.id?.startsWith('demo-'))).toBe(false)
  })

  it('keeps live mesh linear in node count', () => {
    const agents = Array.from({ length: 200 }, (_, i) => ({
      id: `a${i}`,
      status: 'running',
    }))
    const edges = buildConnections(agents, [], [])
    expect(edges.length).toBeLessThanOrEqual(400)
    expect(edges.length).toBeGreaterThanOrEqual(200)
  })
})

describe('forceGraph', () => {
  it('seeds agents on a ring', () => {
    const agents = Array.from({ length: 6 }, (_, i) => ({ id: `a${i}` }))
    const nodes = seedForceNodes(agents)
    expect(nodes).toHaveLength(6)
    const xs = nodes.map((n) => n.x)
    expect(Math.max(...xs) - Math.min(...xs)).toBeGreaterThan(8)
  })

  it('keeps a small field compact but non-overlapping', () => {
    const agents = Array.from({ length: 6 }, (_, i) => ({
      id: `a${i}`,
      status: 'running',
    }))
    const edges = buildConnections(agents, [], [])
    const handle = createAgentForceSim(agents, edges, { drift: false })
    for (let i = 0; i < 80; i += 1) handle.tick()
    const pos = [...handle.nodes]
    let minDist = Infinity
    let maxDist = 0
    for (let i = 0; i < pos.length; i += 1) {
      for (let j = i + 1; j < pos.length; j += 1) {
        const d = Math.hypot(pos[i].x - pos[j].x, pos[i].y - pos[j].y)
        minDist = Math.min(minDist, d)
        maxDist = Math.max(maxDist, d)
      }
    }
    expect(minDist).toBeGreaterThan(5)
    // Compact cluster — not spread across the whole field
    expect(maxDist).toBeLessThan(55)
    handle.stop()
  })

  it('opens spacing as the field grows toward 100', () => {
    const small = spacingForCount(6)
    const large = spacingForCount(100)
    expect(large.collideR).toBeGreaterThan(small.collideR)
    expect(large.linkDist).toBeGreaterThan(small.linkDist)
    expect(Math.abs(large.charge)).toBeGreaterThan(Math.abs(small.charge))
  })
})
