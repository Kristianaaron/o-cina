import { describe, expect, it } from 'vitest'
import { depthFor, depthStyle, floatOffset } from '../lib/depth'

describe('node depth', () => {
  it('is stable per id and bounded', () => {
    const a = depthFor('agent-1')
    expect(depthFor('agent-1')).toEqual(a)
    for (const id of ['x', 'y', 'agent-42', 'a-much-longer-agent-id']) {
      const d = depthFor(id)
      expect(d.z).toBeGreaterThanOrEqual(-1)
      expect(d.z).toBeLessThanOrEqual(1)
      expect(d.period).toBeGreaterThan(6)
    }
  })

  it('makes near nodes larger and stacked above far ones', () => {
    expect(depthStyle(1).scale).toBeGreaterThan(depthStyle(-1).scale)
    expect(depthStyle(1).zIndex).toBeGreaterThan(depthStyle(-1).zIndex)
  })

  it('moves near and far nodes in opposite directions under tilt', () => {
    const near = { z: 1, phase: 0, period: 8, amp: 4 }
    const far = { ...near, z: -1 }
    const tilt = { x: 1, y: 0 }
    const opts = { motion: false }
    expect(floatOffset(near, 0, tilt, opts).x).toBeGreaterThan(0)
    expect(floatOffset(far, 0, tilt, opts).x).toBeLessThan(0)
    expect(floatOffset({ ...near, z: 0 }, 0, tilt, opts).x).toBe(0)
  })
})
