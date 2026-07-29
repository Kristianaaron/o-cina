import { describe, expect, it } from 'vitest'
import {
  agentAvatarUrl,
  SPRITE_VARIANT_COUNT,
} from '../lib/agentField'
import {
  buildCreatureGrid,
  catalogMinPairDistance,
  getSpriteCatalog,
  spriteVariantForAgent,
} from '../lib/bitSprites'

describe('bitSprites', () => {
  it('exposes at least 100 variants', () => {
    expect(SPRITE_VARIANT_COUNT).toBeGreaterThanOrEqual(100)
  })

  it('builds a unique catalog of silhouettes', () => {
    const catalog = getSpriteCatalog()
    expect(catalog).toHaveLength(SPRITE_VARIANT_COUNT)
    expect(new Set(catalog).size).toBe(SPRITE_VARIANT_COUNT)
  })

  it('keeps variants visually far apart', () => {
    expect(catalogMinPairDistance()).toBeGreaterThanOrEqual(28)
  })

  it('paints ink and punched detail on every variant', () => {
    for (let i = 0; i < SPRITE_VARIANT_COUNT; i += 1) {
      const g = buildCreatureGrid(i)
      let ink = 0
      let holes = 0
      let minX = 16
      let maxX = -1
      let minY = 16
      let maxY = -1
      for (let y = 0; y < 16; y += 1) {
        for (let x = 0; x < 16; x += 1) {
          if (g[y][x]) {
            ink += 1
            minX = Math.min(minX, x)
            maxX = Math.max(maxX, x)
            minY = Math.min(minY, y)
            maxY = Math.max(maxY, y)
          }
        }
      }
      expect(ink).toBeGreaterThan(24)
      for (let y = minY; y <= maxY; y += 1) {
        for (let x = minX; x <= maxX; x += 1) {
          if (!g[y][x]) holes += 1
        }
      }
      expect(holes).toBeGreaterThanOrEqual(5)
    }
  })

  it('maps agents to stable sprite variants and data URLs', () => {
    const a = { id: 'demo-agent-001', name: 'Research-001' }
    const b = { id: 'demo-agent-002', name: 'Build-002' }
    expect(spriteVariantForAgent(a)).not.toBe(spriteVariantForAgent(b))
    const url = agentAvatarUrl(a)
    expect(url.startsWith('data:image/svg+xml')).toBe(true)
    expect(agentAvatarUrl(a)).toBe(url)
  })
})
