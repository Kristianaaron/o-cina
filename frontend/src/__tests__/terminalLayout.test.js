import { describe, expect, it } from 'vitest'
import {
  createLeaf,
  splitLeaf,
  removeLeaf,
  countLeaves,
  findLeafByAgent,
  listLeaves,
  cycleLeafId,
  paneAgentState,
  createWorkspace,
  getActiveWorkspace,
  upsertActiveWorkspace,
} from '../lib/terminalLayout'

describe('terminalLayout', () => {
  it('splits a leaf and keeps both panes', () => {
    const root = createLeaf('a1')
    const { tree, newLeafId } = splitLeaf(root, root.id, 'horizontal')
    expect(tree.kind).toBe('split')
    expect(countLeaves(tree)).toBe(2)
    expect(newLeafId).toBeTruthy()
  })

  it('collapses after removing a sibling', () => {
    const root = createLeaf('a1')
    const { tree, newLeafId } = splitLeaf(root, root.id, 'vertical')
    const next = removeLeaf(tree, newLeafId)
    expect(next.kind).toBe('leaf')
    expect(next.agentId).toBe('a1')
  })

  it('finds leaf by agent id', () => {
    const root = createLeaf('agent-9')
    expect(findLeafByAgent(root, 'agent-9')?.agentId).toBe('agent-9')
  })

  it('lists leaves in reading order and cycles focus with wrap-around', () => {
    const root = createLeaf('a1')
    const { tree: t1, newLeafId: b } = splitLeaf(root, root.id, 'horizontal')
    const { tree: t2, newLeafId: c } = splitLeaf(t1, b, 'vertical')
    expect(listLeaves(t2).map((l) => l.id)).toEqual([root.id, b, c])
    expect(cycleLeafId(t2, c, 1)).toBe(root.id)
    expect(cycleLeafId(t2, root.id, -1)).toBe(c)
  })

  it('maps agent status for pane chrome', () => {
    expect(paneAgentState('running').key).toBe('working')
    expect(paneAgentState('error').key).toBe('blocked')
    expect(paneAgentState('stopped').key).toBe('idle')
  })

  it('creates and activates named workspaces', () => {
    const a = createWorkspace('Alpha')
    const b = createWorkspace('Beta')
    const state = { activeId: a.id, workspaces: [a, b] }
    expect(getActiveWorkspace(state).name).toBe('Alpha')
    const patched = upsertActiveWorkspace(state, { focusedId: 'x' })
    expect(getActiveWorkspace(patched).focusedId).toBe('x')
    expect(getActiveWorkspace(patched).name).toBe('Alpha')
  })
})
