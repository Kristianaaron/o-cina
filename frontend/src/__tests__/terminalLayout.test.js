import { describe, expect, it } from 'vitest'
import {
  createLeaf,
  splitLeaf,
  removeLeaf,
  countLeaves,
  findLeafByAgent,
  herdState,
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

  it('maps agent status to herd semantics', () => {
    expect(herdState('running').key).toBe('working')
    expect(herdState('error').key).toBe('blocked')
    expect(herdState('stopped').key).toBe('idle')
  })
})
