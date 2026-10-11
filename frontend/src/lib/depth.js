/**
 * Stable pseudo-3D placement for the node field.
 * Every agent gets a depth (-1 far … 1 near) and a float rhythm from its id,
 * so the constellation keeps the same shape across reloads.
 */

function hash(str = '') {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function depthFor(id) {
  const h = hash(String(id))
  const unit = (shift) => ((h >>> shift) & 0xff) / 255
  return {
    z: unit(0) * 2 - 1,
    phase: unit(8) * Math.PI * 2,
    period: 6.5 + unit(16) * 4, // seconds per bob
    amp: 3 + unit(24) * 3.5, // px
  }
}

/** Scale / stacking for a depth value (never opacity — node discs stay solid). */
export function depthStyle(z) {
  return {
    scale: 1 + z * 0.16,
    zIndex: Math.round((z + 1) * 10),
  }
}

/**
 * Screen-space offset (px) for one node at time `t` (seconds):
 * parallax against the pointer tilt (-1…1 per axis) plus a slow vertical bob.
 */
export function floatOffset(d, t, tilt, { parallax = 22, motion = true } = {}) {
  const bob = motion ? Math.sin((t / d.period) * Math.PI * 2 + d.phase) * d.amp : 0
  const sway = motion ? Math.cos((t / (d.period * 1.7)) * Math.PI * 2 + d.phase) * d.amp * 0.35 : 0
  return {
    x: d.z * parallax * tilt.x + sway,
    y: d.z * parallax * tilt.y + bob,
  }
}
