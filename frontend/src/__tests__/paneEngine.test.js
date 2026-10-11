import { describe, expect, it } from 'vitest'
import {
  computeLayout,
  createLeaf,
  equalizeSplits,
  listLeaves,
  minExtent,
  moveLeaf,
  normalizeTree,
  removeLeaf,
  resizeSizes,
  splitLeaf,
} from '../lib/terminalLayout'

const ids = (tree) => listLeaves(tree).map((l) => l.id)
const close = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1e-9)

function threeColumns() {
  const a = createLeaf('a')
  const { tree: t1, newLeafId: b } = splitLeaf(a, a.id, 'horizontal')
  const { tree: t2, newLeafId: c } = splitLeaf(t1, b, 'horizontal')
  return { tree: t2, a: a.id, b, c }
}

describe('pane engine', () => {
  it('keeps same-direction splits in one flat row and halves only the split pane', () => {
    const { tree } = threeColumns()
    expect(tree.kind).toBe('split')
    expect(tree.children).toHaveLength(3)
    expect(tree.sizes).toEqual([0.5, 0.25, 0.25])
  })

  it('flattens legacy nested trees and fills in missing sizes', () => {
    const legacy = {
      kind: 'split', id: 's1', orientation: 'horizontal',
      children: [
        createLeaf('a'),
        { kind: 'split', id: 's2', orientation: 'horizontal', children: [createLeaf('b'), createLeaf('c')] },
      ],
    }
    const t = normalizeTree(legacy)
    expect(t.children).toHaveLength(3)
    expect(t.sizes).toEqual([0.5, 0.25, 0.25])
  })

  it('returns a removed pane’s space to its siblings', () => {
    const { tree, b } = threeColumns()
    const next = removeLeaf(tree, b)
    expect(next.children).toHaveLength(2)
    close(next.sizes[0] + next.sizes[1], 1)
    close(next.sizes[0] / next.sizes[1], 2)
  })

  it('pushes the next pane once a neighbour hits its minimum', () => {
    const next = resizeSizes([0.4, 0.3, 0.3], 0, 0.4, [0.1, 0.1, 0.1])
    close(next[0], 0.8)
    close(next[1], 0.1)
    close(next[2], 0.1)
    // can't go past every minimum
    const capped = resizeSizes([0.4, 0.3, 0.3], 0, 0.9, [0.1, 0.1, 0.1])
    close(capped[0], 0.8)
    // dragging the other way shrinks the left side
    const left = resizeSizes([0.4, 0.3, 0.3], 1, -0.5, [0.1, 0.1, 0.1])
    close(left[2], 0.8)
    close(left[0], 0.1)
  })

  it('lays panes out edge to edge with gaps between them', () => {
    const { tree, a, c } = threeColumns()
    const { leaves, dividers } = computeLayout(tree, { x: 0, y: 0, w: 412, h: 300 }, 6)
    expect(dividers).toHaveLength(2)
    close(leaves.get(a).w, 200)
    const last = leaves.get(c)
    close(last.x + last.w, 412)
  })

  it('docks a dragged pane beside a target and swaps on center', () => {
    const { tree, a, b, c } = threeColumns()
    const docked = moveLeaf(tree, c, a, 'bottom')
    expect(ids(docked)).toEqual([a, c, b])
    expect(docked.children[0].orientation).toBe('vertical')
    const swapped = moveLeaf(tree, a, c, 'center')
    expect(ids(swapped)).toEqual([c, b, a])
    expect(swapped.sizes).toEqual(tree.sizes)
  })

  it('measures minimum extent through nested rows', () => {
    const { tree } = threeColumns()
    expect(minExtent(tree, 'w', { w: 100, h: 50 }, 6)).toBe(312)
    expect(minExtent(tree, 'h', { w: 100, h: 50 }, 6)).toBe(50)
    expect(equalizeSplits(tree).sizes).toEqual([1 / 3, 1 / 3, 1 / 3])
  })
})
